import { Fragment, useMemo, useState, useEffect } from 'react';
import { resolveMediaUrl } from '../../../services/shopOwner/index.js';
import { shopOwnerApi } from '../../../services/shopOwner/index.js';
import Modal from '../../../components/common/Modal.jsx';
import { ListPagination } from '../../../components/shopOwner/ListPagination.jsx';
import { maxProductImages, maxImagesPerUpload, maxProductImageBytes, productImageTypes } from '../config/productConfig.js';

export function ProductsSection({ products, options, busy, submit, reload, error, loading = false }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [imageUrls, setImageUrls] = useState("");
  const [selectedImages, setSelectedImages] = useState([]);
  const [imagePreviews, setImagePreviews] = useState([]);
  const [imageSelectionError, setImageSelectionError] = useState("");
  const [uploadingImages, setUploadingImages] = useState(false);
  const [uploadingProductId, setUploadingProductId] = useState("");
  const [createdProductPendingImageUploadId, setCreatedProductPendingImageUploadId] = useState("");
  const [editImageFiles, setEditImageFiles] = useState([]);
  const [editImagePreviews, setEditImagePreviews] = useState([]);
  const [editingProductDetailsSavedId, setEditingProductDetailsSavedId] = useState("");
  const [sku, setSku] = useState("");
  const [price, setPrice] = useState("");
  const [discountPrice, setDiscountPrice] = useState("");
  const [stock, setStock] = useState("0");
  const [hsnCode, setHsnCode] = useState("");
  // New product information
const [masterSku, setMasterSku] = useState("");
const [shortDescription, setShortDescription] = useState("");
const [basePrice, setBasePrice] = useState("");
const [commissionPercent, setCommissionPercent] = useState("");

// Dynamic product variants
const createEmptyVariant = () => ({
  id: crypto.randomUUID(),
  variantName: "",
  sku: "",
  color: "",
  packSize: "",
  size: "",
  storageCapacity: "",
  weight: "",
  wholesalePrice: "",
  markedPrice: "",
  price: "",
  discountPrice: "",
  stock: "0",
  attributeId: "",
  valueId: "",
  listingStatus: "ACTIVE"
});

const [productVariants, setProductVariants] = useState([
  createEmptyVariant()
]);

function addProductVariant() {
  setProductVariants((previous) => [
    ...previous,
    createEmptyVariant()
  ]);
}

function removeProductVariant(id) {
  setProductVariants((previous) =>
    previous.length > 1
      ? previous.filter((variant) => variant.id !== id)
      : previous
  );
}

function updateProductVariant(id, field, value) {
  setProductVariants((previous) =>
    previous.map((variant) =>
      variant.id === id
        ? {
            ...variant,
            [field]: value,
            ...(field === "attributeId" ? { valueId: "" } : {})
          }
        : variant
    )
  );
}
  const [gstRate, setGstRate] = useState("");
  const [taxInclusive, setTaxInclusive] = useState(false);
  const [attributeId, setAttributeId] = useState("");
  const [valueId, setValueId] = useState("");
  const [variantProduct, setVariantProduct] = useState("");
  const [variantAttributeId, setVariantAttributeId] = useState("");
  const [editingProduct, setEditingProduct] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sortOrder, setSortOrder] = useState("UPDATED_DESC");
  const [page, setPage] = useState(1);
  const [expandedProductId, setExpandedProductId] = useState(null);
  const [productStep, setProductStep] = useState(1);
  const [createProductOpen, setCreateProductOpen] = useState(false);
  const pageSize = 10;

  const selectedAttribute = options.attributes.find(({ id }) => id === attributeId);
  const selectedValues = selectedAttribute?.values || [];
  const selectedVariantAttribute = options.attributes.find(({ id }) => id === variantAttributeId);
  useEffect(() => {
    const previews = selectedImages.map((file) => ({ file, url: URL.createObjectURL(file) }));
    setImagePreviews(previews);
    return () => previews.forEach(({ url }) => URL.revokeObjectURL(url));
  }, [selectedImages]);
  useEffect(() => {
    const previews = editImageFiles.map((file) => ({ file, url: URL.createObjectURL(file) }));
    setEditImagePreviews(previews);
    return () => previews.forEach(({ url }) => URL.revokeObjectURL(url));
  }, [editImageFiles]);
  const creationImageUrls = imageUrls.split(/\r?\n/).map((url) => url.trim()).filter(Boolean);
  const filteredProducts = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    return products
      .filter((product) => statusFilter === "ALL" || product.status === statusFilter)
      .filter((product) => !search || [
        product.name,
        product.category.name,
        product.brand?.name,
        ...product.variants.map(({ sku }) => sku)
      ].filter(Boolean).some((value) => value.toLocaleLowerCase().includes(search)))
      .sort((left, right) => sortOrder === "NAME_ASC"
        ? left.name.localeCompare(right.name)
        : new Date(right.updatedAt) - new Date(left.updatedAt));
  }, [products, query, sortOrder, statusFilter]);
  const pageCount = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const pageProducts = filteredProducts.slice((page - 1) * pageSize, page * pageSize);
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);

  function imageUploadError(files, existingCount = 0) {
    if (files.length > maxImagesPerUpload) return `Choose no more than ${maxImagesPerUpload} images per upload.`;
    if (existingCount + files.length > maxProductImages) return `A product can have at most ${maxProductImages} images.`;
    if (files.some((file) => !productImageTypes.includes(file.type))) return "Choose JPEG, PNG, or WebP images.";
    if (files.some((file) => file.size > maxProductImageBytes)) return "Each image must be 5 MB or smaller.";
    return "";
  }


