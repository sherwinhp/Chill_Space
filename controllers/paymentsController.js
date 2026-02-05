const crypto = require("crypto");
const {
  listCartItems,
  removeExpiredRoomBookings,
} = require("../models/cartModel");
const { createOrder, captureOrder } = require("../services/paypalService");
const { createNetsQr, getTxnStatus } = require("../services/netService");
const {
  createTransactionFromCart,
  findTransactionByProviderOrderId,
} = require("../models/transactionsModel");
const { releaseBookingHold } = require("../models/bookingsModel");
const { payWithWallet, issueTransactionCashbackIfEligible } = require("../models/walletModel");
const {
  createPayNowPaymentRequest,
  getPaymentRequestStatus,
} = require("../services/hitpayService");
const { upsertPaymentMethod } = require("../models/paymentMethodsModel");
const {
  createCardPaymentIntent,
  createGrabPayCheckoutSession,
  retrieveCheckoutSession,
  constructWebhookEvent,
} = require("../services/stripe");

function isNetsPaymentSuccessful(status) {
  const responseCode =
    status?.response_code ?? status?.result?.response_code ?? status?.result?.responseCode;
  const txnStatus =
    status?.txn_status ?? status?.result?.txn_status ?? status?.result?.txnStatus;
  const normalizedTxnStatus =
    typeof txnStatus === "string" ? txnStatus.trim().toLowerCase() : txnStatus;

  return (
    String(responseCode) === "00" &&
    (Number(normalizedTxnStatus) === 1 ||
      normalizedTxnStatus === "success" ||
      normalizedTxnStatus === "completed")
  );
}

function getOwner(req) {
  const userId = req.session ? req.session.userId : null;
  const sessionId = req.cartSid || null;
  return { userId, sessionId };
}

async function createPaypalOrder(req, res) {
  try {
    const { userId, sessionId } = getOwner(req);
    const items = await listCartItems({ userId, sessionId });
    if (!items.length) {
      return res.status(400).json({ error: "Cart is empty." });
    }

    const total = items.reduce(
      (sum, item) => sum + Number(item.price) * Number(item.qty || 1),
      0
    );
    if (!Number.isFinite(total) || total <= 0) {
      return res.status(400).json({ error: "Invalid cart total." });
    }

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const order = await createOrder(total.toFixed(2), "SGD", {
      returnUrl: `${baseUrl}/checkout?paypal=success`,
      cancelUrl: `${baseUrl}/checkout?paypal=cancel`,
    });

    const approveLink =
      Array.isArray(order.links) &&
      order.links.find((link) => link.rel === "approve");
    if (!approveLink) {
      return res.status(500).json({ error: "Missing PayPal approval link." });
    }

    return res.json({ approvalUrl: approveLink.href });
  } catch (error) {
    return res.status(500).json({ error: error.message || "PayPal error." });
  }
}

async function createPaypalButtonOrder(req, res) {
  try {
    const { userId, sessionId } = getOwner(req);
    const items = await listCartItems({ userId, sessionId });
    if (!items.length) {
      return res.status(400).json({ error: "Cart is empty." });
    }

    const total = items.reduce(
      (sum, item) => sum + Number(item.price) * Number(item.qty || 1),
      0
    );
    if (!Number.isFinite(total) || total <= 0) {
      return res.status(400).json({ error: "Invalid cart total." });
    }

    const order = await createOrder(total.toFixed(2), "SGD");
    return res.json({ id: order.id });
  } catch (error) {
    return res.status(500).json({ error: error.message || "PayPal error." });
  }
}

