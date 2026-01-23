const {
  listCartItems,
  migrateSessionCartToUser,
  findBookingDuplicate,
  addCartItem,
  incrementMenuItem,
  updateCartItemQty,
  deleteCartItem,
  clearCart,
} = require("../models/cartModel");
const { releaseBookingHold } = require("../models/bookingsModel");

function getOwner(req) {
  const userId = req.session ? req.session.userId : null;
  const sessionId = req.cartSid || null;
  return { userId, sessionId };
}

async function listItems(req, res) {
  const { userId, sessionId } = getOwner(req);
  if (userId && sessionId) {
    await migrateSessionCartToUser(sessionId, userId);
  }
  const items = await listCartItems({ userId, sessionId });
  res.json({ items });
}

async function addItem(req, res) {
  const { userId, sessionId } = getOwner(req);
  const {
    item_type,
    item_id,
    name,
    price,
    qty,
    details,
    room_id,
    start_time,
    end_time,
    hold_id,
  } = req.body;

  if (!item_type || !name || price == null) {
    return res.status(400).json({ error: "Missing item details." });
  }

  if (item_type === "menu") {
    const existingId = await incrementMenuItem({
      userId,
      sessionId,
      itemId: Number(item_id),
      qty: Number(qty || 1),
    });
    if (!existingId) {
      await addCartItem({
        userId,
        sessionId,
        type: "menu",
        itemId: Number(item_id),
        name,
        price: Number(price),
        qty: Number(qty || 1),
        details,
      });
    }
    const items = await listCartItems({ userId, sessionId });
    return res.status(201).json({ items });
  }

  if (item_type === "room_booking") {
    if (!room_id || !start_time || !end_time) {
      return res.status(400).json({ error: "Missing booking details." });
    }
    const duplicate = await findBookingDuplicate({
      userId,
      sessionId,
      roomId: Number(room_id),
      startTime: start_time,
      endTime: end_time,
    });
    if (duplicate) {
      return res.status(409).json({ error: "Booking already in cart." });
    }
    await addCartItem({
      userId,
      sessionId,
      type: "room_booking",
      name,
      price: Number(price),
      qty: 1,
      details,
      roomId: Number(room_id),
      startTime: start_time,
      endTime: end_time,
      holdId: hold_id || null,
    });
    const items = await listCartItems({ userId, sessionId });
    return res.status(201).json({ items });
  }

  return res.status(400).json({ error: "Unsupported item type." });
}

async function updateItemQty(req, res) {
  const id = Number(req.params.id);
  const qty = Number(req.body.qty);
  if (!id || !Number.isFinite(qty) || qty <= 0) {
    return res.status(400).json({ error: "Invalid quantity." });
  }
  await updateCartItemQty(id, qty);
  const { userId, sessionId } = getOwner(req);
  const items = await listCartItems({ userId, sessionId });
  res.json({ items });
}

async function removeItem(req, res) {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid item." });
  const holdId = await deleteCartItem(id);
  if (holdId) {
    await releaseBookingHold(holdId);
  }
  const { userId, sessionId } = getOwner(req);
  const items = await listCartItems({ userId, sessionId });
  res.json({ items });
}

async function clear(req, res) {
  const { userId, sessionId } = getOwner(req);
  const holds = await clearCart({ userId, sessionId });
  await Promise.all(holds.map((holdId) => releaseBookingHold(holdId)));
  res.json({ items: [] });
}

module.exports = {
  listItems,
  addItem,
  updateItemQty,
  removeItem,
  clear,
};
