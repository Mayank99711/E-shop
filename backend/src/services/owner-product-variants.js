function failure(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

function combinationKey(values) {
  return values.length
    ? values
        .map(({ attributeId, valueId }) => `${attributeId}:${valueId}`)
        .sort()
        .join("|")
    : "default";
}

export async function createProductVariants(
  transaction,
  shopId,
  productId,
  variants,
) {
  const skuSet = new Set(variants.map(({ sku }) => sku));
  const combinationKeys = variants.map(({ values }) => combinationKey(values));
  if (skuSet.size !== variants.length)
    throw failure(409, "DUPLICATE_SKU", "Each variant must have a unique SKU.");
  if (new Set(combinationKeys).size !== combinationKeys.length)
    throw failure(
      409,
      "DUPLICATE_VARIANT",
      "Each product variant must have a unique option combination.",
    );

  const existingSkus = await transaction.productVariant.findMany({
    where: {
      shopId,
      OR: variants.map(({ sku }) => ({
        sku: { equals: sku, mode: "insensitive" },
      })),
    },
    select: { sku: true },
  });
  if (existingSkus.length)
    throw failure(
      409,
      "DUPLICATE_SKU",
      "A variant with one of those SKUs already exists in your shop.",
    );
  const existingCombinations = await transaction.productVariant.findMany({
    where: { productId },
    select: { combinationKey: true },
  });
  if (
    combinationKeys.some((key) =>
      existingCombinations.some((variant) => variant.combinationKey === key),
    )
  ) {
    throw failure(
      409,
      "DUPLICATE_VARIANT",
      "That option combination already exists for this product.",
    );
  }

  const attributeIds = [
    ...new Set(
      variants.flatMap(({ values }) =>
        values.map(({ attributeId }) => attributeId),
      ),
    ),
  ];
  const valueIds = [
    ...new Set(
      variants.flatMap(({ values }) => values.map(({ valueId }) => valueId)),
    ),
  ];
  if (valueIds.length) {
    const [attributes, values] = await Promise.all([
      transaction.variantAttribute.findMany({
        where: { id: { in: attributeIds }, isActive: true },
        select: { id: true },
      }),
      transaction.variantAttributeValue.findMany({
        where: { id: { in: valueIds }, isActive: true },
        select: { id: true, attributeId: true },
      }),
    ]);
    const activeAttributeIds = new Set(attributes.map(({ id }) => id));
    const activeValues = new Map(
      values.map(({ id, attributeId }) => [id, attributeId]),
    );
    for (const variant of variants)
      for (const value of variant.values) {
        if (
          !activeAttributeIds.has(value.attributeId) ||
          activeValues.get(value.valueId) !== value.attributeId
        ) {
          throw failure(
            400,
            "INVALID_VARIANT_OPTION",
            "Choose active values that belong to their selected attributes.",
          );
        }
      }
  }

  const created = [];
  for (let index = 0; index < variants.length; index += 1) {
    const variant = variants[index];
    created.push(
      await transaction.productVariant.create({
        data: {
          productId,
          shopId,

          sku: variant.sku,
          combinationKey: combinationKeys[index],

          variantName: variant.variantName?.trim() || null,
          wholesalePrice: variant.wholesalePrice ?? null,
          markedPrice: variant.markedPrice ?? null,

          price: variant.price,
          discountPrice: variant.discountPrice ?? null,
          stock: variant.stock,

          values: {
            create: variant.values,
          },
        },
        include: { values: { include: { attribute: true, value: true } } },
      }),
    );
  }
  return created;
}
