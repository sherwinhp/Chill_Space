const {
  listCartItems,
  migrateSessionCartToUser,
  findBookingOverlap,
  addCartItem,
  incrementMenuItem,
  updateCartItemQty,
  deleteCartItem,
  clearCart,
  removeExpiredRoomBookings,
} = require("../models/cartModel");
const { releaseBookingHold } = require("../models/bookingsModel");
const { findRoomById } = require("../models/roomsModel");
const { calculateBookingPrice, getMaxAllowedDate } = require("../utils/bookingPricing");

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
  const expiredHolds = await removeExpiredRoomBookings({
    userId,
    sessionId,
    now: new Date(),
  });
  await Promise.all(expiredHolds.map((holdId) => releaseBookingHold(holdId)));
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
    const startValue = parseLocalDateTime(start_time);
    if (!startValue || Number.isNaN(startValue.getTime()) || startValue <= new Date()) {
      return res.status(400).json({ error: "Booking time must be in the future." });
    }
    const endValue = parseLocalDateTime(end_time);
    if (!endValue || Number.isNaN(endValue.getTime()) || endValue <= startValue) {
      return res.status(400).json({ error: "Invalid booking time range." });
    }
    const maxAllowedDate = getMaxAllowedDate(new Date());
    if (startValue > maxAllowedDate || endValue > maxAllowedDate) {
      return res.status(400).json({ error: "Bookings are only available up to 3 months ahead." });
    }
    const room = await findRoomById(Number(room_id));
    if (!room) {
      return res.status(404).json({ error: "Room not found." });
    }
    const serverPrice = calculateBookingPrice(startValue, endValue);
    if (!Number.isFinite(serverPrice) || serverPrice <= 0) {
      return res.status(400).json({ error: "Unable to calculate booking price." });
    }
    const normalizedStart = formatLocalDateTime(startValue);
    const normalizedEnd = formatLocalDateTime(endValue);
    const duplicate = await findBookingOverlap({
      userId,
      sessionId,
      roomId: Number(room_id),
      startTime: normalizedStart,
      endTime: normalizedEnd,
    });
    if (duplicate) {
      return res.status(409).json({ error: "Booking already in cart." });
    }
    await addCartItem({
      userId,
      sessionId,
      type: "room_booking",
      name,
      price: serverPrice,
      qty: 1,
      details,
      roomId: Number(room_id),
      startTime: normalizedStart,
      endTime: normalizedEnd,
      holdId: hold_id || null,
    });
    const items = await listCartItems({ userId, sessionId });
    return res.status(201).json({ items });
  }

  return res.status(400).json({ error: "Unsupported item type." });
}

function parseLocalDateTime(value) {
  if (!value || typeof value !== "string") return null;
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/
  );
  if (!match) {
    const fallback = new Date(value);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }
  const [, year, month, day, hour, minute, second] = match;
  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second || 0)
  );
}

function formatLocalDateTime(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  const hour = String(value.getHours()).padStart(2, "0");
  const minute = String(value.getMinutes()).padStart(2, "0");
  const second = String(value.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
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
