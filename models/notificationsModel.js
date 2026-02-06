const db = require("../db");

function safeLimit(value, fallback = 20) {
  const limit = Number(value);
  if (!Number.isFinite(limit)) return fallback;
  return Math.max(1, Math.min(limit, 100));
}

async function ensureNotificationReadsTable() {
  await db.query(
    `
      CREATE TABLE IF NOT EXISTS notification_reads (
        user_id INT NOT NULL,
        last_seen DATETIME NOT NULL,
        updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id),
        CONSTRAINT fk_notification_reads_user
          FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=latin1
    `
  );
}

async function listNotifications(userId, limit = 20) {
  if (!userId) return [];
  const cappedLimit = safeLimit(limit, 20);
  try {
    const rows = await db.query(
      `
        SELECT *
        FROM (
          SELECT
            CONCAT('payment-', t.id) AS id,
            'payment' AS kind,
            t.amount AS amount,
            t.currency AS currency,
            t.status AS status,
            t.time AS created_at,
            CASE
              WHEN t.orderId LIKE 'WALLET-%' THEN 'wallet'
              WHEN t.orderId LIKE 'HITPAY-%' THEN 'paynow'
              WHEN t.orderId LIKE 'NETS-%' THEN 'nets'
              WHEN t.orderId LIKE 'STRIPE-CARD-%' THEN 'stripe_card'
              WHEN t.orderId LIKE 'STRIPE-GRABPAY-%' THEN 'grabpay'
              ELSE 'paypal'
            END AS provider,
            t.orderId AS reference
          FROM transactions t
          WHERE t.user_id = ?
            AND UPPER(t.status) = 'COMPLETED'

          UNION ALL

          SELECT
            CONCAT('wallet-', wt.id) AS id,
            wt.type AS kind,
            (ABS(wt.amount_cents) / 100) AS amount,
            'SGD' AS currency,
            wt.status AS status,
            wt.created_at AS created_at,
            wt.provider AS provider,
            wt.provider_ref AS reference
          FROM wallet_transactions wt
          WHERE wt.user_id = ?
            AND wt.type IN ('refund', 'topup', 'reward')
            AND wt.status = 'completed'
        ) notifications
        ORDER BY created_at DESC
        LIMIT ${cappedLimit}
      `,
      [userId, userId]
    );
    return rows;
  } catch (error) {
    if (error && error.code === "ER_NO_SUCH_TABLE") {
      const rows = await db.query(
        `
          SELECT
            CONCAT('payment-', t.id) AS id,
            'payment' AS kind,
            t.amount AS amount,
            t.currency AS currency,
            t.status AS status,
            t.time AS created_at,
            CASE
              WHEN t.orderId LIKE 'WALLET-%' THEN 'wallet'
              WHEN t.orderId LIKE 'HITPAY-%' THEN 'paynow'
              WHEN t.orderId LIKE 'NETS-%' THEN 'nets'
              WHEN t.orderId LIKE 'STRIPE-CARD-%' THEN 'stripe_card'
              WHEN t.orderId LIKE 'STRIPE-GRABPAY-%' THEN 'grabpay'
              ELSE 'paypal'
            END AS provider,
            t.orderId AS reference
          FROM transactions t
          WHERE t.user_id = ?
            AND UPPER(t.status) = 'COMPLETED'
          ORDER BY t.time DESC
          LIMIT ${cappedLimit}
        `,
        [userId]
      );
      return rows;
    }
    throw error;
  }
}

async function countNotifications(userId) {
  if (!userId) return 0;
  try {
    const rows = await db.query(
      `
        SELECT
          (
            SELECT COUNT(*)
            FROM transactions
            WHERE user_id = ?
              AND UPPER(status) = 'COMPLETED'
          ) +
          (
            SELECT COUNT(*)
            FROM wallet_transactions
            WHERE user_id = ?
              AND type IN ('refund', 'topup', 'reward')
              AND status = 'completed'
          ) AS total
      `,
      [userId, userId]
    );
    return rows.length ? Number(rows[0].total || 0) : 0;
  } catch (error) {
    if (error && error.code === "ER_NO_SUCH_TABLE") {
      const rows = await db.query(
        `
          SELECT COUNT(*) AS total
          FROM transactions
          WHERE user_id = ?
            AND UPPER(status) = 'COMPLETED'
        `,
        [userId]
      );
      return rows.length ? Number(rows[0].total || 0) : 0;
    }
    throw error;
  }
}

async function getLastSeenAt(userId) {
  if (!userId) return null;
  try {
    const rows = await db.query(
      "SELECT last_seen FROM notification_reads WHERE user_id = ? LIMIT 1",
      [userId]
    );
    return rows.length ? rows[0].last_seen : null;
  } catch (error) {
    if (error && error.code === "ER_NO_SUCH_TABLE") {
      await ensureNotificationReadsTable();
      return null;
    }
    throw error;
  }
}

async function markNotificationsRead(userId) {
  if (!userId) return false;
  try {
    await db.query(
      `
        INSERT INTO notification_reads (user_id, last_seen)
        VALUES (?, NOW())
        ON DUPLICATE KEY UPDATE last_seen = VALUES(last_seen)
      `,
      [userId]
    );
    return true;
  } catch (error) {
    if (error && error.code === "ER_NO_SUCH_TABLE") {
      await ensureNotificationReadsTable();
      await db.query(
        `
          INSERT INTO notification_reads (user_id, last_seen)
          VALUES (?, NOW())
          ON DUPLICATE KEY UPDATE last_seen = VALUES(last_seen)
        `,
        [userId]
      );
      return true;
    }
    throw error;
  }
}

async function countUnreadNotifications(userId) {
  if (!userId) return 0;
  const lastSeen = await getLastSeenAt(userId);
  if (!lastSeen) {
    return countNotifications(userId);
  }
  try {
    const rows = await db.query(
      `
        SELECT
          (
            SELECT COUNT(*)
            FROM transactions
            WHERE user_id = ?
              AND UPPER(status) = 'COMPLETED'
              AND time > ?
          ) +
          (
            SELECT COUNT(*)
            FROM wallet_transactions
            WHERE user_id = ?
              AND type IN ('refund', 'topup', 'reward')
              AND status = 'completed'
              AND created_at > ?
          ) AS total
      `,
      [userId, lastSeen, userId, lastSeen]
    );
    return rows.length ? Number(rows[0].total || 0) : 0;
  } catch (error) {
    if (error && error.code === "ER_NO_SUCH_TABLE") {
      await ensureNotificationReadsTable();
      const rows = await db.query(
        `
          SELECT COUNT(*) AS total
          FROM transactions
          WHERE user_id = ?
            AND UPPER(status) = 'COMPLETED'
            AND time > ?
        `,
        [userId, lastSeen]
      );
      return rows.length ? Number(rows[0].total || 0) : 0;
    }
    throw error;
  }
}

module.exports = {
  listNotifications,
  countNotifications,
  countUnreadNotifications,
  markNotificationsRead,
};
