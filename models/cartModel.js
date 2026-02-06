/*
I declare that this code was written by me.
I will not copy or allow others to copy my code.
I understand that copying code is considered as plagiarism.

Student Name: Angelo Miguel Beltran Casia, Aaron Ryan Tan Wei Rong, Chow Sherwin, Aniq Syazwan Bin Muliadi, Choo Tian En Javier, Christine Joy Teh Shi Hui

Student ID: 24048278, 24045221, 24049188, 24048876, 24046565, 24048424

Class: C372-002-E63C
Date created: 06-02-2026
*/
// I declare that this code was written by me. 
// I will not copy or allow others to copy my code. 
// I understand that copying code is considered as plagiarism.
 
// Student Name: Aaron Ryan Tan Wei Rong

// Student ID:24048424​

//  Class: C372-002-E63C
//  Date created: 06-02-2026

const db = require("../db");

function toCartItem(row) {
  return {
    id: row.cart_item_id,
    sessionId: row.session_id,
    userId: row.user_id,
    type: row.item_type,
    itemId: row.item_id,
    name: row.item_name,
    price: Number(row.price),
    qty: row.qty,
    details: row.details || "",
    roomId: row.room_id,
    startTime: formatLocalDateTime(row.start_time),
    endTime: formatLocalDateTime(row.end_time),
    holdId: row.hold_id,
  };
}

async function listCartItems({ userId, sessionId }) {
  if (userId) {
    const rows = await db.query(
      "SELECT * FROM cart_items WHERE user_id = ? ORDER BY created_at DESC",
      [userId]
    );
    return rows.map(toCartItem);
  }
  const rows = await db.query(
    "SELECT * FROM cart_items WHERE session_id = ? ORDER BY created_at DESC",
    [sessionId]
  );
  return rows.map(toCartItem);
}

async function migrateSessionCartToUser(sessionId, userId) {
  if (!sessionId || !userId) return;
  await db.query(
    "UPDATE cart_items SET user_id = ?, session_id = NULL WHERE session_id = ? AND user_id IS NULL",
    [userId, sessionId]
  );
}

async function findBookingOverlap({ userId, sessionId, roomId, startTime, endTime }) {
  const params = [roomId, endTime, startTime];
  let where =
    "room_id = ? AND item_type = 'room_booking' AND start_time < ? AND end_time > ?";
  if (userId) {
    where += " AND user_id = ?";
    params.push(userId);
  } else {
    where += " AND session_id = ?";
    params.push(sessionId);
  }
  const rows = await db.query(`SELECT cart_item_id FROM cart_items WHERE ${where} LIMIT 1`, params);
  return rows.length ? rows[0].cart_item_id : null;
}

