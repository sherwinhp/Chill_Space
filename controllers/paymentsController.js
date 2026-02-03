const {
  listCartItems,
  removeExpiredRoomBookings,
} = require("../models/cartModel");
const { createOrder, captureOrder } = require("../services/paypalService");
const {
  createTransactionFromCart,
  findTransactionByProviderOrderId,
} = require("../models/transactionsModel");
const { releaseBookingHold } = require("../models/bookingsModel");
const { payWithWallet } = require("../models/walletModel");

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

module.exports = {
  createPaypalOrder,
  createPaypalButtonOrder,
  capturePaypalButtonOrder,
  payCheckoutWithWallet,
};
