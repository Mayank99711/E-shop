import assert from "node:assert/strict";
import test from "node:test";
import { createOwnerPurchasingService } from "../src/services/owner-purchasing.js";

function makeDb() {
  const state = {
    shop: { id: "shop-a", status: "ACTIVE" },
    wholesalerAccess: { "shop-a": { "w-a": { isActive: true, wholesaler: { id: "w-a", status: "ACTIVE" } } } },
    variants: { "v-a": { id: "v-a", shopId: "shop-a", price: 10, stock: 5 } },
    purchaseOrders: [],
    purchaseOrderItems: [],
    goodsReceipts: [],
    goodsReceiptItems: [],
    movements: [],
    audit: []
  };

  const db = {
    shopWholesaler: {
      findUnique: async ({ where }) => state.wholesalerAccess[where.shopId_wholesalerId.shopId]?.[where.shopId_wholesalerId.wholesalerId] || null
    },
    productVariant: {
      findFirst: async ({ where }) => (state.variants[where.id] && state.variants[where.id].shopId === where.shopId ? state.variants[where.id] : null),
      update: async ({ where, data }) => {
        const v = state.variants[where.id];
        if (data.stock?.increment) v.stock += data.stock.increment;
        if (data.stock !== undefined && typeof data.stock === "number") v.stock = data.stock;
        return v;
      }
    },
    purchaseOrder: {
      create: async ({ data }) => {
        const po = { id: "po-" + state.purchaseOrders.length, shopId: data.shopId, wholesalerId: data.wholesalerId, status: data.status, totalAmount: data.totalAmount, items: [] };
        state.purchaseOrders.push(po);
        for (const item of data.items.create) {
          const pi = { id: "poi-" + state.purchaseOrderItems.length, purchaseOrderId: po.id, productVariantId: item.productVariantId, quantityOrdered: item.quantityOrdered, unitPrice: item.unitPrice, lineTotal: item.lineTotal, receivedQuantity: 0 };
          state.purchaseOrderItems.push(pi);
          po.items.push(pi);
        }
        return { ...po, items: po.items };
      },
      findFirst: async ({ where }) => {
        const po = state.purchaseOrders.find(p => p.id === where.id && p.shopId === where.shopId);
        if (!po) return null;
        return { ...po, items: state.purchaseOrderItems.filter(i => i.purchaseOrderId === po.id) };
      },
      findMany: async () => state.purchaseOrders,
      update: async ({ where, data }) => {
        const po = state.purchaseOrders.find(p => p.id === where.id);
        if (data.status) po.status = data.status;
        return po;
      }
    },
    goodsReceipt: {
      create: async ({ data }) => {
        const gr = { id: "gr-" + state.goodsReceipts.length, purchaseOrderId: data.purchaseOrderId, shopId: data.shopId, status: data.status, items: [] };
        state.goodsReceipts.push(gr);
        for (const item of data.items.create) {
          const gri = { id: "gri-" + state.goodsReceiptItems.length, goodsReceiptId: gr.id, purchaseOrderItemId: item.purchaseOrderItemId, quantityReceived: item.quantityReceived, quantityAccepted: item.quantityAccepted, quantityDamaged: item.quantityDamaged, quantityMissing: item.quantityMissing };
          state.goodsReceiptItems.push(gri);
          gr.items.push(gri);
        }
        return { ...gr, items: gr.items };
      },
      findFirst: async ({ where }) => {
        const gr = state.goodsReceipts.find(g => g.id === where.id && g.shopId === where.shopId);
        if (!gr) return null;
        return { ...gr, items: state.goodsReceiptItems.filter(i => i.goodsReceiptId === gr.id).map(i => ({ ...i, purchaseOrderItem: state.purchaseOrderItems.find(p => p.id === i.purchaseOrderItemId) })), purchaseOrder: state.purchaseOrders.find(p => p.id === gr.purchaseOrderId) };
      },
      findMany: async () => state.goodsReceipts,
      updateMany: async ({ where, data }) => {
        const gr = state.goodsReceipts.find(g => g.id === where.id && g.status === where.status);
        if (!gr) return { count: 0 };
        if (data.status) gr.status = data.status;
        if (data.confirmedAt) gr.confirmedAt = data.confirmedAt;
        if (data.confirmedById) gr.confirmedById = data.confirmedById;
        return { count: 1 };
      },
      findUnique: async ({ where }) => {
        const gr = state.goodsReceipts.find(g => g.id === where.id);
        if (!gr) return null;
        return { ...gr, items: state.goodsReceiptItems.filter(i => i.goodsReceiptId === gr.id).map(i => ({ ...i, purchaseOrderItem: state.purchaseOrderItems.find(p => p.id === i.purchaseOrderItemId) })) };
      }
    },
    purchaseOrderItem: {
      findMany: async ({ where }) => state.purchaseOrderItems.filter(i => i.purchaseOrderId === where.purchaseOrderId),
      update: async ({ where, data }) => {
        const item = state.purchaseOrderItems.find(i => i.id === where.id);
        if (data.receivedQuantity?.increment) item.receivedQuantity += data.receivedQuantity.increment;
        return item;
      }
    },
    inventoryMovement: {
      create: async ({ data }) => {
        if (state.movements.some(m => m.referenceType === data.referenceType && m.referenceId === data.referenceId)) {
          const err = new Error("duplicate"); err.code = "P2002"; throw err;
        }
        const m = { id: "mv-" + state.movements.length, ...data };
        state.movements.push(m);
        return m;
      }
    },
    auditLog: { create: async ({ data }) => { state.audit.push(data); } },
    $transaction: async (callback) => callback(db)
  };

  return { db, state };
}