async function sendProductImages(productId, files) {
  if (!productId) {
    throw new Error("Product ID is missing.");
  }

  if (!files.length) {
    return null;
  }

  const body = new FormData();

  files.forEach((file) => {
    body.append("images", file);
  });

  try {
    const result = await shopOwnerApi.uploadProductImages(
      productId,
      body
    );

    console.log("[PRODUCT IMAGE UPLOAD SUCCESS]", {
      productId,
      imageCount: files.length
    });

    return result;
  } catch (error) {
    console.error("[PRODUCT IMAGE UPLOAD FAILED]", {
      productId,
      message: error.message
    });

    throw new Error(
      `Product image upload failed: ${
        error.message || "Unknown server error"
      }`
    );
  }
}


  async function createProduct(event) {
  event.preventDefault();

  const filesToUpload = selectedImages;

  return submit(async () => {
    const moneyPattern = /^\d{1,10}(\.\d{1,2})?$/;

    if (!name.trim() || !description.trim() || !categoryId) {
      throw new Error("Complete the required product information.");
    }

    if (!/^\d{4,8}$/.test(hsnCode.trim())) {
      throw new Error("HSN Code must contain 4 to 8 digits.");
    }

    if (
      !/^\d+(\.\d{1,2})?$/.test(gstRate.trim()) ||
      Number(gstRate) < 0 ||
      Number(gstRate) > 100
    ) {
      throw new Error("Enter a valid GST percentage between 0 and 100.");
    }

    if (basePrice && !moneyPattern.test(basePrice)) {
      throw new Error("Enter a valid base price.");
    }

    if (
      commissionPercent &&
      (
        !/^\d{1,3}(\.\d{1,2})?$/.test(commissionPercent) ||
        Number(commissionPercent) > 100
      )
    ) {
      throw new Error("Commission must be between 0 and 100.");
    }

    const skus = new Set();
    const combinations = new Set();

    const variantsPayload = productVariants.map((variant, index) => {
      const skuValue = variant.sku.trim().toUpperCase();

      if (!skuValue) {
        throw new Error(`Variant ${index + 1}: SKU is required.`);
      }

      if (skus.has(skuValue)) {
        throw new Error(`Duplicate SKU: ${skuValue}`);
      }

      skus.add(skuValue);

      if (!moneyPattern.test(variant.price) || Number(variant.price) <= 0) {
        throw new Error(`Variant ${index + 1}: Enter a valid selling price.`);
      }

      for (const field of ["wholesalePrice", "markedPrice", "discountPrice"]) {
        if (variant[field] && !moneyPattern.test(variant[field])) {
          throw new Error(`Variant ${index + 1}: Invalid ${field}.`);
        }
      }

      if (
        variant.discountPrice &&
        (
          Number(variant.discountPrice) <= 0 ||
          Number(variant.discountPrice) >= Number(variant.price)
        )
      ) {
        throw new Error(`Variant ${index + 1}: Invalid discount price.`);
      }

      if (
        variant.wholesalePrice &&
        Number(variant.wholesalePrice) > Number(variant.price)
      ) {
        throw new Error(`Variant ${index + 1}: Wholesale price exceeds selling price.`);
      }

      if (
        variant.markedPrice &&
        Number(variant.markedPrice) < Number(variant.price)
      ) {
        throw new Error(`Variant ${index + 1}: Marked price is below selling price.`);
      }

      const quantity = Number(variant.stock);

      if (
        !/^\d+$/.test(String(variant.stock)) ||
        !Number.isInteger(quantity) ||
        quantity < 0 ||
        quantity > 1000000
      ) {
        throw new Error(`Variant ${index + 1}: Invalid stock.`);
      }

      if (variant.attributeId && !variant.valueId) {
        throw new Error(`Variant ${index + 1}: Select an attribute value.`);
      }

      const combination = variant.attributeId && variant.valueId
        ? `${variant.attributeId}:${variant.valueId}`
        : "default";

      if (combinations.has(combination)) {
        throw new Error(
          `Variant ${index + 1}: Duplicate attribute combination.`
        );
      }

      combinations.add(combination);

      return {
        variantName: variant.variantName.trim() || null,
        sku: skuValue,
        wholesalePrice: variant.wholesalePrice || null,
        markedPrice: variant.markedPrice || null,
        price: variant.price,
        discountPrice: variant.discountPrice || null,
        stock: quantity,
        values: variant.attributeId && variant.valueId
          ? [{
              attributeId: variant.attributeId,
              valueId: variant.valueId
            }]
          : []
      };
    });

    const validUrls = creationImageUrls.every((url) => {
      try {
        return new URL(url).protocol === "https:";
      } catch {
        return false;
      }
    });

    if (!validUrls) {
      throw new Error("Use valid HTTPS image URLs.");
    }

    const selectionError = imageUploadError(
      filesToUpload,
      creationImageUrls.length
    );

    if (selectionError) {
      throw new Error(selectionError);
    }

    let productId = createdProductPendingImageUploadId;
    let product;

    if (!productId) {
      const response = await shopOwnerApi.createProduct({
        name: name.trim(),
        masterSku: masterSku.trim() || null,
        shortDescription: shortDescription.trim() || null,
        description: description.trim(),
        categoryId,
        brandId: brandId || null,
        basePrice: basePrice || null,
        commissionPercent: commissionPercent || null,
        hsnCode: hsnCode.trim(),
        gstRate: (Number(gstRate) / 100).toFixed(4),
        taxInclusive,
        images: creationImageUrls,
        variants: variantsPayload
      });

      product = response.product;
      productId = product.id;

      if (filesToUpload.length) {
        setCreatedProductPendingImageUploadId(productId);
      }
    } else if (!filesToUpload.length) {
      throw new Error(
        "Product already created. Select images to retry uploading."
      );
    }

    if (filesToUpload.length) {
      setUploadingImages(true);

      try {
        await sendProductImages(productId, filesToUpload);
        setCreatedProductPendingImageUploadId("");
      } finally {
        setUploadingImages(false);
      }
    }

    setCreateProductOpen(false);

    setName("");
    setDescription("");
    setCategoryId("");
    setBrandId("");
    setMasterSku("");
    setShortDescription("");
    setBasePrice("");
    setCommissionPercent("");

    setProductVariants([createEmptyVariant()]);

    setSku("");
    setPrice("");
    setDiscountPrice("");
    setStock("0");
    setAttributeId("");
    setValueId("");

    setHsnCode("");
    setGstRate("");
    setTaxInclusive(false);

    setImageUrls("");
    setSelectedImages([]);
    setImageSelectionError("");
    setProductStep(1);

    return product || { id: productId };
  }, filesToUpload.length ? "Product and images created." : "Product created.");
}

  async function updateVariant(event, variantId) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = {
      price: form.get("price"),
      discountPrice: form.get("discountPrice")?.trim() ? form.get("discountPrice") : null,
      stock: Number(form.get("stock"))
    };
    await submit(() => shopOwnerApi.updateVariant(variantId, body), "Variant price and inventory updated.");
  }

  async function setProductStatus(productId, status) {
    const product = products.find(item => item.id === productId);
    if (!product || busy || product.status === status) return;
    if (!window.confirm(`Change ${product.name} status from ${product.status} to ${status}?`)) return;
    await submit(() => shopOwnerApi.setProductStatus(productId, status), `Product ${status.toLowerCase()}.`);
  }

  async function uploadProductImages(event, productId) {
    const input = event.currentTarget;
    const files = Array.from(input.files || []);
    if (!files.length) return;
    const product = products.find(({ id }) => id === productId);
    const selectionError = imageUploadError(files, product?.images.length || 0);
    if (selectionError) {
      await submit(() => { throw new Error(selectionError); }, "");
      input.value = "";
      return;
    }
    setUploadingProductId(productId);
    try {
      await submit(
        () => sendProductImages(productId, files),
        `${files.length} product image${files.length === 1 ? "" : "s"} uploaded.`
      );
    } finally {
      setUploadingProductId("");
      input.value = "";
    }
  }

  async function deleteProductImage(productId, imageId) {
    await submit(
      () => shopOwnerApi.removeProductImage(productId, imageId),
      "Product image removed."
    );
  }

  async function addVariant(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const selectedValueId = form.get("valueId");
    const values = variantAttributeId && selectedValueId
      ? [{ attributeId: variantAttributeId, valueId: selectedValueId }]
      : [];
    await submit(() => shopOwnerApi.addProductVariants(variantProduct, {
        variants: [{
          sku: form.get("sku"),
          price: form.get("price"),
          discountPrice: form.get("discountPrice") || null,
          stock: Number(form.get("stock")),
          values
        }]
    }), "Variant added.");
    setVariantProduct(""); setVariantAttributeId("");
  }

  async function updateProduct(event, productId) {
    event.preventDefault();
    if (editingProductDetailsSavedId === productId) {
      if (!editImageFiles.length) {
        await submit(() => { throw new Error("Product details are saved. Select an image to retry the upload."); }, "");
        return;
      }
      const uploadResult = await submit(async () => {
        await sendProductImages(productId, editImageFiles);
        setEditImageFiles([]);
        setEditingProductDetailsSavedId("");
        return { productId };
      }, "Product details and images updated.");
      if (uploadResult) {
        setEditingProduct("");
        setEditImageFiles([]);
      }
      return;
    }

    const form = new FormData(event.currentTarget);
    const hsn = String(form.get("hsnCode") || "").trim();
    const gstPercent = String(form.get("gstRate") || "").trim();
    if (!/^\d{4,8}$/.test(hsn)) {
      await submit(() => { throw new Error("Enter a valid 4 to 8 digit HSN code."); }, "");
      return;
    }
    if (!/^\d+(\.\d{1,2})?$/.test(gstPercent)) {
      await submit(() => { throw new Error("Enter a valid GST percentage."); }, "");
      return;
    }
    const product = products.find(({ id }) => id === productId);
    const selectionError = imageUploadError(editImageFiles, product?.images.length || 0);
    if (selectionError) {
      await submit(() => { throw new Error(selectionError); }, "");
      return;
    }
    const body = Object.fromEntries(form.entries());
    body.brandId = body.brandId || null;
    body.hsnCode = hsn || null;
    body.gstRate = gstPercent === "" ? null : (Number(gstPercent) / 100).toFixed(4);
    body.taxInclusive = form.get("taxInclusive") === "on";
    body.images = String(body.images || "").split(/\r?\n/).map((url) => url.trim()).filter(Boolean);
    const result = await submit(async () => {
      const updated = await shopOwnerApi.updateProduct(productId, body);
      if (editImageFiles.length) {

        await sendProductImages(productId, editImageFiles);
        setEditImageFiles([]);
      }
      return updated || { productId };
    }, editImageFiles.length ? "Product details and images updated." : "Product details updated.");
    if (result) {
      setEditingProduct("");
      setEditImageFiles([]);
      setEditingProductDetailsSavedId("");
    }
  }

  function openProductEditor(productId) {
    setEditingProduct(productId);
    setEditingProductDetailsSavedId("");
  }

  function advanceProductStep(event) {
    const form = event.currentTarget.closest("form");
    if (form?.reportValidity()) setProductStep((step) => Math.min(step + 1, 6));
  }

  function goBackProductStep() {
    setProductStep((step) => Math.max(step - 1, 1));
  }

  return (
    <>
      <Modal open={createProductOpen} title="Create product" className="product-wizard-modal" onClose={() => { if (!createdProductPendingImageUploadId) setCreateProductOpen(false); }}>
        {error && <p className="alert alert-danger" role="alert">{error}</p>}
        {createdProductPendingImageUploadId && <p className="alert alert-warning" role="status">Product details were saved, but the image upload did not finish. Your details and selected files are retained; retry the image upload before leaving this form.</p>}
        <section className="workspace-card">
        {options.categories.length === 0
          ? <p className="muted-copy">An active category is required before listing products. Submit a category request under Catalog requests.</p>
          : <form className="workspace-form" onSubmit={createProduct}>
              {false && productStep === 1 && <div className="product-wizard-step">
                <h3>Product details</h3>
                <label>Product name<input className="form-control" required minLength="2" maxLength="160" value={name} onChange={(event) => setName(event.target.value)} /></label>
                <label>Description<textarea className="form-control" required minLength="1" rows="3" maxLength="5000" value={description} onChange={(event) => setDescription(event.target.value)} /></label>
                <label>Category<select className="form-select" required value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">Select category</option>{options.categories.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
                <label>Brand (optional)<select className="form-select" value={brandId} onChange={(event) => setBrandId(event.target.value)}><option value="">No brand</option>{options.brands.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
              </div>}
              {false && productStep === 2 && <div className="product-wizard-step">
                <h3>Pricing</h3>
                <div className="form-row">
                  <label>SKU<input className="form-control" required maxLength="80" value={sku} onChange={(event) => setSku(event.target.value)} /></label>
                  <label>Price<input className="form-control" required inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" value={price} onChange={(event) => setPrice(event.target.value)} /></label>
                  <label>Discount price<input className="form-control" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" value={discountPrice} onChange={(event) => setDiscountPrice(event.target.value)} /></label>
                </div>
              </div>}
              {false && productStep === 3 && <div className="product-wizard-step">
                <h3>Variants</h3>
                <div className="form-row">
                  <label>Variant attribute (optional)<select className="form-select" value={attributeId} onChange={(event) => { setAttributeId(event.target.value); setValueId(""); }}><option value="">No options</option>{options.attributes.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
                  {attributeId && <label>Option value<select className="form-select"  value={valueId} onChange={(event) => setValueId(event.target.value)}><option value="">Select value</option>{selectedValues.map((item) => <option value={item.id} key={item.id}>{item.value}</option>)}</select></label>}
                </div>
              </div>}
              {false && productStep === 4 && <div className="product-wizard-step">
                <h3>Stock</h3>
                <label>Initial stock<input className="form-control" required type="number" min="0" max="1000000" value={stock} onChange={(event) => setStock(event.target.value)} /></label>
              </div>}
              {false && productStep === 5 && <div className="product-wizard-step">
                <h3>Product images</h3>
                <label>Product image URLs (HTTPS, optional)<textarea className="form-control" rows="2" maxLength="2000" placeholder="One image URL per line" value={imageUrls} onChange={(event) => {
                  const nextUrls = event.target.value;
                  setImageUrls(nextUrls);
                  const urlCount = nextUrls.split(/\r?\n/).map((url) => url.trim()).filter(Boolean).length;
                  setImageSelectionError(imageUploadError(selectedImages, urlCount));
                }} /></label>
                <div className="new-product-images">
                  <label className="product-image-upload create-product-image-upload">Upload Product Images (JPEG, PNG, WebP; up to 5 MB each)
                    <input className="form-control" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy || uploadingImages} onChange={(event) => {
                      const files = Array.from(event.currentTarget.files || []);
                      setSelectedImages(files);
                      setImageSelectionError(imageUploadError(files, creationImageUrls.length));
                    }} />
                  </label>
                  <small className="muted-copy">{selectedImages.length} / {maxImagesPerUpload} images selected for upload</small>
                  {imageSelectionError && <p className="image-upload-error" role="alert">{imageSelectionError}</p>}
                  {uploadingImages && <p className="image-upload-progress" role="status">Uploading product images…</p>}
                  {imagePreviews.length > 0 && <div className="product-image-manager new-product-image-previews">
                    {imagePreviews.map(({ file, url }, index) => (
                      <div className="product-image-item" key={`${file.name}-${file.lastModified}-${index}`}>
                        <img src={url} alt={`Preview of ${file.name}`} />
                        <button className="btn btn-sm btn-outline-secondary" type="button" disabled={busy} onClick={() => {
                          const nextImages = selectedImages.filter((_, itemIndex) => itemIndex !== index);
                          setSelectedImages(nextImages);
                          setImageSelectionError(imageUploadError(nextImages, creationImageUrls.length));
                        }}>Remove</button>
                      </div>
                    ))}
                  </div>}
                </div>
              </div>}
              {false && productStep === 6 && <div className="product-wizard-step">
                <h3>Review product</h3>
                <dl className="product-review-list">
                  <dt>Name</dt><dd>{name || "—"}</dd>
                  <dt>Description</dt><dd>{description || "—"}</dd>
                  <dt>Category</dt><dd>{options.categories.find(({ id }) => id === categoryId)?.name || "—"}</dd>
                  <dt>Brand</dt><dd>{options.brands.find(({ id }) => id === brandId)?.name || "No brand"}</dd>
                  <dt>SKU and price</dt><dd>{sku || "—"} · {price ? `₹${price}` : "No price"}</dd>
                  <dt>Stock</dt><dd>{stock}</dd>
                  <dt>Images</dt><dd>{creationImageUrls.length + selectedImages.length} selected</dd>
                </dl>
                <p className="muted-copy">The product is created first. Selected files are then uploaded securely against the new product ID.</p>
              </div>}
              <fieldset className="product-form-section">
  <legend>Product Information</legend>

  <div className="form-row">
    <label>
      Product Name *
      <input
        className="form-control"
        required
        minLength={2}
        maxLength={160}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
    </label>

    <label>
      Master SKU
      <input
        className="form-control"
        maxLength={80}
        value={masterSku}
        onChange={(e) => setMasterSku(e.target.value)}
      />
    </label>
  </div>

  <div className="form-row">
    <label>
      Category *
      <select
        className="form-select"
        required
        value={categoryId}
        onChange={(e) => setCategoryId(e.target.value)}
      >
        <option value="">Select category</option>
        {options.categories.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
    </label>

    <label>
      Brand
      <select
        className="form-select"
        value={brandId}
        onChange={(e) => setBrandId(e.target.value)}
      >
        <option value="">No brand</option>
        {options.brands.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
    </label>
  </div>

  <div className="form-row">
    <label>
      Base Price (₹)
      <input
        className="form-control"
        type="number"
        min="0"
        step="0.01"
        value={basePrice}
        onChange={(e) => setBasePrice(e.target.value)}
      />
    </label>

    <label>
      Product Commission (%)
      <input
        className="form-control"
        type="number"
        min="0"
        max="100"
        step="0.01"
        value={commissionPercent}
        onChange={(e) => setCommissionPercent(e.target.value)}
      />
    </label>
  </div>

  <label>
    Short Description
    <textarea
      className="form-control"
      rows={2}
      maxLength={1000}
      value={shortDescription}
      onChange={(e) => setShortDescription(e.target.value)}
    />
  </label>

  <label>
    Description *
    <textarea
      className="form-control"
      required
      rows={3}
      maxLength={5000}
      value={description}
      onChange={(e) => setDescription(e.target.value)}
    />
  </label>
</fieldset>

              <fieldset className="product-form-section">
  <legend>Product Variants</legend>

  {productVariants.map((variant, index) => {
    const selectedAttribute = options.attributes.find(
      (item) => item.id === variant.attributeId
    );

    return (
      <div
        key={variant.id}
        className="workspace-card"
        style={{ marginBottom: 16, padding: 16 }}
      >
        <div className="section-heading">
          <h3>Variant {index + 1}</h3>

          <button
            type="button"
            className="btn btn-sm btn-outline-danger"
            disabled={busy || productVariants.length === 1}
            onClick={() => removeProductVariant(variant.id)}
          >
            Remove Variant
          </button>
        </div>

        <div className="form-row">
          <label>
            Variant Name
            <input
              className="form-control"
              maxLength={120}
              value={variant.variantName}
              onChange={(e) =>
                updateProductVariant(
                  variant.id,
                  "variantName",
                  e.target.value
                )
              }
            />
          </label>

          <label>
            Variant SKU *
            <input
              className="form-control"
              required
              maxLength={80}
              value={variant.sku}
              onChange={(e) =>
                updateProductVariant(variant.id, "sku", e.target.value)
              }
            />
          </label>
        </div>

        <div className="form-row">
          <label>
            Attribute
            <select
              className="form-select"
              value={variant.attributeId}
              onChange={(e) =>
                updateProductVariant(
                  variant.id,
                  "attributeId",
                  e.target.value
                )
              }
            >
              <option value="">No attribute</option>

              {options.attributes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Attribute Value
            <select
              className="form-select"
              value={variant.valueId}
              disabled={!variant.attributeId}
              required={Boolean(variant.attributeId)}
              onChange={(e) =>
                updateProductVariant(
                  variant.id,
                  "valueId",
                  e.target.value
                )
              }
            >
              <option value="">Select value</option>

              {(selectedAttribute?.values || []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.value}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="form-row">
          <label>
            Wholesale Price (₹)
            <input
              className="form-control"
              type="number"
              min="0"
              step="0.01"
              value={variant.wholesalePrice}
              onChange={(e) =>
                updateProductVariant(
                  variant.id,
                  "wholesalePrice",
                  e.target.value
                )
              }
            />
          </label>

          <label>
            Marked Price (₹)
            <input
              className="form-control"
              type="number"
              min="0"
              step="0.01"
              value={variant.markedPrice}
              onChange={(e) =>
                updateProductVariant(
                  variant.id,
                  "markedPrice",
                  e.target.value
                )
              }
            />
          </label>
        </div>

        <div className="form-row">
          <label>
            Selling Price (₹) *
            <input
              className="form-control"
              required
              type="number"
              min="0.01"
              step="0.01"
              value={variant.price}
              onChange={(e) =>
                updateProductVariant(variant.id, "price", e.target.value)
              }
            />
          </label>

          <label>
            Discount Price (₹)
            <input
              className="form-control"
              type="number"
              min="0"
              step="0.01"
              value={variant.discountPrice}
              onChange={(e) =>
                updateProductVariant(
                  variant.id,
                  "discountPrice",
                  e.target.value
                )
              }
            />
          </label>

          <label>
            Stock *
            <input
              className="form-control"
              required
              type="number"
              min="0"
              max="1000000"
              step="1"
              value={variant.stock}
              onChange={(e) =>
                updateProductVariant(variant.id, "stock", e.target.value)
              }
            />
          </label>
        </div>
      </div>
    );
  })}

  <button
    type="button"
    className="btn btn-outline-primary"
    disabled={busy || productVariants.length >= 100}
    onClick={addProductVariant}
  >
    + Add Another Variant
  </button>

  <p className="muted-copy">
    Each variant must have a unique SKU and attribute combination.
    Different variants cannot all use "No attribute".
  </p>
</fieldset>


              <fieldset className="product-form-section">
                <legend>Tax & GST Details</legend>
                <div className="form-row">
                  <label>HSN Code<input className="form-control" required inputMode="numeric" pattern="[0-9]{4,8}" maxLength="8" value={hsnCode} onChange={(event) => setHsnCode(event.target.value.replace(/\D/g, "").slice(0, 8))} /></label>
                  <label>GST Rate (%)<input className="form-control" required inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,2})?" value={gstRate} onChange={(event) => setGstRate(event.target.value)} /></label>
                  <label className="form-check-label"><input className="form-check-input" type="checkbox" checked={taxInclusive} onChange={(event) => setTaxInclusive(event.target.checked)} /> Tax inclusive price</label>
                </div>
                <p className="muted-copy">Enter the 4 to 8 digit HSN code and GST percentage (for example 18 for 18%). Leave tax inclusive unchecked if prices exclude GST.</p>
              </fieldset>

              <fieldset className="product-form-section">
                <legend>Images and publishing</legend>
                <label>Product image URLs (HTTPS, optional)<textarea className="form-control" rows="2" maxLength="2000" placeholder="One image URL per line" value={imageUrls} onChange={(event) => {
                  const nextUrls = event.target.value;
                  setImageUrls(nextUrls);
                  const urlCount = nextUrls.split(/\r?\n/).map((url) => url.trim()).filter(Boolean).length;
                  setImageSelectionError(imageUploadError(selectedImages, urlCount));
                }} /></label>
                <div className="new-product-images">
                  <label className="product-image-upload create-product-image-upload">Upload Product Images (JPEG, PNG, WebP; up to 5 MB each)
                    <input className="form-control" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy || uploadingImages} onChange={(event) => {
                      const files = Array.from(event.currentTarget.files || []);
                      setSelectedImages(files);
                      setImageSelectionError(imageUploadError(files, creationImageUrls.length));
                    }} />
                  </label>
                  <small className="muted-copy">{selectedImages.length} / {maxImagesPerUpload} images selected for upload</small>
                  {imageSelectionError && <p className="image-upload-error" role="alert">{imageSelectionError}</p>}
                  {uploadingImages && <p className="image-upload-progress" role="status">Uploading product images...</p>}
                  {imagePreviews.length > 0 && <div className="product-image-manager new-product-image-previews">
                    {imagePreviews.map(({ file, url }, index) => (
                      <div className="product-image-item" key={`${file.name}-${file.lastModified}-${index}`}>
                        <img src={url} alt={`Preview of ${file.name}`} />
                        <button className="btn btn-sm btn-outline-secondary" type="button" disabled={busy} onClick={() => {
                          const nextImages = selectedImages.filter((_, itemIndex) => itemIndex !== index);
                          setSelectedImages(nextImages);
                          setImageSelectionError(imageUploadError(nextImages, creationImageUrls.length));
                        }}>Remove</button>
                      </div>
                    ))}
                  </div>}
                </div>
                <dl className="product-review-list">
                  <dt>Name</dt><dd>{name || "—"}</dd>
                  <dt>Category</dt><dd>{options.categories.find(({ id }) => id === categoryId)?.name || "—"}</dd>
                  <dt>Brand</dt><dd>{options.brands.find(({ id }) => id === brandId)?.name || "No brand"}</dd>
                  <dt>Variants</dt>
<dd>{productVariants.length}</dd>

<dt>SKUs</dt>
<dd>
  {productVariants.map((variant) => variant.sku || "Not entered").join(", ")}
</dd>

<dt>Total Stock</dt>
<dd>
  {productVariants.reduce(
    (sum, variant) => sum + (Number(variant.stock) || 0),
    0
  )}
</dd>
                  <dt>Images</dt><dd>{creationImageUrls.length + selectedImages.length} selected</dd>
                </dl>
                <p className="muted-copy">The product is created first. Selected files are then uploaded securely against the new product ID.</p>
              </fieldset>

              <div className="modal-actions">
                <button className="btn btn-outline-secondary" type="button" disabled={busy || uploadingImages || Boolean(createdProductPendingImageUploadId)} onClick={() => setCreateProductOpen(false)}>Cancel</button>
                <button className="btn btn-primary" disabled={busy || uploadingImages || Boolean(imageSelectionError)}>{busy ? createdProductPendingImageUploadId ? "Retrying upload..." : "Creating..." : createdProductPendingImageUploadId ? "Retry image upload" : "Create product"}</button>
              </div>
              <span className="visually-hidden">Product images are optional. A product can have up to {maxProductImages} images.</span>



              {/* Step content is validated before advancing; creation rechecks all required state. */}
              <span className="visually-hidden">Product images are optional. A product can have up to {maxProductImages} images.</span>
            </form>}
        </section>
      </Modal>

      <section className="workspace-card product-catalog-card">
        <div className="section-heading products-page-heading">
          <div><h2>Products &amp; inventory <span className="count-badge">${filteredProducts.length} / ${products.length}</span></h2><p className="muted-copy">Manage product listings, variants, and available stock.</p></div>
          <div className="page-actions"><button className="btn btn-sm btn-outline-secondary icon-button" type="button" aria-label="Refresh data" title="Refresh data" disabled={loading} onClick={reload}>{"\u21BB"}</button><button className="btn btn-primary" type="button" disabled={options.categories.length === 0 || busy || uploadingImages} onClick={() => { setProductStep(1); setCreateProductOpen(true); }}>+ Add Product</button></div>
        </div>
        {uploadingImages && <p className="image-upload-progress" role="status">Product created. Uploading product images?</p>}
        {options.categories.length === 0 && <p className="muted-copy product-category-note">An active category is required before listing products. Submit a category request under Catalog requests.</p>}
        <div className="list-filters product-filters">
          <label>Search products<input className="form-control" type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Name, category, brand, or SKU" /></label>
          <label>Status<select className="form-select" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}><option value="ALL">All statuses</option><option value="ACTIVE">Active</option><option value="DRAFT">Draft</option><option value="ARCHIVED">Archived</option></select></label>
          <label>Sort<select className="form-select" value={sortOrder} onChange={(event) => { setSortOrder(event.target.value); setPage(1); }}><option value="UPDATED_DESC">Recently updated</option><option value="NAME_ASC">Name A?Z</option></select></label>
        </div>
        {products.length === 0
          ? <p className="muted-copy product-table-state">No products yet.</p>
          : pageProducts.length === 0
            ? <p className="muted-copy product-table-state">No products match these filters.</p>
            : <><div className="employee-table-wrap product-table-wrap">
              <table className="employee-table product-table" aria-label="Products and inventory">
                <thead><tr><th scope="col">Product</th><th scope="col">SKU</th><th scope="col">Price</th><th scope="col">Available stock</th><th scope="col">Status</th><th scope="col">Details</th></tr></thead>
                <tbody>
                  {pageProducts.map((product) => {
                    const detailsId = "product-details-" + product.id;
                    const isExpanded = expandedProductId === product.id;
                    const variants = product.variants || [];
                    const totalStock = variants.reduce((total, variant) => total + Number(variant.stock || 0), 0);
                    const prices = variants.map((variant) => Number(variant.discountPrice || variant.price)).filter(Number.isFinite);
                    const singleVariant = variants.length === 1 ? variants[0] : null;
                    const thumbnail = product.images[0];
                    return <Fragment key={product.id}>
                      <tr>
                        <td className="product-name-cell"><div className="product-summary">
                          {thumbnail ? <img className="product-thumbnail" src={resolveMediaUrl(thumbnail.url)} alt="" loading="lazy" /> : <span className="product-thumbnail product-thumbnail-empty" aria-hidden="true">?</span>}
                          <span><strong>{product.name}</strong><small>{product.category.name}{product.brand ? " ? " + product.brand.name : ""}</small></span>
                        </div></td>
                        <td>{singleVariant ? singleVariant.sku : <><strong>{variants.length} variants</strong>{variants[0] && <small>{variants[0].sku}{variants.length > 1 ? " + " + (variants.length - 1) + " more" : ""}</small>}</>}</td>
                        <td>
  {singleVariant ? (() => {
    const regularPrice = Number(singleVariant.price);
    const discountedPrice = Number(singleVariant.discountPrice);

    const hasDiscount =
      Number.isFinite(regularPrice) &&
      regularPrice > 0 &&
      Number.isFinite(discountedPrice) &&
      discountedPrice > 0 &&
      discountedPrice < regularPrice;

    const sellingPrice = hasDiscount
      ? discountedPrice
      : regularPrice;

    const discountPercent = hasDiscount
      ? Math.round(((regularPrice - discountedPrice) / regularPrice) * 100)
      : 0;

    return (
      <div className="product-price-display">
        <strong className="product-selling-price">
          ₹{sellingPrice.toLocaleString("en-IN")}
        </strong>

        {hasDiscount && (
          <>
            <span className="product-original-price">
              MRP <del>₹{regularPrice.toLocaleString("en-IN")}</del>
            </span>

            <span className="product-discount-percent">
              {discountPercent}% OFF
            </span>
          </>
        )}
      </div>
    );
  })() : prices.length ? (
    <div className="product-price-display">
      <strong className="product-selling-price">
        From ₹{Math.min(...prices).toLocaleString("en-IN")}
      </strong>

      <span className="product-original-price">
        {variants.length} variant prices
      </span>
    </div>
  ) : "—"}
</td>
                        <td><strong>{totalStock}</strong><small>{variants.length === 1 ? "unit" : "units"} across {variants.length} variant{variants.length === 1 ? "" : "s"}</small></td>
                        <td><button type="button" className={"status-pill status-toggle " + product.status.toLowerCase()} title="Change product status (confirmation required)" disabled={busy || product.status === "ARCHIVED"} onClick={() => setProductStatus(product.id, product.status === "ACTIVE" ? "DRAFT" : "ACTIVE")}>{product.status}</button></td>
                        <td><button className="btn btn-sm btn-outline-primary" type="button" aria-expanded={isExpanded} aria-controls={detailsId} onClick={() => setExpandedProductId(isExpanded ? null : product.id)}>{isExpanded ? "Hide details" : "Manage"}</button></td>
                      </tr>
                      {isExpanded && <tr className="product-details-row"><td colSpan={6}>
                        <div className="product-details-panel" id={detailsId}>
                          <div className="product-details-heading"><div><h3>Product details</h3><p className="product-description">{product.description}</p></div>
                            <div className="product-actions">
                              <button className="btn btn-sm btn-outline-primary" type="button" onClick={() => { setVariantProduct(variantProduct === product.id ? "" : product.id); setVariantAttributeId(""); }}>Add variant</button>
                              <button className="btn btn-sm btn-outline-secondary" type="button" onClick={() => openProductEditor(product.id)}>Edit details</button>
                              {product.status !== "ARCHIVED" && <button className="btn btn-sm btn-outline-secondary" type="button" onClick={() => setProductStatus(product.id, product.status === "ACTIVE" ? "DRAFT" : "ACTIVE")}>{product.status === "ACTIVE" ? "Pause listing" : "Publish listing"}</button>}
                              {product.status !== "ARCHIVED" && <button className="btn btn-sm btn-outline-danger" type="button" onClick={() => setProductStatus(product.id, "ARCHIVED")}>Archive</button>}
                            </div>
                          </div>
                          <section className="product-detail-section"><h4>Product images</h4><div className="product-image-manager">
                            {product.images.map((image) => <div className="product-image-item" key={image.id}><img src={resolveMediaUrl(image.url)} alt={product.name + " product"} loading="lazy" /><button className="btn btn-sm btn-outline-danger" type="button" disabled={busy} onClick={() => deleteProductImage(product.id, image.id)}>Remove</button></div>)}
                            <label className="product-image-upload">Add images (JPEG, PNG, WebP; up to 5 MB each)<input className="form-control" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy || uploadingImages || product.images.length >= maxProductImages} onChange={(event) => uploadProductImages(event, product.id)} /></label>
                            {uploadingProductId === product.id && <small className="image-upload-progress" role="status">Uploading product images?</small>}
                            <small className="muted-copy">{product.images.length} / {maxProductImages} images</small>
                          </div></section>
                          <section className="product-detail-section"><h4>Variants and inventory</h4>
                            {variants.length ? <div className="product-variant-table-wrap"><table className="product-variant-table"><thead><tr><th scope="col">SKU / options</th><th scope="col">Price and inventory</th></tr></thead><tbody>
                              {variants.map((variant) => <tr key={variant.id}><td><strong>{variant.sku}</strong><small>{variant.values.map(({ attribute, value }) => attribute.name + ": " + value.value).join(" ? ") || "Standard"}</small></td><td><form className="product-variant-edit-form" onSubmit={(event) => updateVariant(event, variant.id)}><label>Regular price<input aria-label={"Regular price for " + variant.sku} name="price" type="text" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" required defaultValue={variant.price} /></label><label>Discount price<input aria-label={"Discount price for " + variant.sku} name="discountPrice" type="text" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" defaultValue={variant.discountPrice || ""} /></label><label>Stock<input aria-label={"Stock for " + variant.sku} name="stock" type="number" min="0" max="1000000" required defaultValue={variant.stock} /></label><button className="btn btn-sm btn-outline-primary" disabled={busy}>Save</button></form></td></tr>)}
                            </tbody></table></div> : <p className="muted-copy">No variants are available for this product.</p>}
                          </section>
                          {variantProduct === product.id && <form className="workspace-form variant-form" onSubmit={addVariant}>
                            <strong>Add variant to {product.name}</strong><div className="form-row">
                              <label>SKU<input className="form-control" name="sku" required maxLength="80" /></label><label>Price<input className="form-control" name="price" required inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" /></label><label>Discount price<input className="form-control" name="discountPrice" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" /></label><label>Stock<input className="form-control" name="stock" type="number" min="0" max="1000000" required defaultValue="0" /></label>
                            </div><div className="form-row">
                              <label>Attribute<select className="form-select" value={variantAttributeId} onChange={(event) => setVariantAttributeId(event.target.value)}><option value="">No options</option>{options.attributes.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>Value<select className="form-select" name="valueId" defaultValue=""><option value="">Select value if applicable</option>{(selectedVariantAttribute?.values || []).map((item) => <option value={item.id} key={item.id}>{item.value}</option>)}</select></label>
                            </div><button className="btn btn-sm btn-primary" disabled={busy}>Save variant</button>
                          </form>}
                        </div>
                      </td></tr>}
                    </Fragment>;
                  })}
                </tbody>
              </table>
            </div><ListPagination page={page} pageCount={pageCount} onChange={setPage} /></>}
      </section>
      <Modal open={Boolean(editingProduct)} title="Edit product details" onClose={() => { if (!editingProductDetailsSavedId) { setEditingProduct(""); setEditImageFiles([]); } }}>
        {products.filter(({ id }) => id === editingProduct).map((product) => {
          const detailsLocked = editingProductDetailsSavedId === product.id;
          const selectionError = imageUploadError(editImageFiles, product.images.length);
          return <form className="workspace-form" key={product.id} onSubmit={(event) => updateProduct(event, product.id)}>
            {error && <p className="alert alert-danger" role="alert">{error}</p>}
            {detailsLocked && <p className="alert alert-warning" role="status">Product details were saved, but the image upload did not finish. Retry the upload; the product will not be saved a second time.</p>}
            <label>Name<input className="form-control" name="name" required minLength="2" maxLength="160" defaultValue={product.name} disabled={detailsLocked} /></label>
            <label>Description<textarea className="form-control" name="description" rows="3" required maxLength="5000" defaultValue={product.description} disabled={detailsLocked} /></label>
            <label>External image URLs (HTTPS, one per line)<textarea className="form-control" name="images" rows="2" defaultValue={product.images.map(({ url }) => url).filter((url) => url.startsWith("https://") || url.startsWith("http://")).join("\n")} disabled={detailsLocked} /></label>
            <div className="form-row">
              <label>Category<select className="form-select" name="categoryId" defaultValue={product.category.id} required disabled={detailsLocked}>{options.categories.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
              <label>Brand<select className="form-select" name="brandId" defaultValue={product.brand?.id || ""} disabled={detailsLocked}><option value="">No brand</option>{options.brands.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
            </div>
            <div className="form-row">
              <label>HSN Code<input className="form-control" name="hsnCode" required inputMode="numeric" pattern="[0-9]{4,8}" maxLength="8" defaultValue={product.hsnCode || ""} disabled={detailsLocked} /></label>
              <label>GST Rate (%)<input className="form-control" name="gstRate" required inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,2})?" defaultValue={product.gstRate ? Number(product.gstRate) * 100 : ""} disabled={detailsLocked} /></label>
              <label className="form-check-label"><input className="form-check-input" type="checkbox" name="taxInclusive" defaultChecked={Boolean(product.taxInclusive)} disabled={detailsLocked} /> Tax inclusive price</label>
            </div>
            <section className="product-detail-section">
              <h4>Product images</h4>
              <div className="product-image-manager">
                {product.images.map((image) => <div className="product-image-item" key={image.id}><img src={resolveMediaUrl(image.url)} alt={product.name + " product"} loading="lazy" /></div>)}
                <label className="product-image-upload">Add images (JPEG, PNG, WebP; up to 5 MB each)
                  <input className="form-control" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy || uploadingImages || product.images.length >= maxProductImages} onChange={(event) => setEditImageFiles(Array.from(event.currentTarget.files || []))} />
                </label>
                {editImagePreviews.map(({ file, url }, index) => <div className="product-image-item" key={`${file.name}-${file.lastModified}-${index}`}><img src={url} alt={`Preview of ${file.name}`} /></div>)}
                {selectionError && <p className="image-upload-error" role="alert">{selectionError}</p>}
                <small className="muted-copy">{product.images.length + editImageFiles.length} / {maxProductImages} images</small>
              </div>
            </section>
            <button className="btn btn-primary" disabled={busy || Boolean(selectionError)}>{detailsLocked ? "Retry image upload" : editImageFiles.length ? "Save details and images" : "Save details"}</button>
          </form>;
        })}
      </Modal>
    </>
  );
}
