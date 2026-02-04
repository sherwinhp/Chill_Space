const crypto = require("crypto");
const db = require("../db");
const { createTransactionFromCart } = require("./transactionsModel");
const { CASHBACK_RATE } = require("../config/walletRewards");

function toCents(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric * 100);
}

function buildOrderRef() {
  return `WALLET-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

function buildCashbackRef(bookingId) {
  return `booking_cashback:${bookingId}`;
}

function buildTransactionCashbackRef(transactionId) {
  return `order_cashback:${transactionId}`;
}

function buildTransactionCashbackReversalRef(transactionId) {
  return `order_cashback_reversal:${transactionId}`;
}

function parseMetadata(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch (_error) {
    return null;
  }
}

function isCashbackEligibleBooking(booking) {
  if (!booking) return false;
  return booking.adminStatus === "approved" && booking.paymentStatus === "paid";
}

function calculateCashbackCents(bookingTotalCents) {
  return Math.round(Number(bookingTotalCents) * CASHBACK_RATE);
}

async function getWalletBalanceCents(userId) {
  if (!userId) return 0;
  const rows = await db.query("SELECT balance_cents FROM wallets WHERE user_id = ? LIMIT 1", [userId]);
  return rows.length ? Number(rows[0].balance_cents || 0) : 0;
}

async function listWalletTransactions(userId, limit = 20) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100));
  return db.query(
    `
      SELECT
        id,
        user_id,
        type,
        amount_cents,
        status,
        provider,
        provider_ref,
        metadata,
        created_at
      FROM wallet_transactions
      WHERE user_id = ?
      ORDER BY id DESC
      LIMIT ${safeLimit}
    `,
    [userId]
  );
}

async function createPendingPaypalTopup(userId, amountCents, metadata = null) {
  const result = await db.query(
    `
      INSERT INTO wallet_transactions
        (user_id, type, amount_cents, status, provider, provider_ref, metadata)
      VALUES (?, 'topup', ?, 'pending', 'paypal', NULL, ?)
    `,
    [userId, amountCents, parseMetadata(metadata)]
  );
  return result.insertId;
}

async function bindProviderRef(transactionId, userId, providerRef, metadata = null) {
  await db.query(
    `
      UPDATE wallet_transactions
      SET provider_ref = ?, metadata = COALESCE(?, metadata)
      WHERE id = ? AND user_id = ?
    `,
    [providerRef, parseMetadata(metadata), transactionId, userId]
  );
}

async function markWalletTransactionStatus({
  transactionId,
  userId,
  status,
  metadata = null,
}) {
  await db.query(
    `
      UPDATE wallet_transactions
      SET status = ?, metadata = COALESCE(?, metadata)
      WHERE id = ? AND user_id = ?
    `,
    [status, parseMetadata(metadata), transactionId, userId]
  );
}

async function findWalletTransactionByProviderRef(userId, provider, providerRef) {
  if (!userId || !provider || !providerRef) return null;
  const rows = await db.query(
    `
      SELECT
        id,
        user_id,
        type,
        amount_cents,
        status,
        provider,
        provider_ref,
        metadata,
        created_at
      FROM wallet_transactions
      WHERE user_id = ? AND provider = ? AND provider_ref = ?
      LIMIT 1
    `,
    [userId, provider, providerRef]
  );
  return rows.length ? rows[0] : null;
}

async function completePaypalTopup({
  userId,
  providerRef,
  capturedAmountCents,
  metadata = null,
}) {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const [txRows] = await connection.execute(
      `
        SELECT id, amount_cents, status
        FROM wallet_transactions
        WHERE user_id = ? AND provider = 'paypal' AND provider_ref = ?
        LIMIT 1
        FOR UPDATE
      `,
      [userId, providerRef]
    );
    if (!txRows.length) {
      throw new Error("Top-up record not found.");
    }

    const tx = txRows[0];
    if (tx.status === "completed") {
      const [existingWallet] = await connection.execute(
        "SELECT balance_cents FROM wallets WHERE user_id = ? LIMIT 1",
        [userId]
      );
      await connection.commit();
      return {
        alreadyProcessed: true,
        balanceCents: existingWallet.length ? Number(existingWallet[0].balance_cents || 0) : 0,
        transactionId: tx.id,
      };
    }

    if (tx.status !== "pending") {
      throw new Error("Top-up is not pending anymore.");
    }

    const expectedAmount = Number(tx.amount_cents);
    if (Number(capturedAmountCents) !== expectedAmount) {
      throw new Error("Captured amount mismatch.");
    }

    await connection.execute(
      `
        INSERT INTO wallets (user_id, balance_cents)
        VALUES (?, 0)
        ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP
      `,
      [userId]
    );

    await connection.execute(
      "UPDATE wallets SET balance_cents = balance_cents + ? WHERE user_id = ?",
      [expectedAmount, userId]
    );

    await connection.execute(
      `
        UPDATE wallet_transactions
        SET status = 'completed', metadata = COALESCE(?, metadata)
        WHERE id = ? AND user_id = ?
      `,
      [parseMetadata(metadata), tx.id, userId]
    );

    const [walletRows] = await connection.execute(
      "SELECT balance_cents FROM wallets WHERE user_id = ? LIMIT 1",
      [userId]
    );

    await connection.commit();
    return {
      alreadyProcessed: false,
      balanceCents: Number(walletRows[0].balance_cents || 0),
      transactionId: tx.id,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function payWithWallet({ userId, sessionId, items }) {
  if (!Array.isArray(items) || !items.length) {
    throw new Error("Cart is empty.");
  }

  const totalCents = items.reduce((sum, item) => {
    const qty = Number(item.qty || 1);
    return sum + toCents(item.price) * qty;
  }, 0);
  if (totalCents <= 0) {
    throw new Error("Invalid cart total.");
  }

  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();
    const walletRef = buildOrderRef();

    await connection.execute(
      `
        INSERT INTO wallets (user_id, balance_cents)
        VALUES (?, 0)
        ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP
      `,
      [userId]
    );

    const [walletUpdate] = await connection.execute(
      `
        UPDATE wallets
        SET balance_cents = balance_cents - ?
        WHERE user_id = ? AND balance_cents >= ?
      `,
      [totalCents, userId, totalCents]
    );
    if (walletUpdate.affectedRows !== 1) {
      throw new Error("Insufficient wallet balance.");
    }

    await connection.execute(
      `
        INSERT INTO wallet_transactions
          (user_id, type, amount_cents, status, provider, provider_ref, metadata)
        VALUES (?, 'payment', ?, 'completed', 'wallet', ?, ?)
      `,
      [userId, -totalCents, walletRef, parseMetadata({ source: "checkout" })]
    );

    const transaction = await createTransactionFromCart({
      connection,
      userId,
      sessionId,
      providerOrderId: walletRef,
      currency: "SGD",
      items,
      payerId: "wallet",
      payerEmail: "wallet@local",
      status: "COMPLETED",
    });

    const [walletRows] = await connection.execute(
      "SELECT balance_cents FROM wallets WHERE user_id = ? LIMIT 1",
      [userId]
    );

    await connection.commit();
    return {
      transactionId: transaction.transactionId,
      balanceCents: Number(walletRows[0].balance_cents || 0),
      totalCents,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function issueTransactionCashbackIfEligible(transactionId) {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const [txRows] = await connection.execute(
      `
        SELECT id, user_id, amount, status, currency
        FROM transactions
        WHERE id = ?
        LIMIT 1
        FOR UPDATE
      `,
      [transactionId]
    );
    if (!txRows.length) {
      await connection.rollback();
      return { ok: true, skipped: true, reason: "transaction_not_found" };
    }

    const tx = txRows[0];
    if (String(tx.status || "").toUpperCase() !== "COMPLETED") {
      await connection.rollback();
      return { ok: true, skipped: true, reason: "transaction_not_completed" };
    }

    const invoiceTotalCents = Math.round(Number(tx.amount) * 100);
    if (!Number.isFinite(invoiceTotalCents) || invoiceTotalCents <= 0) {
      await connection.rollback();
      return { ok: true, skipped: true, reason: "invalid_transaction_total" };
    }

    const cashbackCents = calculateCashbackCents(invoiceTotalCents);
    if (cashbackCents <= 0) {
      await connection.rollback();
      return { ok: true, skipped: true, reason: "cashback_zero" };
    }

    const providerRef = buildTransactionCashbackRef(tx.id);
    await connection.execute(
      `
        INSERT INTO wallets (user_id, balance_cents)
        VALUES (?, 0)
        ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP
      `,
      [tx.user_id]
    );

    try {
      await connection.execute(
        `
          INSERT INTO wallet_transactions
            (user_id, type, amount_cents, status, provider, provider_ref, metadata)
          VALUES (?, 'reward', ?, 'completed', 'system', ?, ?)
        `,
        [
          tx.user_id,
          cashbackCents,
          providerRef,
          parseMetadata({
            label: "Order Cashback",
            transaction_id: tx.id,
            cashback_rate: CASHBACK_RATE,
            reward_base_type: "invoice_total",
            reward_base_cents: invoiceTotalCents,
            cashback_cents: cashbackCents,
            currency: tx.currency || "SGD",
          }),
        ]
      );
    } catch (error) {
      if (error && error.code === "ER_DUP_ENTRY") {
        await connection.rollback();
        return { ok: true, skipped: true, reason: "already_rewarded" };
      }
      throw error;
    }

    await connection.execute(
      "UPDATE wallets SET balance_cents = balance_cents + ? WHERE user_id = ?",
      [cashbackCents, tx.user_id]
    );

    await connection.commit();
    return {
      ok: true,
      skipped: false,
      transactionId: tx.id,
      cashbackCents,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function reverseTransactionCashbackIfExists(transactionId, reason = "refund_or_cancelled") {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const cashbackRef = buildTransactionCashbackRef(transactionId);
    const reversalRef = buildTransactionCashbackReversalRef(transactionId);
    const [cashbackRows] = await connection.execute(
      `
        SELECT id, user_id, amount_cents, status
        FROM wallet_transactions
        WHERE provider = 'system'
          AND type = 'reward'
          AND provider_ref = ?
        LIMIT 1
        FOR UPDATE
      `,
      [cashbackRef]
    );
    if (!cashbackRows.length) {
      await connection.rollback();
      return { ok: true, skipped: true, reason: "no_cashback" };
    }

    const cashback = cashbackRows[0];
    if (cashback.status !== "completed") {
      await connection.rollback();
      return { ok: true, skipped: true, reason: "cashback_not_completed" };
    }

    const [existingReversalRows] = await connection.execute(
      `
        SELECT id
        FROM wallet_transactions
        WHERE provider = 'system'
          AND type = 'adjustment'
          AND provider_ref = ?
        LIMIT 1
      `,
      [reversalRef]
    );
    if (existingReversalRows.length) {
      await connection.rollback();
      return { ok: true, skipped: true, reason: "already_reversed" };
    }

    await connection.execute(
      `
        INSERT INTO wallets (user_id, balance_cents)
        VALUES (?, 0)
        ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP
      `,
      [cashback.user_id]
    );

    const [walletRows] = await connection.execute(
      "SELECT balance_cents FROM wallets WHERE user_id = ? LIMIT 1 FOR UPDATE",
      [cashback.user_id]
    );
    const currentBalanceCents = walletRows.length ? Number(walletRows[0].balance_cents || 0) : 0;
    const reversalAmountCents = Number(cashback.amount_cents || 0);
    if (currentBalanceCents < reversalAmountCents) {
      await connection.rollback();
      return { ok: true, skipped: true, reason: "insufficient_wallet_balance_for_reversal" };
    }

    await connection.execute(
      `
        INSERT INTO wallet_transactions
          (user_id, type, amount_cents, status, provider, provider_ref, metadata)
        VALUES (?, 'adjustment', ?, 'completed', 'system', ?, ?)
      `,
      [
        cashback.user_id,
        -reversalAmountCents,
        reversalRef,
        parseMetadata({
          label: "Cashback Reversal",
          reversed_transaction_ref: cashbackRef,
          reversal_reason: reason,
        }),
      ]
    );

    await connection.execute(
      "UPDATE wallets SET balance_cents = balance_cents - ? WHERE user_id = ?",
      [reversalAmountCents, cashback.user_id]
    );

    await connection.commit();
    return {
      ok: true,
      skipped: false,
      transactionId: transactionId,
      reversalCents: reversalAmountCents,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function reverseOrderCashbackForBookingIfRefunded(bookingId) {
  const rows = await db.query(
    `
      SELECT
        b.booking_id,
        b.user_id,
        b.room_id,
        b.start_time,
        b.end_time,
        b.payment_status,
        b.admin_status
      FROM bookings b
      WHERE b.booking_id = ?
      LIMIT 1
    `,
    [bookingId]
  );
  if (!rows.length) {
    return { ok: true, skipped: true, reason: "booking_not_found" };
  }

  const booking = rows[0];
  const isRefundedOrCancelled =
    booking.admin_status === "declined" ||
    booking.payment_status === "cancelled" ||
    booking.payment_status === "refunded" ||
    booking.payment_status === "void";
  if (!isRefundedOrCancelled) {
    return { ok: true, skipped: true, reason: "booking_not_refunded_or_cancelled" };
  }

  const linkedTxRows = await db.query(
    `
      SELECT t.id
      FROM transaction_items ti
      JOIN transactions t ON t.id = ti.transaction_id
      WHERE t.user_id = ?
        AND ti.item_type = 'room_booking'
        AND ti.room_id = ?
        AND ti.start_time BETWEEN DATE_SUB(?, INTERVAL 12 HOUR) AND DATE_ADD(?, INTERVAL 12 HOUR)
        AND ti.end_time BETWEEN DATE_SUB(?, INTERVAL 12 HOUR) AND DATE_ADD(?, INTERVAL 12 HOUR)
      ORDER BY t.time DESC
      LIMIT 1
    `,
    [
      booking.user_id,
      booking.room_id,
      booking.start_time,
      booking.start_time,
      booking.end_time,
      booking.end_time,
    ]
  );
  if (!linkedTxRows.length) {
    return { ok: true, skipped: true, reason: "linked_transaction_not_found" };
  }

  return reverseTransactionCashbackIfExists(linkedTxRows[0].id, "booking_refunded_or_cancelled");
}

async function issueBookingCashbackIfEligible(bookingId) {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const [bookingRows] = await connection.execute(
      `
        SELECT
          b.booking_id,
          b.user_id,
          b.room_id,
          b.start_time,
          b.end_time,
          b.payment_status,
          b.admin_status,
          r.hourly_rate
        FROM bookings b
        JOIN rooms r ON r.room_id = b.room_id
        WHERE b.booking_id = ?
        LIMIT 1
        FOR UPDATE
      `,
      [bookingId]
    );

    if (!bookingRows.length) {
      await connection.rollback();
      return { ok: true, skipped: true, reason: "booking_not_found" };
    }

    const booking = bookingRows[0];
    if (booking.admin_status !== "approved" || booking.payment_status !== "paid") {
      await connection.rollback();
      return { ok: true, skipped: true, reason: "booking_not_eligible" };
    }

    const start = new Date(booking.start_time);
    const end = new Date(booking.end_time);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      await connection.rollback();
      return { ok: true, skipped: true, reason: "invalid_booking_times" };
    }

    const bookingOnlyTotalCents = Math.round(
      ((end.getTime() - start.getTime()) / 3600000) * Number(booking.hourly_rate) * 100
    );
    if (!Number.isFinite(bookingOnlyTotalCents) || bookingOnlyTotalCents <= 0) {
      await connection.rollback();
      return { ok: true, skipped: true, reason: "invalid_booking_total" };
    }

    // Prefer full checkout total when this booking was part of a mixed cart payment.
    let rewardBaseCents = bookingOnlyTotalCents;
    let rewardBaseType = "booking_total";
    const [linkedTransactionRows] = await connection.execute(
      `
        SELECT t.id, t.amount
        FROM transaction_items ti
        JOIN transactions t ON t.id = ti.transaction_id
        WHERE t.user_id = ?
          AND ti.item_type = 'room_booking'
          AND ti.room_id = ?
          AND ti.start_time BETWEEN DATE_SUB(?, INTERVAL 12 HOUR) AND DATE_ADD(?, INTERVAL 12 HOUR)
          AND ti.end_time BETWEEN DATE_SUB(?, INTERVAL 12 HOUR) AND DATE_ADD(?, INTERVAL 12 HOUR)
        ORDER BY t.time DESC
        LIMIT 1
      `,
      [
        booking.user_id,
        booking.room_id,
        booking.start_time,
        booking.start_time,
        booking.end_time,
        booking.end_time,
      ]
    );
    if (linkedTransactionRows.length) {
      const txTotalCents = Math.round(Number(linkedTransactionRows[0].amount) * 100);
      if (Number.isFinite(txTotalCents) && txTotalCents > 0) {
        rewardBaseCents = txTotalCents;
        rewardBaseType = "checkout_total";
      }
    }

    const cashbackCents = calculateCashbackCents(rewardBaseCents);
    const providerRef = buildCashbackRef(booking.booking_id);

    await connection.execute(
      `
        INSERT INTO wallets (user_id, balance_cents)
        VALUES (?, 0)
        ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP
      `,
      [booking.user_id]
    );

    try {
      await connection.execute(
        `
          INSERT INTO wallet_transactions
            (user_id, type, amount_cents, status, provider, provider_ref, metadata)
          VALUES (?, 'reward', ?, 'completed', 'system', ?, ?)
        `,
        [
          booking.user_id,
          cashbackCents,
          providerRef,
          parseMetadata({
            label: "Booking Cashback",
            booking_id: booking.booking_id,
            cashback_rate: CASHBACK_RATE,
            booking_total_cents: bookingOnlyTotalCents,
            reward_base_type: rewardBaseType,
            reward_base_cents: rewardBaseCents,
            cashback_cents: cashbackCents,
          }),
        ]
      );
    } catch (error) {
      if (error && error.code === "ER_DUP_ENTRY") {
        await connection.rollback();
        return { ok: true, skipped: true, reason: "already_rewarded" };
      }
      throw error;
    }

    await connection.execute(
      "UPDATE wallets SET balance_cents = balance_cents + ? WHERE user_id = ?",
      [cashbackCents, booking.user_id]
    );

    await connection.commit();
    return {
      ok: true,
      skipped: false,
      bookingId: booking.booking_id,
      cashbackCents,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  isCashbackEligibleBooking,
  calculateCashbackCents,
  getWalletBalanceCents,
  listWalletTransactions,
  createPendingPaypalTopup,
  bindProviderRef,
  markWalletTransactionStatus,
  findWalletTransactionByProviderRef,
  completePaypalTopup,
  payWithWallet,
  issueTransactionCashbackIfEligible,
  reverseTransactionCashbackIfExists,
  reverseOrderCashbackForBookingIfRefunded,
  issueBookingCashbackIfEligible,
};
