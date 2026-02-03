const { createOrder, captureOrder } = require("../services/paypalService");
const {
  listWalletTransactions,
  getWalletBalanceCents,
  createPendingPaypalTopup,
  bindProviderRef,
  markWalletTransactionStatus,
  findWalletTransactionByProviderRef,
  completePaypalTopup,
} = require("../models/walletModel");

const MIN_TOPUP_CENTS = 100;
const MAX_TOPUP_CENTS = 50000;

function requireUser(req, res, options = {}) {
  if (req.session && req.session.userId) return req.session.userId;
  if (options.json) {
    res.status(401).json({ error: "Login required." });
    return null;
  }
  res.redirect("/login?redirect=/wallet&reason=checkout");
  return null;
}

function parseAmountCents(raw) {
  if (raw == null) return null;
  const value = String(raw).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;
  const cents = Math.round(Number(value) * 100);
  if (!Number.isFinite(cents)) return null;
  return cents;
}

function extractCaptureAmountCents(capture) {
  const purchaseUnit = Array.isArray(capture.purchase_units) ? capture.purchase_units[0] : null;
  if (!purchaseUnit) return null;
  const paymentCapture =
    purchaseUnit.payments &&
    Array.isArray(purchaseUnit.payments.captures) &&
    purchaseUnit.payments.captures.length
      ? purchaseUnit.payments.captures[0]
      : null;
  const amount = paymentCapture && paymentCapture.amount ? paymentCapture.amount : purchaseUnit.amount;
  if (!amount || amount.value == null) return null;
  return parseAmountCents(amount.value);
}

async function renderWallet(req, res) {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const transactions = await listWalletTransactions(userId, 20);
    res.render("wallet", {
      walletBalance: Number(res.locals.walletBalance || 0),
      transactions,
    });
  } catch (error) {
    res.status(500).send(error.message || "Unable to load wallet.");
  }
}

async function createPaypalTopup(req, res) {
  const userId = requireUser(req, res, { json: true });
  if (!userId) return;

  const amountCents = parseAmountCents(req.body ? req.body.amount : null);
  if (!amountCents || amountCents < MIN_TOPUP_CENTS || amountCents > MAX_TOPUP_CENTS) {
    return res.status(400).json({ error: "Top-up amount must be between $1.00 and $500.00." });
  }

  let walletTransactionId = null;
  try {
    const amount = (amountCents / 100).toFixed(2);
    walletTransactionId = await createPendingPaypalTopup(userId, amountCents, {
      source: "wallet_topup",
    });
    const order = await createOrder(amount, "SGD");
    await bindProviderRef(walletTransactionId, userId, order.id, {
      source: "wallet_topup",
      amount,
      orderId: order.id,
    });
    return res.json({ id: order.id });
  } catch (error) {
    if (walletTransactionId) {
      await markWalletTransactionStatus({
        transactionId: walletTransactionId,
        userId,
        status: "failed",
        metadata: { source: "wallet_topup", reason: error.message || "create_failed" },
      });
    }
    return res.status(500).json({ error: error.message || "Unable to start top-up." });
  }
}

async function capturePaypalTopup(req, res) {
  const userId = requireUser(req, res, { json: true });
  if (!userId) return;

  const orderID = req.body ? req.body.orderID : null;
  if (!orderID) {
    return res.status(400).json({ error: "Missing order ID." });
  }

  let linkedTx;
  try {
    linkedTx = await findWalletTransactionByProviderRef(userId, "paypal", orderID);
    if (!linkedTx) {
      return res.status(404).json({ error: "Top-up request not found." });
    }

    if (linkedTx.status === "completed") {
      const balanceCents = await getWalletBalanceCents(userId);
      return res.json({
        success: true,
        alreadyProcessed: true,
        balanceCents,
      });
    }

    const capture = await captureOrder(orderID);
    if (capture.status !== "COMPLETED") {
      const mappedStatus = capture.status === "VOIDED" ? "cancelled" : "failed";
      await markWalletTransactionStatus({
        transactionId: linkedTx.id,
        userId,
        status: mappedStatus,
        metadata: capture,
      });
      return res.status(400).json({ error: "PayPal top-up was not completed." });
    }

    const capturedAmountCents = extractCaptureAmountCents(capture);
    const result = await completePaypalTopup({
      userId,
      providerRef: orderID,
      capturedAmountCents,
      metadata: capture,
    });

    return res.json({
      success: true,
      alreadyProcessed: result.alreadyProcessed,
      balanceCents: result.balanceCents,
    });
  } catch (error) {
    if (linkedTx && linkedTx.id) {
      await markWalletTransactionStatus({
        transactionId: linkedTx.id,
        userId,
        status: "failed",
        metadata: { source: "wallet_topup", reason: error.message || "capture_failed" },
      });
    }
    return res.status(500).json({ error: error.message || "Unable to complete top-up." });
  }
}

module.exports = {
  renderWallet,
  createPaypalTopup,
  capturePaypalTopup,
};
