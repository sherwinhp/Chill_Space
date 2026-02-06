const { createOrder, captureOrder } = require("../services/paypalService");
const { createPayNowPaymentRequest, getPaymentRequestStatus } = require("../services/hitpayService");
const { createNetsQr, getTxnStatus } = require("../services/netService");
const {
  createGrabPayCheckoutSession,
  retrieveCheckoutSession,
  createCardPaymentIntent,
  createCardPaymentIntentWithPaymentMethod,
  confirmCardPaymentIntent,
} = require("../services/stripe");
const { findById } = require("../models/usersModel");
const { getTotalSpendCents } = require("../models/transactionsModel");
const {
  listWalletTransactions,
  getWalletBalanceCents,
  getWalletPendingBalanceCents,
  syncWalletStateForUser,
  createPendingPaypalTopup,
  createPendingTopup,
  bindProviderRef,
  markWalletTransactionStatus,
  findWalletTransactionByProviderRef,
  completePaypalTopup,
  completeTopupByProviderRef,
} = require("../models/walletModel");

const MIN_TOPUP_CENTS = 100;
const MAX_TOPUP_CENTS = 50000;
const CASHBACK_RATE_BY_TIER = {
  Bronze: 0.02,
  Silver: 0.03,
  Gold: 0.05,
};

function parseExpiryInput(expiry) {
  if (!expiry || typeof expiry !== "string") return { expMonth: null, expYear: null };
  const match = expiry.trim().match(/^(\d{1,2})\s*\/\s*(\d{2,4})$/);
  if (!match) return { expMonth: null, expYear: null };
  return { expMonth: match[1], expYear: match[2] };
}

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

function buildBaseUrl(req) {
  return `${req.protocol}://${req.get("host")}`;
}

