/*
I declare that this code was written by me.
I will not copy or allow others to copy my code.
I understand that copying code is considered as plagiarism.

Student Name: Angelo Miguel Beltran Casia, Aaron Ryan Tan Wei Rong, Chow Sherwin, Aniq Syazwan Bin Muliadi, Choo Tian En Javier, Christine Joy Teh Shi Hui

Student ID: 24048278, 24045221, 24049188, 24048876, 24046565, 24048424

Class: C372-002-E63C
Date created: 06-02-2026
*/
const {
  listCartItems,
  migrateSessionCartToUser,
  findBookingOverlap,
  addCartItem,
  incrementMenuItem,
  getMenuCartQty,
  updateCartItemQty,
  deleteCartItem,
  clearCart,
  removeExpiredRoomBookings,
  hasRoomBookingInCart,
  removeRoomAddons,
} = require("../models/cartModel");
const { releaseBookingHold } = require("../models/bookingsModel");
const { findRoomById } = require("../models/roomsModel");
const { findMenuItemById } = require("../models/menuDbModel");
const { calculateBookingPrice, getMaxAllowedDate } = require("../models/bookingsModel");

const ROOM_ADDON_DISCOUNT_RATE = 0.15;

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
    qty,
    details,
    room_id,
    start_time,
    end_time,
    hold_id,
  } = req.body;

  if (!item_type) {
    return res.status(400).json({ error: "Missing item details." });
  }

  if (item_type === "menu") {
    const menuItemId = Number(item_id || req.body?.itemId || req.body?.id);
    if (!menuItemId) {
      return res.status(400).json({ error: "Missing menu item." });
    }
    const menuItem = await findMenuItemById(menuItemId);
    if (!menuItem) {
      return res.status(404).json({ error: "Menu item not found." });
    }
    if (!menuItem.isOrderable) {
      if (menuItem.stockStatus === "out_of_stock") {
        return res.status(400).json({ error: "Item is out of stock." });
      }
      return res.status(400).json({ error: "Menu item is unavailable." });
    }

    const isRoomAddon =
      req.body?.room_addon === true ||
      req.body?.room_addon === "true" ||
      req.body?.room_addon === "1";
    const qtyValue = Number(qty || 1);
    const normalizedQty = Number.isFinite(qtyValue) && qtyValue > 0 ? qtyValue : 1;
    let roomIdValue = null;
    let detailsValue = details || "";
    let finalPrice = Number(menuItem.price || 0);

    if (isRoomAddon) {
      roomIdValue = Number(room_id);
      if (!roomIdValue) {
        return res.status(400).json({ error: "Room is required for add-ons." });
      }
      const hasBooking = await hasRoomBookingInCart({ userId, sessionId, roomId: roomIdValue });
      if (!hasBooking) {
        return res.status(403).json({ error: "Add-ons require a room booking in your cart." });
      }
      const room = await findRoomById(roomIdValue);
      if (!room) {
        return res.status(404).json({ error: "Room not found." });
      }
      const discountEligible = menuItem.category === "food" || menuItem.category === "drink";
      if (discountEligible) {
        finalPrice = Number(
          (finalPrice * (1 - ROOM_ADDON_DISCOUNT_RATE)).toFixed(2)
        );
      }
      detailsValue = `Room add-on for ${room.name}`;
    }

    if (!Number.isFinite(finalPrice) || finalPrice <= 0) {
      return res.status(400).json({ error: "Invalid item price." });
    }

    const existing = await getMenuCartQty({
      userId,
      sessionId,
      itemId: menuItemId,
      roomId: roomIdValue,
      details: detailsValue,
    });
    const nextQty = Number(existing.qty || 0) + normalizedQty;
    if (menuItem.stockQty !== null && nextQty > menuItem.stockQty) {
      return res.status(400).json({
        error: `Only ${menuItem.stockQty} left in stock.`,
      });
    }

    if (existing.id) {
      await incrementMenuItem({
        userId,
        sessionId,
        itemId: menuItemId,
        qty: normalizedQty,
        roomId: roomIdValue,
        details: detailsValue,
      });
    } else {
      await addCartItem({
        userId,
        sessionId,
        type: "menu",
        itemId: menuItemId,
        name: menuItem.name,
        price: finalPrice,
        qty: normalizedQty,
        details: detailsValue,
        roomId: roomIdValue,
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
    const minStart = new Date(Date.now() + 2 * 60 * 60000);
    if (!startValue || Number.isNaN(startValue.getTime()) || startValue < minStart) {
      return res.status(400).json({ error: "Bookings must be at least 2 hours in advance." });
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
    const bookingName = name || `${room.name} booking`;
    const serverPrice = calculateBookingPrice(startValue, endValue, {
      normalRate: room.normalHourlyRate,
      peakRate: room.peakHourlyRate,
    });
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
      name: bookingName,
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
  const { userId, sessionId } = getOwner(req);
  const itemsBefore = await listCartItems({ userId, sessionId });
  const targetItem = itemsBefore.find((entry) => entry.id === id);
  if (targetItem && String(targetItem.details || "").startsWith("promo:")) {
    return res.status(400).json({ error: "Promo items cannot be edited." });
  }
  if (targetItem && targetItem.type === "menu" && targetItem.itemId) {
    const menuItem = await findMenuItemById(targetItem.itemId);
    if (!menuItem) {
      return res.status(404).json({ error: "Menu item not found." });
    }
    if (!menuItem.isOrderable) {
      return res.status(400).json({ error: "Menu item is unavailable." });
    }
    if (menuItem.stockQty !== null && qty > menuItem.stockQty) {
      return res.status(400).json({ error: `Only ${menuItem.stockQty} left in stock.` });
    }
  }
  await updateCartItemQty(id, qty);
  const items = await listCartItems({ userId, sessionId });
  res.json({ items });
}

async function removeItem(req, res) {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid item." });
  const { userId, sessionId } = getOwner(req);
  const itemsBefore = await listCartItems({ userId, sessionId });
  const targetItem = itemsBefore.find((entry) => entry.id === id);
  const holdId = await deleteCartItem(id);
  if (holdId) {
    await releaseBookingHold(holdId);
  }
  if (targetItem && targetItem.type === "room_booking" && targetItem.roomId) {
    const stillHasBooking = await hasRoomBookingInCart({
      userId,
      sessionId,
      roomId: targetItem.roomId,
    });
    if (!stillHasBooking) {
      await removeRoomAddons({ userId, sessionId, roomId: targetItem.roomId });
    }
  }
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
