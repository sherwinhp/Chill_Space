const db = require("../db");

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

async function createTransactionFromCart({
  connection: existingConnection,
  userId,
  sessionId,
  providerOrderId,
  currency = "SGD",
  items,
  payerId,
  payerEmail,
  status = "COMPLETED",
}) {
  if (!userId) {
    throw new Error("Missing user ID.");
  }
  if (!Array.isArray(items) || !items.length) {
    throw new Error("Cart is empty.");
  }

  const total = items.reduce(
    (sum, item) => sum + Number(item.price) * Number(item.qty || 1),
    0
  );
  if (!Number.isFinite(total) || total <= 0) {
    throw new Error("Invalid cart total.");
  }

  const connection = existingConnection || (await db.pool.getConnection());
  const ownsTransaction = !existingConnection;
  try {
    if (ownsTransaction) {
      await connection.beginTransaction();
    }

    const [transactionResult] = await connection.execute(
      `
        INSERT INTO transactions
          (user_id, orderId, payerId, payerEmail, amount, currency, status, time)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        userId,
        providerOrderId || "",
        payerId || "unknown",
        payerEmail || "unknown",
        total.toFixed(2),
        currency,
        status,
        new Date(),
      ]
    );

    const transactionId = transactionResult.insertId;

    for (const item of items) {
      const qty = Number(item.qty || 1);
      const price = Number(item.price);
      const subtotal = price * qty;
      await connection.execute(
        `
          INSERT INTO transaction_items
            (transaction_id, item_type, item_id, item_name, price, qty, subtotal, details, room_id, start_time, end_time)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          transactionId,
          item.type,
          item.itemId || null,
          item.name,
          price.toFixed(2),
          qty,
          subtotal.toFixed(2),
          item.details || null,
          item.roomId || null,
          normalizeDateTime(item.startTime),
          normalizeDateTime(item.endTime),
        ]
        );

      if (item.type === "room_booking" && item.roomId && item.startTime && item.endTime) {
        await connection.execute(
          `
            INSERT INTO bookings
              (user_id, room_id, start_time, end_time, pax, total_price, payment_status, admin_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            userId,
            item.roomId,
            normalizeDateTime(item.startTime),
            normalizeDateTime(item.endTime),
            item.pax || 1,
            subtotal.toFixed(2),
            "paid",
            "pending",
          ]
        );
      }

      if (item.type === "event" && item.itemId) {
        // Create the participant record only after payment completes.
        // Note: capacity is best-effort (race conditions possible without reservations).
        try {
          await connection.execute(
            `
              INSERT INTO event_signups (event_id, user_id, pax, payment_status)
              VALUES (?, ?, ?, 'paid')
              ON DUPLICATE KEY UPDATE pax = VALUES(pax), payment_status = 'paid'
            `,
            [Number(item.itemId), userId, qty]
          );
        } catch (error) {
          if (error && error.code === "ER_NO_SUCH_TABLE") {
            // If the table isn't present, don't break checkout (assignment DB might be behind).
          } else {
            throw error;
          }
        }
      }

      if (item.holdId) {
        await connection.execute("DELETE FROM booking_holds WHERE hold_id = ?", [
          item.holdId,
        ]);
      }
    }

    await connection.execute(
      "DELETE FROM cart_items WHERE user_id = ? OR session_id = ?",
      [userId, sessionId || ""]
    );

    if (ownsTransaction) {
      await connection.commit();
    }
    return { transactionId, total: total.toFixed(2), currency };
  } catch (error) {
    if (ownsTransaction) {
      await connection.rollback();
    }
    throw error;
  } finally {
    if (ownsTransaction) {
      connection.release();
    }
  }
}

async function getTransactionById(transactionId, userId) {
  const rows = await db.query(
    `
      SELECT
        t.id AS transaction_id,
        t.user_id,
        t.amount AS total_amount,
        t.currency,
        CASE
          WHEN t.orderId LIKE 'WALLET-%' THEN 'wallet'
          WHEN t.orderId LIKE 'HITPAY-%' THEN 'paynow'
          WHEN t.orderId LIKE 'NETS-%' THEN 'nets'
          WHEN t.orderId LIKE 'STRIPE-CARD-%' THEN 'stripe_card'
          WHEN t.orderId LIKE 'STRIPE-GRABPAY-%' THEN 'grabpay'
          ELSE 'paypal'
        END AS provider,
        t.orderId AS provider_order_id,
        t.status,
        t.time AS created_at,
        u.name AS user_name,
        u.email AS user_email
      FROM transactions t
      JOIN users u ON t.user_id = u.user_id
      WHERE t.id = ? AND t.user_id = ?
      LIMIT 1
    `,
    [transactionId, userId]
  );

  if (!rows.length) return null;

  const items = await db.query(
    `
      SELECT
        transaction_item_id,
        item_type,
        item_id,
        item_name,
        price,
        qty,
        subtotal,
        details,
        room_id,
        start_time,
        end_time
      FROM transaction_items
      WHERE transaction_id = ?
      ORDER BY transaction_item_id ASC
    `,
    [transactionId]
  );

  return { ...rows[0], items };
}

async function listTransactionsWithItems(userId) {
  const transactions = await db.query(
    `
      SELECT
        id AS transaction_id,
        amount AS total_amount,
        currency,
        CASE
          WHEN orderId LIKE 'WALLET-%' THEN 'wallet'
          WHEN orderId LIKE 'HITPAY-%' THEN 'paynow'
          WHEN orderId LIKE 'NETS-%' THEN 'nets'
          WHEN orderId LIKE 'STRIPE-CARD-%' THEN 'stripe_card'
          WHEN orderId LIKE 'STRIPE-GRABPAY-%' THEN 'grabpay'
          ELSE 'paypal'
        END AS provider,
        orderId AS provider_order_id,
        status,
        time AS created_at
      FROM transactions
      WHERE user_id = ?
      ORDER BY time DESC
    `,
    [userId]
  );

  if (!transactions.length) return { transactions: [], itemsByTransaction: {} };

  const transactionIds = transactions.map((row) => row.transaction_id);
  const placeholders = transactionIds.map(() => "?").join(", ");
  const items = await db.query(
    `
      SELECT
        transaction_item_id,
        transaction_id,
        item_type,
        item_name,
        price,
        qty,
        subtotal,
        details,
        room_id,
        start_time,
        end_time
      FROM transaction_items
      WHERE transaction_id IN (${placeholders})
      ORDER BY transaction_item_id ASC
    `,
    transactionIds
  );

  const itemsByTransaction = items.reduce((acc, item) => {
    if (!acc[item.transaction_id]) acc[item.transaction_id] = [];
    acc[item.transaction_id].push(item);
    return acc;
  }, {});

  return { transactions, itemsByTransaction };
}

async function listAllTransactionsWithItems(limit = 50) {
  const limitValue = Number.isFinite(Number(limit)) ? Number(limit) : 50;
  const transactions = await db.query(
    `
      SELECT
        t.id AS transaction_id,
        t.amount AS total_amount,
        t.currency,
        CASE
          WHEN t.orderId LIKE 'WALLET-%' THEN 'wallet'
          WHEN t.orderId LIKE 'HITPAY-%' THEN 'paynow'
          WHEN t.orderId LIKE 'NETS-%' THEN 'nets'
          WHEN t.orderId LIKE 'STRIPE-CARD-%' THEN 'stripe_card'
          WHEN t.orderId LIKE 'STRIPE-GRABPAY-%' THEN 'grabpay'
          ELSE 'paypal'
        END AS provider,
        t.orderId AS provider_order_id,
        t.status,
        t.time AS created_at,
        u.name AS user_name,
        u.email AS user_email
      FROM transactions t
      LEFT JOIN users u ON t.user_id = u.user_id
      ORDER BY t.time DESC
      LIMIT ${limitValue}
    `
  );

  if (!transactions.length) return { transactions: [], itemsByTransaction: {} };

  const transactionIds = transactions.map((row) => row.transaction_id);
  const placeholders = transactionIds.map(() => "?").join(", ");
  const items = await db.query(
    `
      SELECT
        transaction_item_id,
        transaction_id,
        item_type,
        item_name,
        price,
        qty,
        subtotal,
        details,
        room_id,
        start_time,
        end_time
      FROM transaction_items
      WHERE transaction_id IN (${placeholders})
      ORDER BY transaction_item_id ASC
    `,
    transactionIds
  );

  const itemsByTransaction = items.reduce((acc, item) => {
    if (!acc[item.transaction_id]) acc[item.transaction_id] = [];
    acc[item.transaction_id].push(item);
    return acc;
  }, {});

  return { transactions, itemsByTransaction };
}

async function getSalesSummary() {
  const rows = await db.query(
    `
      SELECT
        COUNT(*) AS total_orders,
        COALESCE(SUM(amount), 0) AS total_revenue,
        COALESCE(SUM(CASE WHEN DATE(time) = CURDATE() THEN amount END), 0) AS revenue_today,
        COALESCE(SUM(CASE WHEN time >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN amount END), 0) AS revenue_7d
      FROM transactions
    `
  );
  return rows[0] || {
    total_orders: 0,
    total_revenue: 0,
    revenue_today: 0,
    revenue_7d: 0,
  };
}

async function findTransactionByProviderOrderId(orderId, userId) {
  if (!orderId || !userId) return null;
  const rows = await db.query(
    `
      SELECT
        id AS transaction_id,
        user_id,
        amount AS total_amount,
        currency,
        CASE
          WHEN orderId LIKE 'WALLET-%' THEN 'wallet'
          WHEN orderId LIKE 'HITPAY-%' THEN 'paynow'
          WHEN orderId LIKE 'NETS-%' THEN 'nets'
          WHEN orderId LIKE 'STRIPE-CARD-%' THEN 'stripe_card'
          WHEN orderId LIKE 'STRIPE-GRABPAY-%' THEN 'grabpay'
          ELSE 'paypal'
        END AS provider,
        orderId AS provider_order_id,
        status,
        time AS created_at
      FROM transactions
      WHERE orderId = ? AND user_id = ?
      LIMIT 1
    `,
    [orderId, userId]
  );
  return rows.length ? rows[0] : null;
}

async function findTransactionForBooking(bookingId) {
  const rows = await db.query(
    `
      SELECT
        t.id AS transaction_id,
        t.user_id,
        t.amount AS total_amount,
        t.currency,
        CASE
          WHEN t.orderId LIKE 'WALLET-%' THEN 'wallet'
          WHEN t.orderId LIKE 'HITPAY-%' THEN 'paynow'
          WHEN t.orderId LIKE 'NETS-%' THEN 'nets'
          WHEN t.orderId LIKE 'STRIPE-CARD-%' THEN 'stripe_card'
          WHEN t.orderId LIKE 'STRIPE-GRABPAY-%' THEN 'grabpay'
          ELSE 'paypal'
        END AS provider,
        t.orderId AS provider_order_id,
        t.status,
        t.time AS created_at,
        ti.room_id,
        ti.start_time,
        ti.end_time
      FROM bookings b
      JOIN transaction_items ti
        ON ti.item_type = 'room_booking'
       AND ti.room_id = b.room_id
       AND ti.start_time BETWEEN DATE_SUB(b.start_time, INTERVAL 5 MINUTE) AND DATE_ADD(b.start_time, INTERVAL 5 MINUTE)
       AND ti.end_time BETWEEN DATE_SUB(b.end_time, INTERVAL 5 MINUTE) AND DATE_ADD(b.end_time, INTERVAL 5 MINUTE)
      JOIN transactions t ON t.id = ti.transaction_id
      WHERE b.booking_id = ?
      ORDER BY t.time DESC
      LIMIT 1
    `,
    [bookingId]
  );

  return rows.length ? rows[0] : null;
}

async function listBookingItemsForTransaction(transactionId) {
  const rows = await db.query(
    `
      SELECT
        b.booking_id,
        b.user_id,
        b.room_id,
        b.start_time,
        b.end_time,
        b.pax,
        b.total_price,
        b.payment_status,
        r.name AS room_name,
        u.name AS user_name,
        u.email AS user_email,
        t.amount AS transaction_total,
        t.currency
      FROM transaction_items ti
      JOIN transactions t ON t.id = ti.transaction_id
      JOIN bookings b
        ON b.user_id = t.user_id
       AND b.room_id = ti.room_id
       AND b.start_time = ti.start_time
       AND b.end_time = ti.end_time
      JOIN rooms r ON r.room_id = b.room_id
      JOIN users u ON u.user_id = b.user_id
      WHERE ti.transaction_id = ?
        AND ti.item_type = 'room_booking'
      ORDER BY b.booking_id ASC
    `,
    [transactionId]
  );

  return rows.map((row) => ({
    bookingId: row.booking_id,
    userId: row.user_id,
    roomId: row.room_id,
    startTime: row.start_time,
    endTime: row.end_time,
    pax: row.pax,
    totalPrice: row.total_price,
    paymentStatus: row.payment_status,
    roomName: row.room_name,
    userName: row.user_name,
    userEmail: row.user_email,
    transactionTotal: row.transaction_total,
    currency: row.currency,
  }));
}

module.exports = {
  createTransactionFromCart,
  getTransactionById,
  listTransactionsWithItems,
  listAllTransactionsWithItems,
  getSalesSummary,
  findTransactionByProviderOrderId,
  findTransactionForBooking,
  listBookingItemsForTransaction,
};
