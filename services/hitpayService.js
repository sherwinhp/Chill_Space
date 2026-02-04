require("dotenv").config();

const HITPAY_API_KEY = process.env.HITPAY_API_KEY || process.env.API_KEY;
const HITPAY_BASE_URL = normalizeBaseUrl(
  process.env.HITPAY_API_BASE_URL || process.env.HITPAY_URL || "https://api.sandbox.hit-pay.com/v1"
);

function normalizeBaseUrl(value) {
  const input = String(value || "").trim().replace(/\/+$/, "");
  if (!input) return "https://api.sandbox.hit-pay.com/v1";
  // Allow users to set either:
  // - https://api.sandbox.hit-pay.com
  // - https://api.sandbox.hit-pay.com/v1
  // - https://api.sandbox.hit-pay.com/v1/payment-requests
  const withoutPaymentRequests = input.replace(/\/payment-requests$/i, "");
  if (withoutPaymentRequests.endsWith("/v1")) return withoutPaymentRequests;
  return `${withoutPaymentRequests}/v1`;
}

async function parseHitpayResponse(response, fallbackMessage) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const data = await response.json();
    return { data, detail: data && (data.message || data.error) ? data.message || data.error : fallbackMessage };
  }
  const text = await response.text();
  const detail = text && text.trim() ? text.slice(0, 200) : fallbackMessage;
  return { data: null, detail };
}

function ensureConfig() {
  if (!HITPAY_API_KEY) {
    throw new Error("Missing HITPAY_API_KEY in environment.");
  }
}

async function createPayNowPaymentRequest({
  amount,
  currency = "SGD",
  email,
  name,
  referenceNumber,
  redirectUrl,
}) {
  ensureConfig();
  const response = await fetch(`${HITPAY_BASE_URL}/payment-requests`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-BUSINESS-API-KEY": HITPAY_API_KEY,
      "X-API-KEY": HITPAY_API_KEY,
    },
    body: JSON.stringify({
      amount: Number(amount),
      currency,
      email,
      name,
      reference_number: referenceNumber,
      redirect_url: redirectUrl,
      payment_methods: ["paynow_online"],
    }),
  });

  const { data, detail } = await parseHitpayResponse(
    response,
    "Unable to create HitPay payment request."
  );
  if (!response.ok || !data.id || !data.url) {
    throw new Error(detail);
  }

  return data;
}

async function getPaymentRequestStatus(requestId) {
  ensureConfig();
  const response = await fetch(`${HITPAY_BASE_URL}/payment-requests/${requestId}`, {
    method: "GET",
    headers: {
      "X-BUSINESS-API-KEY": HITPAY_API_KEY,
      "X-API-KEY": HITPAY_API_KEY,
    },
  });

  const { data, detail } = await parseHitpayResponse(
    response,
    "Unable to fetch HitPay payment status."
  );
  if (!response.ok || !data.id) {
    throw new Error(detail);
  }
  return data;
}

module.exports = {
  createPayNowPaymentRequest,
  getPaymentRequestStatus,
};
