const { listCartItems } = require("../models/cartModel");
const { createOrder } = require("../services/paypalService");

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

module.exports = { createPaypalOrder };