async function addCartItem({
  userId,
  sessionId,
  type,
  itemId,
  name,
  price,
  qty,
  details,
  roomId,
  startTime,
  endTime,
  holdId,
}) {
  const startValue = normalizeDateTime(startTime);
  const endValue = normalizeDateTime(endTime);
  const result = await db.query(
    `
      INSERT INTO cart_items
        (session_id, user_id, item_type, item_id, item_name, price, qty, details, room_id, start_time, end_time, hold_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      sessionId || null,
      userId || null,
      type,
      itemId || null,
      name,
      price,
      qty,
      details || "",
      roomId || null,
      startValue,
      endValue,
      holdId || null,
    ]
  );
  return result.insertId;
}

async function incrementMenuItem({ userId, sessionId, itemId, qty, roomId = null, details = "" }) {
  const params = [itemId];
  let where = "item_id = ? AND item_type = 'menu' AND room_id <=> ? AND details = ?";
  params.push(roomId, details);
  if (userId) {
    where += " AND user_id = ?";
    params.push(userId);
  } else {
    where += " AND session_id = ?";
    params.push(sessionId);
  }
  const rows = await db.query(
    `SELECT cart_item_id, qty FROM cart_items WHERE ${where} LIMIT 1`,
    params
  );
  if (!rows.length) return null;
  const nextQty = Number(rows[0].qty) + qty;
  await db.query("UPDATE cart_items SET qty = ? WHERE cart_item_id = ?", [nextQty, rows[0].cart_item_id]);
  return rows[0].cart_item_id;
}

async function getMenuCartQty({ userId, sessionId, itemId, roomId = null, details = "" }) {
  const params = [itemId];
  let where = "item_id = ? AND item_type = 'menu' AND room_id <=> ? AND details = ?";
  params.push(roomId, details);
  if (userId) {
    where += " AND user_id = ?";
    params.push(userId);
  } else {
    where += " AND session_id = ?";
    params.push(sessionId);
  }
  const rows = await db.query(
    `SELECT cart_item_id, qty FROM cart_items WHERE ${where} LIMIT 1`,
    params
  );
  if (!rows.length) return { id: null, qty: 0 };
  return { id: rows[0].cart_item_id, qty: Number(rows[0].qty || 0) };
}

async function updateCartItemQty(id, qty) {
  await db.query("UPDATE cart_items SET qty = ? WHERE cart_item_id = ?", [qty, id]);
}

async function deleteCartItem(id) {
  const rows = await db.query("SELECT hold_id FROM cart_items WHERE cart_item_id = ?", [id]);
  await db.query("DELETE FROM cart_items WHERE cart_item_id = ?", [id]);
  return rows.length ? rows[0].hold_id : null;
}

async function clearCart({ userId, sessionId }) {
  const rows = await db.query(
    "SELECT hold_id FROM cart_items WHERE user_id = ? OR session_id = ?",
    [userId || 0, sessionId || ""]
  );
  await db.query("DELETE FROM cart_items WHERE user_id = ? OR session_id = ?", [
    userId || 0,
    sessionId || "",
  ]);
  return rows.map((row) => row.hold_id).filter(Boolean);
}

async function removeExpiredRoomBookings({ userId, sessionId, now }) {
  const nowValue =
    now instanceof Date ? now.toISOString().slice(0, 19).replace("T", " ") : now;
  const rows = await db.query(
    `
      SELECT cart_item_id, hold_id
      FROM cart_items
      WHERE item_type = 'room_booking'
        AND (user_id = ? OR session_id = ?)
        AND start_time <= ?
    `,
    [userId || 0, sessionId || "", nowValue]
  );

  if (!rows.length) return [];

  const ids = rows.map((row) => row.cart_item_id);
  const placeholders = ids.map(() => "?").join(", ");
  await db.query(
    `DELETE FROM cart_items WHERE cart_item_id IN (${placeholders})`,
    ids
  );
  return rows.map((row) => row.hold_id).filter(Boolean);
}

function normalizeDateTime(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return value.toISOString().slice(0, 19).replace("T", " ");
  }
  if (typeof value === "string" && value.includes("T")) {
    return value.replace("T", " ").replace("Z", "").slice(0, 19);
  }
  return value;
}

function formatLocalDateTime(value) {
  if (!value) return null;
  const dateValue = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dateValue.getTime())) return value;
  const year = dateValue.getFullYear();
  const month = String(dateValue.getMonth() + 1).padStart(2, "0");
  const day = String(dateValue.getDate()).padStart(2, "0");
  const hour = String(dateValue.getHours()).padStart(2, "0");
  const minute = String(dateValue.getMinutes()).padStart(2, "0");
  const second = String(dateValue.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

async function hasRoomBookingInCart({ userId, sessionId, roomId }) {
  const params = [roomId];
  let where = "item_type = 'room_booking' AND room_id = ?";
  if (userId) {
    where += " AND user_id = ?";
    params.push(userId);
  } else {
    where += " AND session_id = ?";
    params.push(sessionId);
  }
  const rows = await db.query(
    `SELECT cart_item_id FROM cart_items WHERE ${where} LIMIT 1`,
    params
  );
  return rows.length > 0;
}

async function removeRoomAddons({ userId, sessionId, roomId }) {
  if (!roomId) return 0;
  const params = [roomId];
  let where = "item_type = 'menu' AND room_id = ? AND details LIKE 'Room add-on%'";
  if (userId) {
    where += " AND user_id = ?";
    params.push(userId);
  } else {
    where += " AND session_id = ?";
    params.push(sessionId);
  }
  const result = await db.query(`DELETE FROM cart_items WHERE ${where}`, params);
  return result && result.affectedRows ? result.affectedRows : 0;
}

module.exports = {
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
};
