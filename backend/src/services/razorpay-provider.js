import crypto from "node:crypto";

export function createRazorpayProvider({ keyId, keySecret, webhookSecret } = {}) {
  const configured = Boolean(keyId && keySecret);
  const testMode = Boolean(keyId?.startsWith("rzp_test_"));

  async function createOrder({ amount, currency = "INR", receipt, notes }) {
    if (!configured) throw new Error("Razorpay is not configured.");
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
      body: JSON.stringify({ amount: Math.round(amount * 100), currency, receipt, notes })
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Razorpay order creation failed: ${response.status} ${text}`);
    }
    return response.json();
  }

  async function fetchPayment(paymentId) {
    if (!configured) throw new Error("Razorpay is not configured.");
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const response = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: `Basic ${auth}` }
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Razorpay payment fetch failed: ${response.status} ${text}`);
    }
    return response.json();
  }

  async function fetchOrder(orderId) {
    if (!configured) throw new Error("Razorpay is not configured.");
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const response = await fetch(`https://api.razorpay.com/v1/orders/${encodeURIComponent(orderId)}`, {
      headers: { Authorization: `Basic ${auth}` }
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Razorpay order fetch failed: ${response.status} ${text}`);
    }
    return response.json();
  }

  async function fetchOrderPayments(orderId) {
    if (!configured) throw new Error("Razorpay is not configured.");
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const response = await fetch(`https://api.razorpay.com/v1/orders/${encodeURIComponent(orderId)}/payments`, {
      headers: { Authorization: `Basic ${auth}` }
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Razorpay order payments fetch failed: ${response.status} ${text}`);
    }
    const result = await response.json();
    if (!Array.isArray(result.items)) {
      throw new Error("Razorpay returned invalid order payment details.");
    }
    return result.items;
  }

  function verifyCheckoutSignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
    if (!keySecret) return false;
    const expected = crypto.createHmac("sha256", keySecret).update(`${razorpayOrderId}|${razorpayPaymentId}`).digest("hex");
    if (typeof razorpaySignature !== "string" || !/^[a-f0-9]{64}$/i.test(razorpaySignature)) return false;
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(razorpaySignature, "hex"));
  }

  function verifyWebhookSignature(rawBody, signature) {
    if (!webhookSecret) return false;
    if (!Buffer.isBuffer(rawBody) || typeof signature !== "string" || !/^[a-f0-9]{64}$/i.test(signature)) return false;
    const expected = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
  }

  return { configured, testMode, createOrder, fetchPayment, fetchOrder, fetchOrderPayments, verifyCheckoutSignature, verifyWebhookSignature };
}

export const razorpayProvider = createRazorpayProvider({
  keyId: process.env.RAZORPAY_KEY_ID,
  keySecret: process.env.RAZORPAY_KEY_SECRET,
  webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET
});
