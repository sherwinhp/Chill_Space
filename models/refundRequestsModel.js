const db = require("../db");

function mapRefund(row) {
  if (!row) return null;
  return {
    id: row.refund_id,
    bookingId: row.booking_id,
    transactionId: row.transaction_id,
    userId: row.user_id,
    reasonText: row.reason_text,
    userMessage: row.user_message,
    imageUrl: row.image_url,
    requestedAmount: row.requested_amount,
    approvedAmount: row.approved_amount,
    status: row.status,
    adminNote: row.admin_note,
    provider: row.provider,
    providerRef: row.provider_ref,
    refundProviderRef: row.refund_provider_ref,
    paymentProvider: row.payment_provider,
    paymentProviderRef: row.payment_order_id,
    paymentCurrency: row.payment_currency,
    failureReason: row.failure_reason,
    failureCode: row.failure_code,
    approvedBy: row.approved_by,
    deniedBy: row.denied_by,
    approvedAt: row.approved_at,
    deniedAt: row.denied_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function findRefundByBookingId(bookingId) {
  const rows = await db.query(
    `
      SELECT *
      FROM refund_requests
      WHERE booking_id = ?
      LIMIT 1
    `,
    [bookingId]
  );
  return rows.length ? mapRefund(rows[0]) : null;
}

async function findRefundByTransactionId(transactionId) {
  const rows = await db.query(
    `
      SELECT *
      FROM refund_requests
      WHERE transaction_id = ?
      LIMIT 1
    `,
    [transactionId]
  );
  return rows.length ? mapRefund(rows[0]) : null;
}

async function findRefundById(refundId) {
  const rows = await db.query(
    `
      SELECT *
      FROM refund_requests
      WHERE refund_id = ?
      LIMIT 1
    `,
    [refundId]
  );
  return rows.length ? mapRefund(rows[0]) : null;
}

async function createRefundRequest({
  bookingId,
  transactionId,
  userId,
  reasonText,
  userMessage,
  requestedAmount,
  imageUrl,
}) {
  if (!bookingId && !transactionId) {
    throw new Error("Missing refund source.");
  }
  const result = await db.query(
    `
      INSERT INTO refund_requests
        (booking_id, transaction_id, user_id, reason_text, user_message, image_url, requested_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
    `,
    [
      bookingId || null,
      transactionId || null,
      userId,
      reasonText || null,
      userMessage || null,
      imageUrl || null,
      requestedAmount || null,
    ]
  );
  return result.insertId;
}

async function listRefundRequests() {
  const rows = await db.query(
    `
      SELECT
        rr.refund_id,
        rr.booking_id,
        rr.transaction_id,
        rr.user_id,
        rr.reason_text,
        rr.user_message,
        rr.image_url,
        rr.requested_amount,
        rr.approved_amount,
        rr.status,
        rr.admin_note,
        rr.provider,
        rr.provider_ref,
        rr.refund_provider_ref,
        rr.failure_reason,
        rr.failure_code,
        rr.approved_by,
        rr.denied_by,
        rr.approved_at,
        rr.denied_at,
        rr.created_at,
        rr.updated_at,
        b.start_time,
        b.end_time,
        b.total_price,
        b.payment_status,
        b.admin_status,
        r.room_id AS room_id,
        r.name AS room_name,
        r.image_url AS room_image,
        u.name AS user_name,
        u.email AS user_email,
        au.name AS approved_by_name,
        du.name AS denied_by_name,
        tx.id AS transaction_id_direct,
        tx.amount AS transaction_total,
        tx.time AS transaction_time,
        COALESCE(tx.orderId, t.orderId) AS payment_order_id,
        COALESCE(tx.currency, t.currency) AS payment_currency,
        CASE
          WHEN COALESCE(tx.orderId, t.orderId) LIKE 'WALLET-%' THEN 'wallet'
          WHEN COALESCE(tx.orderId, t.orderId) LIKE 'HITPAY-%' THEN 'paynow'
          WHEN COALESCE(tx.orderId, t.orderId) LIKE 'NETS-%' THEN 'nets'
          WHEN COALESCE(tx.orderId, t.orderId) LIKE 'STRIPE-CARD-%' THEN 'stripe_card'
          WHEN COALESCE(tx.orderId, t.orderId) LIKE 'STRIPE-GRABPAY-%' THEN 'grabpay'
          WHEN COALESCE(tx.orderId, t.orderId) IS NULL THEN NULL
          ELSE 'paypal'
        END AS payment_provider
      FROM refund_requests rr
      JOIN users u ON u.user_id = rr.user_id
      LEFT JOIN bookings b ON b.booking_id = rr.booking_id
      LEFT JOIN rooms r ON r.room_id = b.room_id
      LEFT JOIN transactions tx ON tx.id = rr.transaction_id
      LEFT JOIN transaction_items ti
        ON ti.item_type = 'room_booking'
       AND ti.room_id = b.room_id
       AND ti.start_time BETWEEN DATE_SUB(b.start_time, INTERVAL 5 MINUTE) AND DATE_ADD(b.start_time, INTERVAL 5 MINUTE)
       AND ti.end_time BETWEEN DATE_SUB(b.end_time, INTERVAL 5 MINUTE) AND DATE_ADD(b.end_time, INTERVAL 5 MINUTE)
      LEFT JOIN transactions t ON t.id = ti.transaction_id
      LEFT JOIN users au ON au.user_id = rr.approved_by
      LEFT JOIN users du ON du.user_id = rr.denied_by
      ORDER BY rr.created_at DESC
    `
  );

  return rows.map((row) => ({
    ...mapRefund(row),
    booking: row.booking_id
      ? {
          id: row.booking_id,
          roomId: row.room_id,
          roomName: row.room_name,
          roomImage: row.room_image,
          startTime: row.start_time,
          endTime: row.end_time,
          totalPrice: row.total_price,
          paymentStatus: row.payment_status,
          adminStatus: row.admin_status,
        }
      : null,
    transaction: row.transaction_id_direct
      ? {
          id: row.transaction_id_direct,
          totalAmount: row.transaction_total,
          createdAt: row.transaction_time,
          provider: row.payment_provider,
          providerOrderId: row.payment_order_id,
          currency: row.payment_currency,
        }
      : null,
    user: {
      name: row.user_name,
      email: row.user_email,
    },
    approvedByName: row.approved_by_name,
    deniedByName: row.denied_by_name,
  }));
}

async function listRefundRequestsByDateRange({ from, to } = {}) {
  const params = [];
  let where = "1=1";
  if (from) {
    where += " AND rr.created_at >= ?";
    params.push(from);
  }
  if (to) {
    where += " AND rr.created_at <= ?";
    params.push(to);
  }
  const rows = await db.query(
    `
      SELECT
        rr.refund_id,
        rr.booking_id,
        rr.transaction_id,
        rr.user_id,
        rr.requested_amount,
        rr.approved_amount,
        rr.status,
        rr.created_at,
        rr.approved_at,
        rr.provider,
        rr.provider_ref,
        rr.refund_provider_ref,
        u.name AS user_name,
        u.email AS user_email
      FROM refund_requests rr
      LEFT JOIN users u ON u.user_id = rr.user_id
      WHERE ${where}
      ORDER BY rr.created_at DESC
    `,
    params
  );
  return rows.map((row) => ({
    ...mapRefund(row),
    user: { name: row.user_name, email: row.user_email },
  }));
}

async function updateRefundRequest(refundId, updates = {}) {
  const fields = [];
  const params = [];
  const allowed = [
    "status",
    "approved_amount",
    "admin_note",
    "approved_by",
    "denied_by",
    "approved_at",
    "denied_at",
    "provider",
    "provider_ref",
    "failure_reason",
    "failure_code",
    "refund_provider_ref",
  ];

  allowed.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      fields.push(`${key} = ?`);
      params.push(updates[key]);
    }
  });

  if (!fields.length) return;
  params.push(refundId);
  await db.query(`UPDATE refund_requests SET ${fields.join(", ")} WHERE refund_id = ?`, params);
}

module.exports = {
  findRefundByBookingId,
  findRefundByTransactionId,
  findRefundById,
  createRefundRequest,
  listRefundRequests,
  listRefundRequestsByDateRange,
  updateRefundRequest,
};
