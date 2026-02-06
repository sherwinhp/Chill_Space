require("dotenv").config();

const NETS_API_KEY = process.env.NETS_API_KEY || process.env.API_KEY;
const NETS_PROJECT_ID = process.env.NETS_PROJECT_ID || process.env.PROJECT_ID;

// Default to static txn_id only for sandbox unless overridden.
const SANDBOX_TXN_ID =
  process.env.NETS_TXN_ID ||
  "sandbox_nets|m|8ff8e5b6-d43e-4786-8ac5-7accf8c5bd9b";
const NETS_TXN_ID_MODE = (process.env.NETS_TXN_ID_MODE || "").toLowerCase();

const NETS_QR_CREATE_URL =
  process.env.NETS_QR_CREATE_URL ||
  "https://sandbox.nets.openapipaas.com/api/v1/common/payments/nets-qr/request";

const NETS_TXN_STATUS_URL =
  process.env.NETS_TXN_STATUS_URL ||
  "https://sandbox.nets.openapipaas.com/api/v1/common/payments/nets-qr/query";

const IS_SANDBOX_ENV = /sandbox/i.test(NETS_QR_CREATE_URL || "");

function normalizeConfigValue(value) {
  return String(value || "").trim();
}

function ensureConfig() {
  const apiKey = normalizeConfigValue(NETS_API_KEY);
  const projectId = normalizeConfigValue(NETS_PROJECT_ID);
  if (!apiKey) {
    throw new Error("Missing NETS API key (set NETS_API_KEY or API_KEY).");
  }
  if (!projectId) {
    throw new Error(
      "Missing NETS project id (set NETS_PROJECT_ID or PROJECT_ID)."
    );
  }
  return { apiKey, projectId };
}

function buildHeaders() {
  const { apiKey, projectId } = ensureConfig();
  return {
    "api-key": apiKey,
    // Some docs/slides use `project-id`; others use `projectid-key`.
    "project-id": projectId,
    "projectid-key": projectId,
    "Content-Type": "application/json",
  };
}

function buildTxnId() {
  const fallbackMode = IS_SANDBOX_ENV ? "static" : "random";
  const mode = NETS_TXN_ID_MODE || fallbackMode;
  if (mode === "static") {
    return normalizeConfigValue(SANDBOX_TXN_ID);
  }
  const rand = Math.random().toString(16).slice(2, 10);
  return `nets_${Date.now()}_${rand}`;
}

async function parseNetsResponse(response, fallbackMessage) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      const data = await response.json();
      const detail =
        data?.result?.data?.error_message ||
        data?.result?.message ||
        data?.message ||
        fallbackMessage;
      return { data, detail };
    } catch {
      return { data: null, detail: fallbackMessage };
    }
  }
  const text = await response.text();
  const detail = text && text.trim() ? text.slice(0, 200) : fallbackMessage;
  return { data: null, detail };
}

async function createNetsQr(cartTotal) {
  ensureConfig();

  const amount = Number(cartTotal);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Invalid cart total");
  }

  let response;
  try {
    response = await fetch(NETS_QR_CREATE_URL, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify({
        txn_id: buildTxnId(),
        amt_in_dollars: Number(amount.toFixed(2)).toFixed(2),
        notify_mobile: 0,
      }),
    });
  } catch (error) {
    throw new Error(error?.message || "Unable to reach NETS QR service.");
  }

  const { data, detail } = await parseNetsResponse(
    response,
    "Failed to generate NETS QR."
  );

  const resultData = data?.result?.data;
  const qrValue =
    typeof resultData?.qr_code === "string"
      ? resultData.qr_code
      : typeof resultData?.qr_code_url === "string"
        ? resultData.qr_code_url
        : typeof resultData?.qr_code_link === "string"
          ? resultData.qr_code_link
          : null;
  const qrCodeUrl =
    qrValue && qrValue.startsWith("data:image")
      ? qrValue
      : qrValue
        ? `data:image/png;base64,${qrValue}`
        : null;
  if (!response.ok || !qrCodeUrl || !resultData?.txn_retrieval_ref) {
    throw new Error(detail || "Failed to generate NETS QR");
  }

  return {
    qrCodeUrl,
    txnRetrievalRef: resultData.txn_retrieval_ref,
  };
}

async function getTxnStatus(txnRetrievalRef) {
  ensureConfig();
  if (!txnRetrievalRef) throw new Error("Missing txnRetrievalRef");

  let response;
  try {
    response = await fetch(NETS_TXN_STATUS_URL, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify({
        txn_retrieval_ref: txnRetrievalRef,
        frontend_timeout_status: 0,
      }),
    });
  } catch (error) {
    throw new Error(error?.message || "Unable to reach NETS status service.");
  }

  const { data, detail } = await parseNetsResponse(
    response,
    "Unable to query NETS transaction status."
  );
  const resultData = data?.result?.data;
  if (!response.ok || !resultData) {
    throw new Error(detail || "Unable to query NETS transaction status.");
  }

  return resultData;
}

module.exports = { createNetsQr, getTxnStatus };
