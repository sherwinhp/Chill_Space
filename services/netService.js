require("dotenv").config();

const NETS_API_KEY = process.env.NETS_API_KEY || process.env.API_KEY;
const NETS_PROJECT_ID = process.env.NETS_PROJECT_ID || process.env.PROJECT_ID;

// Use the same sandbox txn_id as NETSDemo (do not randomize).
const SANDBOX_TXN_ID =
  process.env.NETS_TXN_ID ||
  "sandbox_nets|m|8ff8e5b6-d43e-4786-8ac5-7accf8c5bd9b";

const NETS_QR_CREATE_URL =
  process.env.NETS_QR_CREATE_URL ||
  "https://sandbox.nets.openapipaas.com/api/v1/common/payments/nets-qr/request";

const NETS_TXN_STATUS_URL =
  process.env.NETS_TXN_STATUS_URL ||
  "https://sandbox.nets.openapipaas.com/api/v1/common/payments/nets-qr/query";

function ensureConfig() {
  if (!NETS_API_KEY) {
    throw new Error("Missing NETS API key (set NETS_API_KEY or API_KEY).");
  }
  if (!NETS_PROJECT_ID) {
    throw new Error(
      "Missing NETS project id (set NETS_PROJECT_ID or PROJECT_ID)."
    );
  }
}

function buildHeaders() {
  const headers = {
    "api-key": NETS_API_KEY,
    // Some docs/slides use `project-id`; others use `projectid-key`.
    "project-id": NETS_PROJECT_ID,
    "projectid-key": NETS_PROJECT_ID,
    "Content-Type": "application/json",
  };
  return headers;
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

  const response = await fetch(NETS_QR_CREATE_URL, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify({
      txn_id: SANDBOX_TXN_ID, // ✅ FIXED (do not randomize)
      amt_in_dollars: Number(amount.toFixed(2)),
      notify_mobile: 0,
    }),
  });

  const { data, detail } = await parseNetsResponse(
    response,
    "Failed to generate NETS QR."
  );

  const resultData = data?.result?.data;
  if (!response.ok || !resultData?.qr_code || !resultData?.txn_retrieval_ref) {
    throw new Error(detail || "Failed to generate NETS QR");
  }

  return {
    qrCodeUrl: `data:image/png;base64,${resultData.qr_code}`,
    txnRetrievalRef: resultData.txn_retrieval_ref,
  };
}

async function getTxnStatus(txnRetrievalRef) {
  ensureConfig();
  if (!txnRetrievalRef) throw new Error("Missing txnRetrievalRef");

  const response = await fetch(NETS_TXN_STATUS_URL, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify({
      txn_retrieval_ref: txnRetrievalRef,
      frontend_timeout_status: 0,
    }),
  });

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
