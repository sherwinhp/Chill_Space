const db = require("../db");

function mapRefund(row) {
  if (!row) return null;
  return {
    id: row.refund_id,
    bookingId: row.booking_id,
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
  userId,
  reasonText,
  userMessage,
  requestedAmount,
  imageUrl,
}) {
  const result = await db.query(
    `
      INSERT INTO refund_requests
        (booking_id, user_id, reason_text, user_message, image_url, requested_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, 'pending')
    `,
    [
      bookingId,
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
        r.name AS room_name,
        r.image_url AS room_image,
        u.name AS user_name,
        u.email AS user_email,
        au.name AS approved_by_name,
        du.name AS denied_by_name,
        t.orderId AS payment_order_id,
        t.currency AS payment_currency,
        CASE
          WHEN t.orderId LIKE 'WALLET-%' THEN 'wallet'
          WHEN t.orderId LIKE 'HITPAY-%' THEN 'paynow'
          WHEN t.orderId LIKE 'NETS-%' THEN 'nets'
          WHEN t.orderId LIKE 'STRIPE-CARD-%' THEN 'stripe_card'
          WHEN t.orderId LIKE 'STRIPE-GRABPAY-%' THEN 'grabpay'
          WHEN t.orderId IS NULL THEN NULL
          ELSE 'paypal'
        END AS payment_provider
      FROM refund_requests rr
      JOIN bookings b ON b.booking_id = rr.booking_id
      JOIN rooms r ON r.room_id = b.room_id
      JOIN users u ON u.user_id = rr.user_id
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
    booking: {
      id: row.booking_id,
      roomName: row.room_name,
      roomImage: row.room_image,
      startTime: row.start_time,
      endTime: row.end_time,
      totalPrice: row.total_price,
      paymentStatus: row.payment_status,
      adminStatus: row.admin_status,
    },
    user: {
      name: row.user_name,
      email: row.user_email,
    },
    approvedByName: row.approved_by_name,
    deniedByName: row.denied_by_name,
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
  findRefundById,
  createRefundRequest,
  listRefundRequests,
  updateRefundRequest,
};