test("PO creation does not change stock", async () => {
  const { db, state } = makeDb();
  const service = createOwnerPurchasingService(db, async () => state.shop);
  const po = await service.createPurchaseOrder("owner-a", "actor-a", {
    wholesalerId: "w-a",
    items: [{ productVariantId: "v-a", quantity: 2, unitPrice: "9.50" }]
  });
  assert.equal(state.variants["v-a"].stock, 5);
  assert.equal(po.status, "SUBMITTED");
});
test("draft receipt does not change stock", async () => {
  const { db, state } = makeDb();
  const service = createOwnerPurchasingService(db, async () => state.shop);
  const po = await service.createPurchaseOrder("owner-a", "actor-a", {
    wholesalerId: "w-a",
    items: [{ productVariantId: "v-a", quantity: 2, unitPrice: "9.50" }]
  });
  const receipt = await service.createGoodsReceipt("owner-a", "actor-a", po.id, {
    items: [{ purchaseOrderItemId: po.items[0].id, quantityReceived: 2, quantityAccepted: 2, quantityDamaged: 0, quantityMissing: 0 }]
  });
  assert.equal(receipt.status, "DRAFT");
  assert.equal(state.variants["v-a"].stock, 5);
});
test("confirmed receipt increases stock by accepted quantity", async () => {
  const { db, state } = makeDb();
  const service = createOwnerPurchasingService(db, async () => state.shop);
  const po = await service.createPurchaseOrder("owner-a", "actor-a", {
    wholesalerId: "w-a",
    items: [{ productVariantId: "v-a", quantity: 2, unitPrice: "9.50" }]
  });
  const receipt = await service.createGoodsReceipt("owner-a", "actor-a", po.id, {
    items: [{ purchaseOrderItemId: po.items[0].id, quantityReceived: 2, quantityAccepted: 2, quantityDamaged: 0, quantityMissing: 0 }]
  });
  const confirmed = await service.confirmGoodsReceipt("owner-a", "actor-a", receipt.id);
  assert.equal(confirmed.status, "CONFIRMED");
  assert.equal(state.variants["v-a"].stock, 7);
  assert.equal(state.movements.length, 1);
});

test("damaged and missing quantities do not increase stock", async () => {
  const { db, state } = makeDb();
  const service = createOwnerPurchasingService(db, async () => state.shop);
  const po = await service.createPurchaseOrder("owner-a", "actor-a", {
    wholesalerId: "w-a",
    items: [{ productVariantId: "v-a", quantity: 5, unitPrice: "9.50" }]
  });
  const receipt = await service.createGoodsReceipt("owner-a", "actor-a", po.id, {
    items: [{ purchaseOrderItemId: po.items[0].id, quantityReceived: 5, quantityAccepted: 2, quantityDamaged: 2, quantityMissing: 1 }]
  });
  await service.confirmGoodsReceipt("owner-a", "actor-a", receipt.id);
  assert.equal(state.variants["v-a"].stock, 7);
});

test("over-receipt is rejected", async () => {
  const { db, state } = makeDb();
  const service = createOwnerPurchasingService(db, async () => state.shop);
  const po = await service.createPurchaseOrder("owner-a", "actor-a", {
    wholesalerId: "w-a",
    items: [{ productVariantId: "v-a", quantity: 2, unitPrice: "9.50" }]
  });
  await assert.rejects(() => service.createGoodsReceipt("owner-a", "actor-a", po.id, {
    items: [{ purchaseOrderItemId: po.items[0].id, quantityReceived: 3, quantityAccepted: 3, quantityDamaged: 0, quantityMissing: 0 }]
  }), { code: "OVER_RECEIPT" });
});

test("repeated confirmation does not double stock", async () => {
  const { db, state } = makeDb();
  const service = createOwnerPurchasingService(db, async () => state.shop);
  const po = await service.createPurchaseOrder("owner-a", "actor-a", {
    wholesalerId: "w-a",
    items: [{ productVariantId: "v-a", quantity: 2, unitPrice: "9.50" }]
  });
  const receipt = await service.createGoodsReceipt("owner-a", "actor-a", po.id, {
    items: [{ purchaseOrderItemId: po.items[0].id, quantityReceived: 2, quantityAccepted: 2, quantityDamaged: 0, quantityMissing: 0 }]
  });
  await service.confirmGoodsReceipt("owner-a", "actor-a", receipt.id);
  await assert.rejects(() => service.confirmGoodsReceipt("owner-a", "actor-a", receipt.id), { code: "RECEIPT_ALREADY_CONFIRMED" });
  assert.equal(state.variants["v-a"].stock, 7);
  assert.equal(state.movements.length, 1);
});