async function capturePaypalButtonOrder(req, res) {
  try {
    const { userId, sessionId } = getOwner(req);
    if (!userId) {
      return res.status(401).json({ error: "Login required." });
    }
    const { orderID } = req.body || {};
    if (!orderID) {
      return res.status(400).json({ error: "Missing order ID." });
    }
    const capture = await captureOrder(orderID);
    if (capture.status !== "COMPLETED") {
      return res.json({
        status: capture.status,
        success: false,
        details: capture,
      });
    }

    const existing = await findTransactionByProviderOrderId(orderID, userId);
    if (existing) {
      return res.json({
        status: capture.status,
        success: true,
        transactionId: existing.transaction_id,
      });
    }

    const expiredHolds = await removeExpiredRoomBookings({
      userId,
      sessionId,
      now: new Date(),
    });
    await Promise.all(expiredHolds.map((holdId) => releaseBookingHold(holdId)));

    const items = await listCartItems({ userId, sessionId });
    if (!items.length) {
      return res.status(400).json({
        error: "Cart is empty. Payment captured but no invoice was created.",
      });
    }
    const payerId = capture.payer ? capture.payer.payer_id : "unknown";
    const payerEmail = capture.payer
      ? capture.payer.email_address || req.session.email
      : req.session.email;
    const transaction = await createTransactionFromCart({
      userId,
      sessionId,
      providerOrderId: orderID,
      items,
      payerId,
      payerEmail,
      status: capture.status,
    });
    issueTransactionCashbackIfEligible(transaction.transactionId).catch((error) => {
      console.error("Cashback reward issuance failed:", error.message);
    });

    return res.json({
      status: capture.status,
      success: true,
      transactionId: transaction.transactionId,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "PayPal error." });
  }
}

async function payCheckoutWithWallet(req, res) {
  try {
    const { userId, sessionId } = getOwner(req);
    if (!userId) {
      return res.status(401).json({ error: "Login required." });
    }

    const expiredHolds = await removeExpiredRoomBookings({
      userId,
      sessionId,
      now: new Date(),
    });
    await Promise.all(expiredHolds.map((holdId) => releaseBookingHold(holdId)));

    const items = await listCartItems({ userId, sessionId });
    if (!items.length) {
      return res.status(400).json({ error: "Cart is empty." });
    }

    const result = await payWithWallet({ userId, sessionId, items });
    issueTransactionCashbackIfEligible(result.transactionId).catch((error) => {
      console.error("Cashback reward issuance failed:", error.message);
    });
    return res.json({
      success: true,
      transactionId: result.transactionId,
      balanceCents: result.balanceCents,
    });
  } catch (error) {
    if (error.message === "Insufficient wallet balance.") {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: error.message || "Wallet payment failed." });
  }
}

async function createHitpayPayNowPayment(req, res) {
  try {
    const { userId, sessionId } = getOwner(req);
    if (!userId) {
      return res.status(401).json({ error: "Login required." });
    }

    const items = await listCartItems({ userId, sessionId });
    if (!items.length) {
      return res.status(400).json({ error: "Cart is empty." });
    }

    const total = items.reduce(
      (sum, item) => sum + Number(item.price) * Number(item.qty || 1),
      0
    );
    if (!Number.isFinite(total) || total <= 0) {
      return res.status(400).json({ error: "Invalid cart total." });
    }

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const payment = await createPayNowPaymentRequest({
      amount: total.toFixed(2),
      currency: "SGD",
      email: req.session.email,
      name: req.session.name || "Customer",
      referenceNumber: `user-${userId}-${Date.now()}`,
      redirectUrl: `${baseUrl}/payments/hitpay/return`,
    });

    return res.json({
      id: payment.id,
      paymentUrl: payment.url,
    });
  } catch (error) {
    console.error("HitPay create payment failed:", error.message);
    return res.status(500).json({ error: error.message || "HitPay error." });
  }
}

