import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { createCustomerRazorpayService } from "../src/services/customer-razorpay.js";
import { createRazorpayProvider } from "../src/services/razorpay-provider.js";

function createHarness() {
  const payment = {
    id: "payment-a",
    orderId: "order-a",
    provider: "RAZORPAY",
    providerOrderId: "rzp-order-a",
    providerPaymentId: null,
    status: "PENDING",
    amount: "125.00",
    verifiedAt: null,
    order: { id: "order-a", orderNumber: "ORD-100", customerId: "customer-a" },
  };
  const calls = [];
  const webhookEvents = new Set();
  const transaction = {
    payment: {
      findUnique: async () => ({ ...payment }),
      updateMany: async ({ where, data }) => {
        if (payment.status !== where.status || payment.providerPaymentId !== where.providerPaymentId) {
          return { count: 0 };
        }
        Object.assign(payment, data);
        calls.push(["payment", { ...data }]);
        return { count: 1 };
      },
    },
    inventoryReservation: {
      updateMany: async ({ where, data }) => {
        calls.push(["reservation", { where, data }]);
        return { count: 1 };
      },
    },
    order: {
      findUnique: async () => ({
        customerId: "customer-a",
        shopOrders: [{ items: [{ variantId: "variant-a", quantity: 2 }] }],
      }),
    },
    cart: { findUnique: async () => ({ id: "cart-a" }) },
    cartItem: {
      deleteMany: async ({ where }) => calls.push(["cart-item", where]),
    },
    auditLog: {
      create: async ({ data }) => calls.push(["audit", data]),
    },
    paymentWebhookEvent: {
      create: async ({ data }) => {
        if (webhookEvents.has(data.eventId)) {
          throw Object.assign(new Error("Duplicate event"), { code: "P2002" });
        }
        webhookEvents.add(data.eventId);
      },
    },
  };
  const database = {
    order: {
      findUnique: async () => ({
        id: "order-a",
        orderNumber: "ORD-100",
        grandTotal: "125.00",
        payments: [{ ...payment }],
      }),
    },
    payment: {
      findFirst: async () => ({ ...payment, order: { ...payment.order } }),
    },
    paymentWebhookEvent: {
      findUnique: async ({ where }) => webhookEvents.has(where.eventId) ? { id: where.eventId } : null,
    },
    $transaction: (callback) => callback(transaction),
  };
  const provider = {
    configured: true,
    testMode: true,
    verifyCheckoutSignature: () => true,
    verifyWebhookSignature: () => true,
    fetchOrder: async () => ({
      id: "rzp-order-a",
      receipt: "order-a",
      notes: { orderId: "order-a" },
      amount: 12500,
      currency: "INR",
      status: "paid",
    }),
    fetchOrderPayments: async () => [{
      id: "rzp-payment-a",
      order_id: "rzp-order-a",
      amount: 12500,
      currency: "INR",
      status: "captured",
      captured: true,
      amount_refunded: 0,
    }],
    fetchPayment: async () => ({
      id: "rzp-payment-a",
      order_id: "rzp-order-a",
      amount: 12500,
      currency: "INR",
      status: "captured",
    }),
  };
  return { service: createCustomerRazorpayService(database, provider), payment, calls, database, provider };
}

test("verified captured payment becomes PAID and converts its reservations", async () => {
  const { service, payment, calls } = createHarness();
  const result = await service.verifyPayment("customer-a", {
    razorpayOrderId: "rzp-order-a",
    razorpayPaymentId: "rzp-payment-a",
    razorpaySignature: "valid-signature",
  });

  assert.equal(result.payment.status, "PAID");
  assert.equal(result.order.orderNumber, "ORD-100");
  assert.equal(payment.providerPaymentId, "rzp-payment-a");
  assert.ok(calls.some(([kind, detail]) => kind === "reservation" && detail.data.status === "CONVERTED"));
  assert.ok(calls.some(([kind]) => kind === "cart-item"));
  assert.ok(calls.some(([kind, detail]) => kind === "audit" && detail.action === "RAZORPAY_PAYMENT_STATUS_VERIFIED"));
});