async function renderWallet(req, res) {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    await syncWalletStateForUser(userId);
    const [transactions, availableCents, pendingCents, user, totalSpentCents] =
      await Promise.all([
        listWalletTransactions(userId, 20),
        getWalletBalanceCents(userId),
        getWalletPendingBalanceCents(userId),
        findById(userId),
        getTotalSpendCents(userId),
      ]);
    const tierName = user ? user.membership_tier : "Bronze";
    const cashbackRate =
      CASHBACK_RATE_BY_TIER[tierName] ?? CASHBACK_RATE_BY_TIER.Bronze;
    res.render("wallet", {
      walletBalance: Number(availableCents || 0),
      walletPending: Number(pendingCents || 0),
      membershipTier: tierName,
      cashbackRate,
      totalSpentCents: Number(totalSpentCents || 0),
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

async function createHitpayTopup(req, res) {
  const userId = requireUser(req, res, { json: true });
  if (!userId) return;

  const amountCents = parseAmountCents(req.body ? req.body.amount : null);
  if (!amountCents || amountCents < MIN_TOPUP_CENTS || amountCents > MAX_TOPUP_CENTS) {
    return res.status(400).json({ error: "Top-up amount must be between $1.00 and $500.00." });
  }

  let walletTransactionId = null;
  try {
    const amount = (amountCents / 100).toFixed(2);
    walletTransactionId = await createPendingTopup(userId, amountCents, "hitpay", {
      source: "wallet_topup",
    });
    const payment = await createPayNowPaymentRequest({
      amount,
      currency: "SGD",
      email: req.session.email,
      name: req.session.name || "Customer",
      referenceNumber: `wallet-topup-${userId}-${Date.now()}`,
      redirectUrl: `${buildBaseUrl(req)}/wallet/topup/hitpay/return`,
    });
    await bindProviderRef(walletTransactionId, userId, payment.id, {
      source: "wallet_topup",
      amount,
      requestId: payment.id,
    });
    return res.json({ paymentUrl: payment.url, id: payment.id });
  } catch (error) {
    if (walletTransactionId) {
      await markWalletTransactionStatus({
        transactionId: walletTransactionId,
        userId,
        status: "failed",
        metadata: { source: "wallet_topup", reason: error.message || "create_failed" },
      });
    }
    return res.status(500).json({ error: error.message || "Unable to start PayNow top-up." });
  }
}

async function handleHitpayTopupReturn(req, res) {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const requestId = req.query.reference || req.query.request_id || req.query.id;
    if (!requestId) {
      return res.redirect("/wallet?topup=missing_reference");
    }

    const linkedTx = await findWalletTransactionByProviderRef(userId, "hitpay", requestId);
    if (!linkedTx) {
      return res.redirect("/wallet?topup=not_found");
    }

    if (linkedTx.status === "completed") {
      return res.redirect("/wallet?topup=success");
    }

    const paymentRequest = await getPaymentRequestStatus(requestId);
    const paid =
      String(paymentRequest.status || "").toLowerCase() === "completed" ||
      (Array.isArray(paymentRequest.payments) &&
        paymentRequest.payments.some(
          (payment) => String(payment.status || "").toLowerCase() === "succeeded"
        ));

    if (!paid) {
      await markWalletTransactionStatus({
        transactionId: linkedTx.id,
        userId,
        status: "failed",
        metadata: paymentRequest,
      });
      return res.redirect("/wallet?topup=failed");
    }

    const result = await completeTopupByProviderRef({
      userId,
      provider: "hitpay",
      providerRef: requestId,
      capturedAmountCents: linkedTx.amount_cents,
      metadata: paymentRequest,
    });

    return res.redirect(`/wallet?topup=success&balance=${result.balanceCents}`);
  } catch (error) {
    return res.redirect(
      `/wallet?topup=error&message=${encodeURIComponent(
        error.message || "Unable to verify PayNow top-up."
      )}`
    );
  }
}

async function createGrabPayTopupSession(req, res) {
  const userId = requireUser(req, res, { json: true });
  if (!userId) return;

  const amountCents = parseAmountCents(req.body ? req.body.amount : null);
  if (!amountCents || amountCents < MIN_TOPUP_CENTS || amountCents > MAX_TOPUP_CENTS) {
    return res.status(400).json({ error: "Top-up amount must be between $1.00 and $500.00." });
  }

  let walletTransactionId = null;
  try {
    walletTransactionId = await createPendingTopup(userId, amountCents, "grabpay", {
      source: "wallet_topup",
    });
    const lineItems = [
      {
        price_data: {
          currency: "sgd",
          unit_amount: amountCents,
          product_data: { name: "Wallet Top-up" },
        },
        quantity: 1,
      },
    ];
    const baseUrl = buildBaseUrl(req);
    const session = await createGrabPayCheckoutSession({
      lineItems,
      successUrl: `${baseUrl}/wallet/topup/stripe/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${baseUrl}/wallet?topup=cancel`,
      customerEmail: req.session.email,
      metadata: {
        userId: String(userId),
        walletTopup: "1",
        amountCents: String(amountCents),
      },
    });

    await bindProviderRef(walletTransactionId, userId, session.id, {
      source: "wallet_topup",
      amountCents,
      sessionId: session.id,
    });

    return res.json({ url: session.url });
  } catch (error) {
    if (walletTransactionId) {
      await markWalletTransactionStatus({
        transactionId: walletTransactionId,
        userId,
        status: "failed",
        metadata: { source: "wallet_topup", reason: error.message || "create_failed" },
      });
    }
    return res.status(500).json({ error: error.message || "Unable to start GrabPay top-up." });
  }
}

async function handleGrabPayTopupSuccess(req, res) {
  const userId = requireUser(req, res);
  if (!userId) return;
  const sessionId = req.query.session_id;
  if (!sessionId) {
    return res.redirect("/wallet?topup=missing_intent");
  }
  try {
    const session = await retrieveCheckoutSession(sessionId);
    if (!session || session.payment_status !== "paid") {
      return res.redirect("/wallet?topup=failed");
    }
    if (session.metadata?.userId && Number(session.metadata.userId) !== Number(userId)) {
      return res.status(403).send("Not authorized to view this session.");
    }
    const linkedTx = await findWalletTransactionByProviderRef(userId, "grabpay", session.id);
    if (!linkedTx) {
      return res.redirect("/wallet?topup=not_found");
    }
    if (linkedTx.status !== "completed") {
      await completeTopupByProviderRef({
        userId,
        provider: "grabpay",
        providerRef: session.id,
        capturedAmountCents: session.amount_total,
        metadata: session,
      });
    }
    return res.redirect("/wallet?topup=success");
  } catch (error) {
    return res.redirect(
      `/wallet?topup=error&message=${encodeURIComponent(
        error.message || "Unable to verify GrabPay top-up."
      )}`
    );
  }
}

async function createNetsTopupQr(req, res) {
  const userId = requireUser(req, res, { json: true });
  if (!userId) return;

  const amountCents = parseAmountCents(req.body ? req.body.amount : null);
  if (!amountCents || amountCents < MIN_TOPUP_CENTS || amountCents > MAX_TOPUP_CENTS) {
    return res.status(400).json({ error: "Top-up amount must be between $1.00 and $500.00." });
  }

  let walletTransactionId = null;
  try {
    walletTransactionId = await createPendingTopup(userId, amountCents, "nets", {
      source: "wallet_topup",
    });
    const { qrCodeUrl, txnRetrievalRef } = await createNetsQr(amountCents / 100);
    await bindProviderRef(walletTransactionId, userId, txnRetrievalRef, {
      source: "wallet_topup",
      amountCents,
      txnRetrievalRef,
    });
    return res.json({ qrCodeUrl, txnRetrievalRef });
  } catch (error) {
    if (walletTransactionId) {
      await markWalletTransactionStatus({
        transactionId: walletTransactionId,
        userId,
        status: "failed",
        metadata: { source: "wallet_topup", reason: error.message || "create_failed" },
      });
    }
    return res.status(500).json({ error: error.message || "Unable to create NETS QR." });
  }
}

async function completeNetsTopup(req, res) {
  const userId = requireUser(req, res, { json: true });
  if (!userId) return;
  try {
    const txnRetrievalRef = req.body?.txnRetrievalRef || req.query?.txnRetrievalRef;
    if (!txnRetrievalRef) {
      return res.status(400).json({ error: "Missing txnRetrievalRef." });
    }
    const linkedTx = await findWalletTransactionByProviderRef(userId, "nets", txnRetrievalRef);
    if (!linkedTx) {
      return res.status(404).json({ error: "Top-up request not found." });
    }
    if (linkedTx.status === "completed") {
      const balanceCents = await getWalletBalanceCents(userId);
      return res.json({ success: true, alreadyProcessed: true, balanceCents });
    }

    const status = await getTxnStatus(txnRetrievalRef);
    const responseCode =
      status?.response_code ?? status?.result?.response_code ?? status?.result?.responseCode;
    const txnStatus =
      status?.txn_status ?? status?.result?.txn_status ?? status?.result?.txnStatus;
    const normalizedTxnStatus =
      typeof txnStatus === "string" ? txnStatus.trim().toLowerCase() : txnStatus;
    const success =
      String(responseCode) === "00" &&
      (Number(normalizedTxnStatus) === 1 ||
        normalizedTxnStatus === "success" ||
        normalizedTxnStatus === "completed");

    if (!success) {
      await markWalletTransactionStatus({
        transactionId: linkedTx.id,
        userId,
        status: "failed",
        metadata: status,
      });
      return res.status(400).json({ error: "NETS top-up not completed." });
    }

    const result = await completeTopupByProviderRef({
      userId,
      provider: "nets",
      providerRef: txnRetrievalRef,
      capturedAmountCents: linkedTx.amount_cents,
      metadata: status,
    });
    return res.json({
      success: true,
      alreadyProcessed: result.alreadyProcessed,
      balanceCents: result.balanceCents,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Unable to complete NETS top-up." });
  }
}

async function createStripeCardTopup(req, res) {
  const userId = requireUser(req, res, { json: true });
  if (!userId) return;

  const amountCents = parseAmountCents(req.body ? req.body.amount : null);
  if (!amountCents || amountCents < MIN_TOPUP_CENTS || amountCents > MAX_TOPUP_CENTS) {
    return res.status(400).json({ error: "Top-up amount must be between $1.00 and $500.00." });
  }

  const body = req.body || {};
  const paymentMethodId = body.payment_method_id;
  const billing = {
    name: body.card_name || req.session?.name,
    email: body.card_email || req.session?.email,
    country: body.billing_country || null,
    postalCode: body.postal_code || null,
  };
  const ipCountry = req.headers["cf-ipcountry"] || req.headers["x-country-code"] || null;

  let walletTransactionId = null;
  try {
    walletTransactionId = await createPendingTopup(userId, amountCents, "stripe", {
      source: "wallet_topup",
    });
    let result;
    if (paymentMethodId) {
      result = await createCardPaymentIntentWithPaymentMethod({
        amount: amountCents / 100,
        currency: "sgd",
        paymentMethodId,
        billing,
        userId,
        description: "Wallet top-up",
        metadata: {
          wallet_topup: "1",
          wallet_transaction_id: String(walletTransactionId),
        },
        ipCountry,
        returnUrl: `${buildBaseUrl(req)}/wallet?topup=stripe_return`,
      });
    } else {
      const parsedExpiry = parseExpiryInput(body.card_expiry || "");
      const card = {
        number: body.card_number,
        expMonth: body.card_exp_month ?? parsedExpiry.expMonth,
        expYear: body.card_exp_year ?? parsedExpiry.expYear,
        cvc: body.cvc || body.card_cvc || body.card_cvv,
      };
      if (!card.number || !card.expMonth || !card.expYear || !card.cvc) {
        return res.status(400).json({ error: "Missing card details." });
      }
      result = await createCardPaymentIntent({
        amount: amountCents / 100,
        currency: "sgd",
        card,
        billing,
        description: "Wallet top-up",
        metadata: {
          wallet_topup: "1",
          wallet_transaction_id: String(walletTransactionId),
        },
        userId,
        ipCountry,
        returnUrl: `${buildBaseUrl(req)}/wallet?topup=stripe_return`,
      });
    }

    await bindProviderRef(walletTransactionId, userId, result.paymentIntentId, {
      source: "wallet_topup",
      paymentIntentId: result.paymentIntentId,
    });

    if (result.status === "succeeded") {
      const completed = await completeTopupByProviderRef({
        userId,
        provider: "stripe",
        providerRef: result.paymentIntentId,
        capturedAmountCents: amountCents,
        metadata: result,
      });
      return res.json({
        success: true,
        transactionId: completed.transactionId,
        balanceCents: completed.balanceCents,
      });
    }

    return res.json({
      requiresAction: result.requiresAction,
      clientSecret: result.clientSecret,
      paymentIntentId: result.paymentIntentId,
    });
  } catch (error) {
    if (walletTransactionId) {
      await markWalletTransactionStatus({
        transactionId: walletTransactionId,
        userId,
        status: "failed",
        metadata: { source: "wallet_topup", reason: error.message || "payment_failed" },
      });
    }
    return res.status(500).json({ error: error.message || "Stripe top-up failed." });
  }
}

async function confirmStripeCardTopup(req, res) {
  const userId = requireUser(req, res, { json: true });
  if (!userId) return;
  try {
    const paymentIntentId = req.body?.payment_intent_id;
    if (!paymentIntentId) {
      return res.status(400).json({ error: "Missing payment intent." });
    }

    const intent = await confirmCardPaymentIntent(paymentIntentId);
    if (!intent || intent.status !== "succeeded") {
      return res.status(400).json({ error: "Stripe payment was not completed." });
    }

    const completed = await completeTopupByProviderRef({
      userId,
      provider: "stripe",
      providerRef: paymentIntentId,
      capturedAmountCents: intent.amount || 0,
      metadata: intent,
    });

    return res.json({
      success: true,
      transactionId: completed.transactionId,
      balanceCents: completed.balanceCents,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Stripe top-up failed." });
  }
}

module.exports = {
  renderWallet,
  createPaypalTopup,
  capturePaypalTopup,
  createHitpayTopup,
  handleHitpayTopupReturn,
  createGrabPayTopupSession,
  handleGrabPayTopupSuccess,
  createNetsTopupQr,
  completeNetsTopup,
  createStripeCardTopup,
  confirmStripeCardTopup,
};