async function handleHitpayReturn(req, res) {
  try {
    const { userId, sessionId } = getOwner(req);
    if (!userId) {
      return res.redirect("/login?redirect=/checkout&reason=checkout");
    }

    const requestId = req.query.reference || req.query.request_id || req.query.id;
    if (!requestId) {
      return res.redirect("/checkout?hitpay=missing_reference");
    }

    const providerOrderId = `HITPAY-${requestId}`;
    const existing = await findTransactionByProviderOrderId(providerOrderId, userId);
    if (existing) {
      return res.redirect(`/invoice/${existing.transaction_id}`);
    }

    const paymentRequest = await getPaymentRequestStatus(requestId);
    const paid =
      String(paymentRequest.status || "").toLowerCase() === "completed" ||
      (Array.isArray(paymentRequest.payments) &&
        paymentRequest.payments.some(
          (payment) => String(payment.status || "").toLowerCase() === "succeeded"
        ));

    if (!paid) {
      return res.redirect("/checkout?hitpay=failed");
    }

    const expiredHolds = await removeExpiredRoomBookings({
      userId,
      sessionId,
      now: new Date(),
    });
    await Promise.all(expiredHolds.map((holdId) => releaseBookingHold(holdId)));

    const items = await listCartItems({ userId, sessionId });
    if (!items.length) {
      return res.redirect("/checkout?hitpay=empty_cart");
    }

    const transaction = await createTransactionFromCart({
      userId,
      sessionId,
      providerOrderId,
      items,
      payerId: paymentRequest.id || requestId,
      payerEmail: paymentRequest.email || req.session.email,
      status: "COMPLETED",
    });

    issueTransactionCashbackIfEligible(transaction.transactionId).catch((error) => {
      console.error("Cashback reward issuance failed:", error.message);
    });

    return res.redirect(`/invoice/${transaction.transactionId}`);
  } catch (error) {
    return res.redirect(
      `/checkout?hitpay=error&message=${encodeURIComponent(
        error.message || "Unable to verify HitPay payment."
      )}`
    );
  }
}

function parseExpiryInput(expiry) {
  if (!expiry || typeof expiry !== "string") return { expMonth: null, expYear: null };
  const match = expiry.trim().match(/^(\d{1,2})\s*\/\s*(\d{2,4})$/);
  if (!match) return { expMonth: null, expYear: null };
  return { expMonth: match[1], expYear: match[2] };
}

