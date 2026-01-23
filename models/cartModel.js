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
    startTime: row.start_time,
    endTime: row.end_time,
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

async function findBookingDuplicate({ userId, sessionId, roomId, startTime, endTime }) {
  const params = [roomId, startTime, endTime];
  let where = "room_id = ? AND start_time = ? AND end_time = ? AND item_type = 'room_booking'";
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

async function incrementMenuItem({ userId, sessionId, itemId, qty }) {
  const params = [qty, itemId];
  let where = "item_id = ? AND item_type = 'menu'";
  if (userId) {
    where += " AND user_id = ?";
    params.push(userId);
  } else {
    where += " AND session_id = ?";
    params.push(sessionId);
  }
  const rows = await db.query(`SELECT cart_item_id, qty FROM cart_items WHERE ${where} LIMIT 1`, params);
  if (!rows.length) return null;
  const nextQty = Number(rows[0].qty) + qty;
  await db.query("UPDATE cart_items SET qty = ? WHERE cart_item_id = ?", [nextQty, rows[0].cart_item_id]);
  return rows[0].cart_item_id;
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

module.exports = {
  listCartItems,
  migrateSessionCartToUser,
  findBookingDuplicate,
  addCartItem,
  incrementMenuItem,
  updateCartItemQty,
  deleteCartItem,
  clearCart,
};