test("provider amount mismatch cannot mark the payment as paid", async () => {
  const { service, payment } = createHarness();
  const provider = {
    configured: true,
    verifyCheckoutSignature: () => true,
    fetchPayment: async () => ({
      id: "rzp-payment-a",
      order_id: "rzp-order-a",
      amount: 12501,
      currency: "INR",
      status: "captured",
    }),
  };
  const guardedService = createCustomerRazorpayService({
    payment: { findFirst: async () => ({ ...payment, order: { ...payment.order } }) },
  }, provider);

  await assert.rejects(
    () => guardedService.verifyPayment("customer-a", {
      razorpayOrderId: "rzp-order-a",
      razorpayPaymentId: "rzp-payment-a",
      razorpaySignature: "valid-signature",
    }),
    { code: "PAYMENT_DETAILS_MISMATCH" },
  );
  assert.equal(payment.status, "PENDING");
});

test("authenticated TEST API reconciliation verifies provider mapping and audits captured evidence", async () => {
  const { service, payment, calls } = createHarness();
  const result = await service.reconcileTestPayment("order-a", "admin-a");

  assert.equal(result.payment.status, "PAID");
  assert.equal(result.payment.providerPaymentId, "rzp-payment-a");
  assert.equal(result.verificationSource, "RAZORPAY_TEST_API");
  assert.equal(payment.status, "PAID");
  assert.ok(calls.some(([kind, detail]) => kind === "reservation" && detail.data.status === "CONVERTED"));
  assert.ok(calls.some(([kind, detail]) => kind === "audit"
    && detail.action === "RAZORPAY_PAYMENT_RECONCILED"
    && detail.actorId === "admin-a"
    && detail.metadata.providerOrderId === "rzp-order-a"
    && detail.metadata.providerPaymentId === "rzp-payment-a"
    && detail.metadata.verificationSource === "RAZORPAY_TEST_API"));
});

test("TEST API reconciliation is idempotent and does not repeat the payment transition", async () => {
  const { service, calls } = createHarness();
  await service.reconcileTestPayment("order-a", "admin-a");
  await service.reconcileTestPayment("order-a", "admin-a");

  assert.equal(calls.filter(([kind]) => kind === "payment").length, 1);
  assert.equal(calls.filter(([kind, detail]) => kind === "audit" && detail.action === "RAZORPAY_PAYMENT_RECONCILED").length, 1);
});

test("TEST API reconciliation rejects live mode before contacting the provider", async () => {
  const { service, provider, payment } = createHarness();
  provider.testMode = false;
  provider.fetchOrder = async () => { throw new Error("Must not contact provider"); };

  await assert.rejects(service.reconcileTestPayment("order-a", "admin-a"), { code: "TEST_RECONCILIATION_UNAVAILABLE" });
  assert.equal(payment.status, "PENDING");
});

test("TEST API reconciliation rejects mismatched provider receipt, amount, and currency", async () => {
  for (const override of [
    { receipt: "another-order" },
    { amount: 12501 },
    { currency: "USD" },
    { notes: { orderId: "another-order" } },
  ]) {
    const { service, provider, payment } = createHarness();
    provider.fetchOrder = async () => ({
      id: "rzp-order-a", receipt: "order-a", notes: { orderId: "order-a" },
      amount: 12500, currency: "INR", status: "paid", ...override,
    });
    await assert.rejects(service.reconcileTestPayment("order-a", "admin-a"), { code: "PAYMENT_DETAILS_MISMATCH" });
    assert.equal(payment.status, "PENDING");
  }
});

