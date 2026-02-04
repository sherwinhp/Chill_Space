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

module.exports = {
  createPaypalOrder,
  createPaypalButtonOrder,
  capturePaypalButtonOrder,
  payCheckoutWithWallet,
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