async function payCheckoutWithStripeCard(req, res) {
  try {
    const { userId, sessionId } = getOwner(req);
    if (!userId) {
      return res.status(401).json({ error: "Login required." });
    }

    const expiredHolds = await removeExpiredRoomBookings({
      userId,
      sessionId,
      now: new Date(),
    });
    await Promise.all(expiredHolds.map((holdId) => releaseBookingHold(holdId)));

    const items = await listCartItems({ userId, sessionId });
    if (!items.length) {
      return res.status(400).json({ error: "Cart is empty." });
    }

    const total = items.reduce(
      (sum, item) => sum + Number(item.price) * Number(item.qty || 1),
      0
    );
    if (!Number.isFinite(total) || total <= 0) {
      return res.status(400).json({ error: "Invalid cart total." });
    }

    const body = req.body || {};
    const expiryParsed = parseExpiryInput(body.card_expiry);
    const expMonth = body.exp_month || expiryParsed.expMonth;
    const expYear = body.exp_year || expiryParsed.expYear;

    const result = await createCardPaymentIntent({
      amount: total.toFixed(2),
      currency: "sgd",
      card: {
        number: body.card_number,
        expMonth,
        expYear,
        cvc: body.cvc,
      },
      billing: {
        name: body.card_name || req.session?.name,
        email: body.card_email || req.session?.email,
        country: body.billing_country || null,
        postalCode: body.postal_code || null,
      },
      description: `Chill Space order for user ${userId}`,
      metadata: { userId: String(userId), sessionId: String(sessionId || "") },
      userId,
      ipCountry: req.headers["cf-ipcountry"] || req.headers["x-country-code"] || null,
      returnUrl: `${req.protocol}://${req.get("host")}/checkout`,
    });

    if (result.requiresAction) {
      return res.json({
        requiresAction: true,
        redirectUrl: result.nextActionUrl,
        clientSecret: result.clientSecret,
        risk: result.risk,
        card: result.card,
      });
    }

    if (result.status !== "succeeded") {
      return res.status(400).json({
        error: "Stripe payment was not completed.",
        risk: result.risk,
      });
    }

    const providerOrderId = `STRIPE-CARD-${result.paymentIntentId}`;
    const existing = await findTransactionByProviderOrderId(providerOrderId, userId);
    if (existing) {
      return res.json({
        success: true,
        transactionId: existing.transaction_id,
        risk: result.risk,
        card: result.card,
      });
    }

    const transaction = await createTransactionFromCart({
      userId,
      sessionId,
      providerOrderId,
      items,
      payerId: result.paymentMethodId || "stripe_card",
      payerEmail: body.card_email || req.session?.email || "unknown",
      status: "COMPLETED",
    });
    if (result.paymentMethodId && result.card && result.card.last4 && result.card.brand) {
      upsertPaymentMethod({
        userId,
        provider: "stripe",
        token: result.paymentMethodId,
        brand: result.card.brand,
        last4: result.card.last4,
        funding: result.card.type,
      }).catch((error) => {
        if (error && error.code !== "ER_NO_SUCH_TABLE") {
          console.error("Payment method storage failed:", error.message);
        }
      });
    }
    issueTransactionCashbackIfEligible(transaction.transactionId).catch((error) => {
      console.error("Cashback reward issuance failed:", error.message);
    });

    return res.json({
      success: true,
      transactionId: transaction.transactionId,
      risk: result.risk,
      card: result.card,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Stripe payment failed." });
  }
}

function buildStripeSuccessUrl(req) {
  const base = process.env.STRIPE_SUCCESS_URL;
  const fallback = `${req.protocol}://${req.get("host")}/stripe/success?session_id={CHECKOUT_SESSION_ID}`;
  const url = base || fallback;
  if (url.includes("{CHECKOUT_SESSION_ID}")) return url;
  const join = url.includes("?") ? "&" : "?";
  return `${url}${join}session_id={CHECKOUT_SESSION_ID}`;
}

function buildStripeCancelUrl(req) {
  return (
    process.env.STRIPE_CANCEL_URL ||
    `${req.protocol}://${req.get("host")}/checkout?stripe=cancel`
  );
}

function buildGrabPayLineItems(items) {
  return items.map((item) => {
    const unitAmount = Math.round(Number(item.price) * 100);
    if (!Number.isFinite(unitAmount) || unitAmount <= 0) {
      throw new Error("Invalid item price.");
    }
    return {
      price_data: {
        currency: "sgd",
        unit_amount: unitAmount,
        product_data: {
          name: item.name,
        },
      },
      quantity: Number(item.qty || 1),
    };
  });
}

function buildIdempotencyKey({ userId, sessionId, items }) {
  const payload = JSON.stringify({
    userId,
    sessionId,
    items: items.map((item) => ({
      id: item.itemId || null,
      name: item.name,
      qty: Number(item.qty || 1),
      price: Number(item.price),
    })),
  });
  return crypto.createHash("sha256").update(payload).digest("hex");
}

async function createStripeGrabPaySession(req, res) {
  try {
    const { userId, sessionId } = getOwner(req);
    if (!userId) {
      return res.status(401).json({ error: "Login required." });
    }

    const expiredHolds = await removeExpiredRoomBookings({
      userId,
      sessionId,
      now: new Date(),
    });
    await Promise.all(expiredHolds.map((holdId) => releaseBookingHold(holdId)));

    const items = await listCartItems({ userId, sessionId });
    if (!items.length) {
      return res.status(400).json({ error: "Cart is empty." });
    }

    const lineItems = buildGrabPayLineItems(items);
    const session = await createGrabPayCheckoutSession({
      lineItems,
      successUrl: buildStripeSuccessUrl(req),
      cancelUrl: buildStripeCancelUrl(req),
      customerEmail: req.session?.email,
      metadata: { userId: String(userId), sessionId: String(sessionId || "") },
      idempotencyKey: buildIdempotencyKey({ userId, sessionId, items }),
    });

    if (!session || !session.url) {
      return res.status(500).json({ error: "Unable to start GrabPay payment." });
    }
    return res.json({ url: session.url });
  } catch (error) {
    console.error("GrabPay session create failed:", error.message);
    return res.status(500).json({ error: error.message || "GrabPay error." });
  }
}

async function finalizeGrabPayCheckout({ session, userIdOverride, sessionIdOverride }) {
  if (!session || session.payment_status !== "paid") {
    return { ok: false, reason: "not_paid" };
  }
  const userId = Number(userIdOverride || session.metadata?.userId || 0);
  if (!userId) {
    return { ok: false, reason: "missing_user" };
  }
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id || null;
  const providerOrderId = `STRIPE-GRABPAY-${session.id}`;
  const existing = await findTransactionByProviderOrderId(providerOrderId, userId);
  if (existing) {
    return { ok: true, transactionId: existing.transaction_id, existing: true };
  }

  const expiredHolds = await removeExpiredRoomBookings({
    userId,
    sessionId: sessionIdOverride || session.metadata?.sessionId || null,
    now: new Date(),
  });
  await Promise.all(expiredHolds.map((holdId) => releaseBookingHold(holdId)));

  const items = await listCartItems({
    userId,
    sessionId: sessionIdOverride || session.metadata?.sessionId || null,
  });
  if (!items.length) {
    return { ok: false, reason: "empty_cart" };
  }

  const transaction = await createTransactionFromCart({
    userId,
    sessionId: sessionIdOverride || session.metadata?.sessionId || null,
    providerOrderId,
    items,
    payerId: paymentIntentId || session.id || "grabpay",
    payerEmail: session.customer_details?.email || "unknown",
    status: "COMPLETED",
  });
  issueTransactionCashbackIfEligible(transaction.transactionId).catch((error) => {
    console.error("Cashback reward issuance failed:", error.message);
  });
  return { ok: true, transactionId: transaction.transactionId };
}

async function handleStripeSuccess(req, res) {
  const sessionId = req.query.session_id;
  if (!sessionId) {
    return res.redirect("/checkout?stripe=missing_intent");
  }
  if (!req.session || !req.session.userId) {
    const redirect = encodeURIComponent(req.originalUrl);
    return res.redirect(`/login?redirect=${redirect}&reason=checkout`);
  }

  try {
    const session = await retrieveCheckoutSession(sessionId);
    if (!session) {
      return res.redirect("/checkout?stripe=failed");
    }
    if (session.payment_status !== "paid") {
      return res.redirect("/checkout?stripe=pending");
    }
    if (
      session.metadata?.userId &&
      Number(session.metadata.userId) !== Number(req.session.userId)
    ) {
      return res.status(403).send("Not authorized to view this session.");
    }

    const result = await finalizeGrabPayCheckout({
      session,
      userIdOverride: req.session.userId,
      sessionIdOverride: req.cartSid,
    });
    if (!result.ok) {
      return res.redirect("/checkout?stripe=empty_cart");
    }
    return res.redirect(`/invoice/${result.transactionId}`);
  } catch (error) {
    console.error("Stripe success verification failed:", error.message);
    return res.redirect(
      `/checkout?stripe=error&message=${encodeURIComponent(
        error.message || "Unable to verify GrabPay payment."
      )}`
    );
  }
}

async function handleStripeWebhook(req, res) {
  const signature = req.headers["stripe-signature"];
  let event;
  try {
    event = constructWebhookEvent(req.body, signature);
  } catch (error) {
    console.error("Stripe webhook signature failed:", error.message);
    return res.status(400).send(`Webhook Error: ${error.message}`);
  }

  const session = event.data?.object;
  try {
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      await finalizeGrabPayCheckout({ session });
    } else if (event.type === "checkout.session.async_payment_failed") {
      console.warn("GrabPay async payment failed:", session?.id);
    }
  } catch (error) {
    console.error("Stripe webhook handling failed:", error.message);
    return res.status(500).send("Webhook handling failed.");
  }

  return res.json({ received: true });
}

module.exports = {
  createPaypalOrder,
  createPaypalButtonOrder,
  capturePaypalButtonOrder,
  payCheckoutWithWallet,
  payCheckoutWithStripeCard,
  createStripeGrabPaySession,
  handleStripeSuccess,
  handleStripeWebhook,
  createHitpayPayNowPayment,
  handleHitpayReturn,
  createNetsQrPayment: async (req, res) => {
    try {
      const { userId, sessionId } = getOwner(req);
      if (!userId) {
        return res.status(401).json({ error: "Login required." });
      }

      const items = await listCartItems({ userId, sessionId });
      if (!items.length) {
        return res.status(400).json({ error: "Cart is empty." });
      }

      const total = items.reduce(
        (sum, item) => sum + Number(item.price) * Number(item.qty || 1),
        0
      );
      if (!Number.isFinite(total) || total <= 0) {
        return res.status(400).json({ error: "Invalid cart total." });
      }

      const { qrCodeUrl, txnRetrievalRef } = await createNetsQr(total);
      if (req.session) {
        req.session.nets = {
          txnRetrievalRef,
          total: total.toFixed(2),
          createdAt: Date.now(),
        };
      }

      return res.json({
        qrCodeUrl,
        txnRetrievalRef,
        total: total.toFixed(2),
      });
    } catch (error) {
      console.error("NETS create QR failed:", error.message);
      return res.status(500).json({ error: error.message || "NETS error." });
    }
  },

  getNetsTxnStatus: async (req, res) => {
    try {
      const { userId } = getOwner(req);
      if (!userId) {
        return res.status(401).json({ error: "Login required." });
      }

      const txnRetrievalRef = req.params.txnRetrievalRef || req.query.txnRetrievalRef;
      if (!txnRetrievalRef) {
        return res.status(400).json({ error: "Missing txnRetrievalRef." });
      }

      const status = await getTxnStatus(txnRetrievalRef);
      return res.json({ status });
    } catch (error) {
      console.error("NETS status query failed:", error.message);
      return res.status(500).json({ error: error.message || "NETS error." });
    }
  },

  streamNetsTxnStatus: async (req, res) => {
    const { userId } = getOwner(req);
    if (!userId) {
      res.status(401).setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ error: "Login required." }));
    }

    const txnRetrievalRef = req.params.txnRetrievalRef;
    if (!txnRetrievalRef) {
      res.status(400).setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ error: "Missing txnRetrievalRef." }));
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    if (typeof res.flushHeaders === "function") {
      res.flushHeaders();
    }

    let pollCount = 0;
    const maxPolls = 60;
    const timer = setInterval(async () => {
      pollCount += 1;
      try {
        const status = await getTxnStatus(txnRetrievalRef);
        res.write(`data: ${JSON.stringify(status)}\n\n`);

        if (isNetsPaymentSuccessful(status)) {
          clearInterval(timer);
          res.write(`event: done\ndata: success\n\n`);
          return res.end();
        }

        if (pollCount >= maxPolls) {
          clearInterval(timer);
          res.write(`event: done\ndata: timeout\n\n`);
          return res.end();
        }
      } catch (error) {
        clearInterval(timer);
        res.write(
          `data: ${JSON.stringify({
            fail: true,
            error: true,
            details: error.message,
          })}\n\n`
        );
        return res.end();
      }
    }, 5000);

    req.on("close", () => clearInterval(timer));
  },

  completeNetsPayment: async (req, res) => {
    try {
      const { userId, sessionId } = getOwner(req);
      if (!userId) {
        return res.status(401).json({ error: "Login required." });
      }

      const txnRetrievalRef = req.body?.txnRetrievalRef || req.query.txnRetrievalRef;
      if (!txnRetrievalRef) {
        return res.status(400).json({ error: "Missing txnRetrievalRef." });
      }

      const status = await getTxnStatus(txnRetrievalRef);
      if (!isNetsPaymentSuccessful(status)) {
        return res.status(400).json({ error: "NETS payment not completed.", status });
      }

      const providerOrderId = `NETS-${txnRetrievalRef}`;
      const existing = await findTransactionByProviderOrderId(providerOrderId, userId);
      if (existing) {
        return res.json({
          success: true,
          transactionId: existing.transaction_id,
          alreadyRecorded: true,
        });
      }

      const expiredHolds = await removeExpiredRoomBookings({
        userId,
        sessionId,
        now: new Date(),
      });
      await Promise.all(expiredHolds.map((holdId) => releaseBookingHold(holdId)));

      const items = await listCartItems({ userId, sessionId });
      if (!items.length) {
        return res.status(400).json({
          error: "Cart is empty. Payment verified but no invoice was created.",
        });
      }

      const transaction = await createTransactionFromCart({
        userId,
        sessionId,
        providerOrderId,
        items,
        payerId: txnRetrievalRef,
        payerEmail: req.session?.email || "unknown",
        status: "COMPLETED",
      });
      issueTransactionCashbackIfEligible(transaction.transactionId).catch((error) => {
        console.error("Cashback reward issuance failed:", error.message);
      });

      if (req.session && req.session.nets) {
        delete req.session.nets;
      }

      return res.json({
        success: true,
        transactionId: transaction.transactionId,
      });
    } catch (error) {
      console.error("NETS completion failed:", error.message);
      return res.status(500).json({ error: error.message || "NETS error." });
    }
  },
};