test("TEST API reconciliation rejects non-captured, ambiguous, and refunded payments", async () => {
  for (const paymentOverrides of [
    [{ id: "rzp-payment-a", order_id: "rzp-order-a", amount: 12500, currency: "INR", status: "authorized", captured: false }],
    [
      { id: "rzp-payment-a", order_id: "rzp-order-a", amount: 12500, currency: "INR", status: "captured", captured: true },
      { id: "rzp-payment-b", order_id: "rzp-order-a", amount: 12500, currency: "INR", status: "captured", captured: true },
    ],
    [{ id: "rzp-payment-a", order_id: "rzp-order-a", amount: 12500, currency: "INR", status: "captured", captured: true, amount_refunded: 1 }],
    [{ id: "", order_id: "rzp-order-a", amount: 12500, currency: "INR", status: "captured", captured: true }],
  ]) {
    const { service, provider, payment } = createHarness();
    provider.fetchOrderPayments = async () => paymentOverrides;
    await assert.rejects(service.reconcileTestPayment("order-a", "admin-a"));
    assert.equal(payment.status, "PENDING");
  }
});

test("a duplicate signed webhook is processed only once", async () => {
  const { service, calls } = createHarness();
  const rawBody = Buffer.from(JSON.stringify({
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          id: "rzp-payment-a",
          order_id: "rzp-order-a",
          amount: 12500,
          currency: "INR",
          status: "captured",
        },
      },
    },
  }));
  const first = await service.handleWebhook(rawBody, "valid-signature", "event-a");
  const duplicate = await service.handleWebhook(rawBody, "valid-signature", "event-a");

  assert.equal(first.payment.status, "PAID");
  assert.equal(first.duplicate, false);
  assert.deepEqual(duplicate, { received: true, duplicate: true });
  assert.equal(calls.filter(([kind]) => kind === "payment").length, 1);
});

test("authorized customer cannot verify another customer's payment", async () => {
  const { service } = createHarness();
  await assert.rejects(
    () => service.verifyPayment("customer-b", {
      razorpayOrderId: "rzp-order-a",
      razorpayPaymentId: "rzp-payment-a",
      razorpaySignature: "valid-signature",
    }),
    { code: "PAYMENT_NOT_FOUND" },
  );
});

test("Razorpay signature verification rejects malformed signatures without throwing", () => {
  const provider = createRazorpayProvider({
    keyId: "test-key",
    keySecret: "test-secret",
    webhookSecret: "test-webhook-secret",
  });
  const checkout = {
    razorpayOrderId: "order-a",
    razorpayPaymentId: "payment-a",
  };
  const checkoutSignature = crypto.createHmac("sha256", "test-secret")
    .update("order-a|payment-a")
    .digest("hex");
  const rawBody = Buffer.from('{"event":"payment.captured"}');
  const webhookSignature = crypto.createHmac("sha256", "test-webhook-secret")
    .update(rawBody)
    .digest("hex");

  assert.equal(provider.verifyCheckoutSignature({ ...checkout, razorpaySignature: checkoutSignature }), true);
  assert.equal(provider.verifyCheckoutSignature({ ...checkout, razorpaySignature: "invalid" }), false);
  assert.equal(provider.verifyWebhookSignature(rawBody, webhookSignature), true);
  assert.equal(provider.verifyWebhookSignature(rawBody, "invalid"), false);
});

test("Razorpay provider fetches order evidence and its payment list with TEST credentials", async () => {
  const provider = createRazorpayProvider({
    keyId: "rzp_test_example",
    keySecret: "test-secret",
  });
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), options });
    const body = String(url).endsWith("/payments")
      ? { items: [{ id: "rzp-payment-a", status: "captured" }] }
      : { id: "rzp-order-a", status: "paid" };
    return new Response(JSON.stringify(body), { status: 200 });
  };

  try {
    assert.equal(provider.testMode, true);
    assert.deepEqual(await provider.fetchOrder("rzp-order-a"), { id: "rzp-order-a", status: "paid" });
    assert.deepEqual(await provider.fetchOrderPayments("rzp-order-a"), [{ id: "rzp-payment-a", status: "captured" }]);
    assert.deepEqual(requests.map(({ url }) => url), [
      "https://api.razorpay.com/v1/orders/rzp-order-a",
      "https://api.razorpay.com/v1/orders/rzp-order-a/payments",
    ]);
    assert.ok(requests.every(({ options }) => options.headers.Authorization.startsWith("Basic ")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
