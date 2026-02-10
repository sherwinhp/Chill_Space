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

const crypto = require("crypto");
const db = require("../db");
const { createTransactionFromCart, getMonthlySpendCents } = require("./transactionsModel");
const { calculateBookingPrice } = require("./bookingsModel");

const TIER_RULES = [
  { name: "Bronze", minCents: 0, rate: 0.02 },
  { name: "Silver", minCents: 10000, rate: 0.03 },
  { name: "Gold", minCents: 30000, rate: 0.05 },
];
const CASHBACK_RELEASE_DELAY_MS = 60 * 1000;
const CASHBACK_EXPIRY_MONTHS = 6;
const BONUS_CENTS = 500;

function toCents(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric * 100);
}

function normalizeTierName(value) {
  const text = String(value || "").trim().toLowerCase();
  if (text === "silver") return "Silver";
  if (text === "gold") return "Gold";
  return "Bronze";
}

function getTierForSpendCents(spendCents) {
  const sorted = [...TIER_RULES].sort((a, b) => b.minCents - a.minCents);
  for (const rule of sorted) {
    if (spendCents >= rule.minCents) {
      return rule;
    }
  }
  return TIER_RULES[0];
}

function getRateForTier(tierName) {
  const normalized = normalizeTierName(tierName);
  const match = TIER_RULES.find((rule) => rule.name === normalized);
  return match ? match.rate : TIER_RULES[0].rate;
}

function buildOrderRef() {
  return `WALLET-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

function buildCashbackRef(bookingId) {
  return `booking_cashback:${bookingId}`;
}

function buildTransactionCashbackRef(transactionId) {
  return `order_cashback_pending:${transactionId}`;
}

function buildTransactionCashbackReversalRef(transactionId) {
  return `order_cashback_reversal:${transactionId}`;
}

function buildTransactionCashbackReleaseRef(transactionId) {
  return `order_cashback_release:${transactionId}`;
}

function buildTransactionCashbackExpiryRef(transactionId, rewardId) {
  return `order_cashback_expiry:${transactionId}:${rewardId}`;
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

function parseMetadataValue(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch (_error) {
      return null;
    }
  }
  return null;
}

function isCashbackEligibleBooking(booking) {
  if (!booking) return false;
  return booking.adminStatus === "approved" && booking.paymentStatus === "paid";
}

function calculateCashbackCents(bookingTotalCents, rate = TIER_RULES[0].rate) {
  return Math.round(Number(bookingTotalCents) * Number(rate || 0));
}

async function getWalletBalanceCents(userId) {
  if (!userId) return 0;
  const rows = await db.query(
    "SELECT COALESCE(available_cents, balance_cents, 0) AS available_cents FROM wallets WHERE user_id = ? LIMIT 1",
    [userId]
  );
  return rows.length ? Number(rows[0].available_cents || 0) : 0;
}

async function getWalletPendingBalanceCents(userId) {
  if (!userId) return 0;
  const rows = await db.query(
    "SELECT COALESCE(pending_cents, 0) AS pending_cents FROM wallets WHERE user_id = ? LIMIT 1",
    [userId]
  );
  return rows.length ? Number(rows[0].pending_cents || 0) : 0;
}

async function ensureWalletRow(userId, connection = null) {
  if (connection) {
    await connection.execute(
      `
        INSERT INTO wallets (user_id, balance_cents, available_cents, pending_cents)
        VALUES (?, 0, 0, 0)
        ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP
      `,
      [userId]
    );
    return;
  }
  await db.query(
    `
      INSERT INTO wallets (user_id, balance_cents, available_cents, pending_cents)
      VALUES (?, 0, 0, 0)
      ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP
    `,
    [userId]
  );
}

async function listWalletTransactions(userId, limit = 20) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100));
  return db.query(
    `
      SELECT
        id,
        user_id,
        type,
        entry_type,
        amount_cents,
        status,
        provider,
        provider_ref,
        related_order_id,
        related_booking_id,
        release_at,
        released_at,
        expires_at,
        expired_at,
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
        (user_id, type, entry_type, amount_cents, status, provider, provider_ref, metadata)
      VALUES (?, 'topup', 'credit', ?, 'pending', 'paypal', NULL, ?)
    `,
    [userId, amountCents, parseMetadata(metadata)]
  );
  return result.insertId;
}

async function createPendingTopup(userId, amountCents, provider, metadata = null) {
  const safeProvider = String(provider || "").trim().toLowerCase();
  if (!safeProvider) {
    throw new Error("Missing top-up provider.");
  }
  const result = await db.query(
    `
      INSERT INTO wallet_transactions
        (user_id, type, entry_type, amount_cents, status, provider, provider_ref, metadata)
      VALUES (?, 'topup', 'credit', ?, 'pending', ?, NULL, ?)
    `,
    [userId, amountCents, safeProvider, parseMetadata(metadata)]
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

    await ensureWalletRow(userId, connection);

    await connection.execute(
      `
        UPDATE wallets
        SET available_cents = available_cents + ?,
            balance_cents = balance_cents + ?
        WHERE user_id = ?
      `,
      [expectedAmount, expectedAmount, userId]
    );

    await connection.execute(
      `
        UPDATE wallets
        SET available_cents = COALESCE(available_cents, balance_cents, 0),
            balance_cents = COALESCE(balance_cents, available_cents, 0)
        WHERE user_id = ?
      `,
      [userId]
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
      "SELECT COALESCE(available_cents, balance_cents, 0) AS available_cents FROM wallets WHERE user_id = ? LIMIT 1",
      [userId]
    );

    await connection.commit();
    return {
      alreadyProcessed: false,
      balanceCents: Number(walletRows[0].available_cents || 0),
      transactionId: tx.id,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function completeTopupByProviderRef({
  userId,
  provider,
  providerRef,
  capturedAmountCents,
  metadata = null,
}) {
  if (!userId || !provider || !providerRef) {
    throw new Error("Missing top-up details.");
  }
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const [txRows] = await connection.execute(
      `
        SELECT id, amount_cents, status
        FROM wallet_transactions
        WHERE user_id = ? AND provider = ? AND provider_ref = ?
        LIMIT 1
        FOR UPDATE
      `,
      [userId, provider, providerRef]
    );
    if (!txRows.length) {
      throw new Error("Top-up record not found.");
    }

    const tx = txRows[0];
    if (tx.status === "completed") {
      const [existingWallet] = await connection.execute(
        "SELECT COALESCE(available_cents, balance_cents, 0) AS available_cents FROM wallets WHERE user_id = ? LIMIT 1",
        [userId]
      );
      await connection.commit();
      return {
        alreadyProcessed: true,
        balanceCents: existingWallet.length ? Number(existingWallet[0].available_cents || 0) : 0,
        transactionId: tx.id,
      };
    }

    if (tx.status !== "pending") {
      throw new Error("Top-up is not pending anymore.");
    }

    const expectedAmount = Number(tx.amount_cents);
    const captured = Number(capturedAmountCents || expectedAmount);
    if (Number(captured) !== expectedAmount) {
      throw new Error("Captured amount mismatch.");
    }

    await ensureWalletRow(userId, connection);

    await connection.execute(
      `
        UPDATE wallets
        SET available_cents = available_cents + ?,
            balance_cents = balance_cents + ?
        WHERE user_id = ?
      `,
      [expectedAmount, expectedAmount, userId]
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
      "SELECT COALESCE(available_cents, balance_cents, 0) AS available_cents FROM wallets WHERE user_id = ? LIMIT 1",
      [userId]
    );

    await connection.commit();
    return {
      alreadyProcessed: false,
      balanceCents: Number(walletRows[0].available_cents || 0),
      transactionId: tx.id,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateWalletBalancesForUser(connection, userId) {
  await connection.execute(
    `
      UPDATE wallets
      SET available_cents = COALESCE(available_cents, balance_cents, 0),
          pending_cents = COALESCE(pending_cents, 0),
          balance_cents = COALESCE(balance_cents, available_cents, 0)
      WHERE user_id = ?
    `,
    [userId]
  );
}

async function getWalletBalancesForUser(connection, userId) {
  const [walletRows] = await connection.execute(
    `
      SELECT
        COALESCE(available_cents, balance_cents, 0) AS available_cents,
        COALESCE(pending_cents, 0) AS pending_cents
      FROM wallets
      WHERE user_id = ?
      LIMIT 1
    `,
    [userId]
  );
  const row = walletRows.length ? walletRows[0] : { available_cents: 0, pending_cents: 0 };
  return {
    availableCents: Number(row.available_cents || 0),
    pendingCents: Number(row.pending_cents || 0),
  };
}

async function updateUserMembershipTier(userId, now = new Date()) {
  const spendCents = await getMonthlySpendCents(userId, now);
  const tier = getTierForSpendCents(spendCents);
  await db.query("UPDATE users SET membership_tier = ? WHERE user_id = ?", [
    tier.name,
    userId,
  ]);
  return { tier: tier.name, rate: tier.rate, spendCents };
}

async function getUserCashbackTierAndRate(userId) {
  const rows = await db.query(
    "SELECT membership_tier FROM users WHERE user_id = ? LIMIT 1",
    [userId]
  );
  const tierName = rows.length ? rows[0].membership_tier : "Bronze";
  return { tier: normalizeTierName(tierName), rate: getRateForTier(tierName) };
}

async function getCashbackRateForUser(userId) {
  const tierInfo = await getUserCashbackTierAndRate(userId);
  return tierInfo.rate;
}

function getMonthDayFromDateValue(dateValue) {
  if (!dateValue) return null;
  if (typeof dateValue === "string") {
    const match = dateValue.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      const month = Number(match[2]) - 1;
      const day = Number(match[3]);
      if (Number.isFinite(month) && month >= 0 && month <= 11 && day >= 1 && day <= 31) {
        return { month, day };
      }
    }
  }
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;
  return { month: date.getMonth(), day: date.getDate() };
}

function isSameMonthDay(dateValue, now) {
  const monthDay = getMonthDayFromDateValue(dateValue);
  if (!monthDay) return false;
  return monthDay.month === now.getMonth() && monthDay.day === now.getDate();
}

async function grantAnnualBonusesIfEligible(userId, now = new Date()) {
  const rows = await db.query(
    "SELECT user_id, birth_date, created_at FROM users WHERE user_id = ? LIMIT 1",
    [userId]
  );
  if (!rows.length) return { ok: false, reason: "user_not_found" };
  const user = rows[0];
  const year = now.getUTCFullYear();
  const bonusEvents = [];
  if (isSameMonthDay(user.birth_date, now)) {
    bonusEvents.push("birthday");
  }
  if (!bonusEvents.length) return { ok: true, granted: [] };

  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();
    await ensureWalletRow(userId, connection);
    await updateWalletBalancesForUser(connection, userId);
    const granted = [];
    for (const eventType of bonusEvents) {
      try {
        await connection.execute(
          `
            INSERT INTO bonuses_claimed (user_id, bonus_type, claim_year)
            VALUES (?, ?, ?)
          `,
          [userId, eventType, year]
        );
      } catch (error) {
        if (error && error.code === "ER_DUP_ENTRY") {
          continue;
        }
        throw error;
      }

      const providerRef = `bonus:${eventType}:${year}:user:${userId}`;
      await connection.execute(
        `
          INSERT INTO wallet_transactions
            (user_id, type, entry_type, amount_cents, status, provider, provider_ref, metadata)
          VALUES (?, 'reward', 'credit', ?, 'completed', 'system', ?, ?)
        `,
        [
          userId,
          BONUS_CENTS,
          providerRef,
          parseMetadata({
            label: eventType === "birthday" ? "Birthday Bonus" : "Anniversary Bonus",
            bonus_type: eventType,
            bonus_year: year,
          }),
        ]
      );

      await connection.execute(
        `
          UPDATE wallets
          SET available_cents = available_cents + ?,
              balance_cents = balance_cents + ?
          WHERE user_id = ?
        `,
        [BONUS_CENTS, BONUS_CENTS, userId]
      );
      granted.push(eventType);
    }
    await connection.commit();
    return { ok: true, granted };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function releasePendingCashbackForUser(userId, now = new Date()) {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();
    await ensureWalletRow(userId, connection);
    await updateWalletBalancesForUser(connection, userId);

    const [pendingRows] = await connection.execute(
      `
        SELECT id, amount_cents, provider_ref, related_order_id, related_booking_id
        FROM wallet_transactions
        WHERE user_id = ?
          AND type = 'reward'
          AND status = 'pending'
          AND release_at IS NOT NULL
          AND release_at <= ?
        ORDER BY id ASC
        FOR UPDATE
      `,
      [userId, now]
    );

    for (const row of pendingRows) {
      const amountCents = Number(row.amount_cents || 0);
      if (!Number.isFinite(amountCents) || amountCents <= 0) {
        await connection.execute(
          "UPDATE wallet_transactions SET status = 'cancelled' WHERE id = ?",
          [row.id]
        );
        continue;
      }

      let eligible = false;
      if (row.related_order_id) {
        const [txRows] = await connection.execute(
          "SELECT status FROM transactions WHERE id = ? LIMIT 1",
          [row.related_order_id]
        );
        eligible = txRows.length && String(txRows[0].status || "").toUpperCase() === "COMPLETED";
      } else if (row.related_booking_id) {
        const [bookingRows] = await connection.execute(
          `
            SELECT payment_status, admin_status
            FROM bookings
            WHERE booking_id = ?
            LIMIT 1
          `,
          [row.related_booking_id]
        );
        if (bookingRows.length) {
          eligible =
            bookingRows[0].admin_status === "approved" &&
            bookingRows[0].payment_status === "paid";
        }
      } else {
        eligible = false;
      }

      if (!eligible) {
        await connection.execute(
          `
            UPDATE wallet_transactions
            SET status = 'cancelled', released_at = ?, metadata = JSON_SET(COALESCE(metadata, '{}'), '$.cancelled_reason', 'not_eligible')
            WHERE id = ?
          `,
          [now, row.id]
        );
        await connection.execute(
          `
            UPDATE wallets
            SET pending_cents = GREATEST(pending_cents - ?, 0)
            WHERE user_id = ?
          `,
          [amountCents, userId]
        );
        await connection.execute(
          `
            INSERT INTO wallet_transactions
              (user_id, type, entry_type, amount_cents, status, provider, provider_ref, metadata)
            VALUES (?, 'adjustment', 'reversal', ?, 'completed', 'system', ?, ?)
          `,
          [
            userId,
            -amountCents,
            buildTransactionCashbackReversalRef(row.related_order_id || row.related_booking_id),
            parseMetadata({ label: "Pending Cashback Cancelled", source_tx_id: row.id }),
          ]
        );
        continue;
      }

      await connection.execute(
        `
          UPDATE wallet_transactions
          SET status = 'completed', released_at = ?
          WHERE id = ?
        `,
        [now, row.id]
      );

      const releaseRef = row.related_order_id
        ? buildTransactionCashbackReleaseRef(row.related_order_id)
        : `booking_cashback_release:${row.related_booking_id}`;

      await connection.execute(
        `
          INSERT INTO wallet_transactions
            (user_id, type, entry_type, amount_cents, status, provider, provider_ref, related_order_id, related_booking_id, released_at, expires_at, metadata)
          VALUES (?, 'reward', 'credit', ?, 'completed', 'system', ?, ?, ?, ?, DATE_ADD(?, INTERVAL ${CASHBACK_EXPIRY_MONTHS} MONTH), ?)
        `,
        [
          userId,
          amountCents,
          releaseRef,
          row.related_order_id || null,
          row.related_booking_id || null,
          now,
          now,
          parseMetadata({
            label: "Cashback Released",
            pending_tx_id: row.id,
          }),
        ]
      );

      await connection.execute(
        `
          UPDATE wallets
          SET pending_cents = GREATEST(pending_cents - ?, 0),
              available_cents = available_cents + ?,
              balance_cents = balance_cents + ?
          WHERE user_id = ?
        `,
        [amountCents, amountCents, amountCents, userId]
      );
    }

    await connection.commit();
    return { ok: true, released: pendingRows.length };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function expireAvailableCashbackForUser(userId, now = new Date()) {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();
    await ensureWalletRow(userId, connection);
    await updateWalletBalancesForUser(connection, userId);

    const [rewardRows] = await connection.execute(
      `
        SELECT id, amount_cents, provider_ref, related_order_id
        FROM wallet_transactions
        WHERE user_id = ?
          AND type = 'reward'
          AND status = 'completed'
          AND expires_at IS NOT NULL
          AND expires_at <= ?
        FOR UPDATE
      `,
      [userId, now]
    );

    for (const row of rewardRows) {
      const amountCents = Number(row.amount_cents || 0);
      if (!Number.isFinite(amountCents) || amountCents <= 0) {
        continue;
      }
      const expiryRef = buildTransactionCashbackExpiryRef(
        row.related_order_id || row.provider_ref || row.id,
        row.id
      );
      await connection.execute(
        `
          INSERT INTO wallet_transactions
            (user_id, type, entry_type, amount_cents, status, provider, provider_ref, related_order_id, metadata)
          VALUES (?, 'adjustment', 'reversal', ?, 'completed', 'system', ?, ?, ?)
        `,
        [
          userId,
          -amountCents,
          expiryRef,
          row.related_order_id || null,
          parseMetadata({ label: "Cashback Expired", reward_tx_id: row.id }),
        ]
      );

      await connection.execute(
        `
          UPDATE wallet_transactions
          SET status = 'expired', expired_at = ?
          WHERE id = ?
        `,
        [now, row.id]
      );

      await connection.execute(
        `
          UPDATE wallets
          SET available_cents = GREATEST(available_cents - ?, 0),
              balance_cents = GREATEST(balance_cents - ?, 0)
          WHERE user_id = ?
        `,
        [amountCents, amountCents, userId]
      );
    }

    await connection.commit();
    return { ok: true, expired: rewardRows.length };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function syncWalletStateForUser(userId) {
  await grantAnnualBonusesIfEligible(userId);
  await releasePendingCashbackForUser(userId);
  await expireAvailableCashbackForUser(userId);
  return {
    availableCents: await getWalletBalanceCents(userId),
    pendingCents: await getWalletPendingBalanceCents(userId),
  };
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

  await syncWalletStateForUser(userId);

  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();
    const walletRef = buildOrderRef();

    await ensureWalletRow(userId, connection);
    await updateWalletBalancesForUser(connection, userId);

    const [walletUpdate] = await connection.execute(
      `
        UPDATE wallets
        SET available_cents = available_cents - ?,
            balance_cents = balance_cents - ?
        WHERE user_id = ? AND available_cents >= ?
      `,
      [totalCents, totalCents, userId, totalCents]
    );
    if (walletUpdate.affectedRows !== 1) {
      throw new Error("Insufficient wallet balance.");
    }

    await connection.execute(
      `
        INSERT INTO wallet_transactions
          (user_id, type, entry_type, amount_cents, status, provider, provider_ref, metadata)
        VALUES (?, 'payment', 'debit', ?, 'completed', 'wallet', ?, ?)
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
      "SELECT COALESCE(available_cents, balance_cents, 0) AS available_cents FROM wallets WHERE user_id = ? LIMIT 1",
      [userId]
    );

    await connection.commit();
    return {
      transactionId: transaction.transactionId,
      balanceCents: Number(walletRows[0].available_cents || 0),
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
        SELECT id, user_id, amount, status, currency, time
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

    const tierInfo = await updateUserMembershipTier(tx.user_id, tx.time ? new Date(tx.time) : new Date());
    const cashbackCents = calculateCashbackCents(invoiceTotalCents, tierInfo.rate);
    if (cashbackCents <= 0) {
      await connection.rollback();
      return { ok: true, skipped: true, reason: "cashback_zero" };
    }

    const providerRef = buildTransactionCashbackRef(tx.id);
    await ensureWalletRow(tx.user_id, connection);
    await updateWalletBalancesForUser(connection, tx.user_id);

    const releaseAt = new Date(Date.now() + CASHBACK_RELEASE_DELAY_MS);
    try {
      await connection.execute(
        `
          INSERT INTO wallet_transactions
            (user_id, type, entry_type, amount_cents, status, provider, provider_ref, related_order_id, release_at, metadata)
          VALUES (?, 'reward', 'credit', ?, 'pending', 'system', ?, ?, ?, ?)
        `,
        [
          tx.user_id,
          cashbackCents,
          providerRef,
          tx.id,
          releaseAt,
          parseMetadata({
            label: "Order Cashback Pending",
            transaction_id: tx.id,
            cashback_rate: tierInfo.rate,
            membership_tier: tierInfo.tier,
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
      `
        UPDATE wallets
        SET pending_cents = pending_cents + ?
        WHERE user_id = ?
      `,
      [cashbackCents, tx.user_id]
    );

    await connection.commit();
    return {
      ok: true,
      skipped: false,
      transactionId: tx.id,
      cashbackCents,
      tier: tierInfo.tier,
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

    const pendingRef = buildTransactionCashbackRef(transactionId);
    const releaseRef = buildTransactionCashbackReleaseRef(transactionId);
    const reversalRef = buildTransactionCashbackReversalRef(transactionId);

    const [pendingRows] = await connection.execute(
      `
        SELECT id, user_id, amount_cents, status
        FROM wallet_transactions
        WHERE provider = 'system'
          AND type = 'reward'
          AND provider_ref = ?
        LIMIT 1
        FOR UPDATE
      `,
      [pendingRef]
    );
    if (pendingRows.length && pendingRows[0].status === "pending") {
      const pending = pendingRows[0];
      const amountCents = Number(pending.amount_cents || 0);
      await ensureWalletRow(pending.user_id, connection);
      await updateWalletBalancesForUser(connection, pending.user_id);
      await connection.execute(
        "UPDATE wallet_transactions SET status = 'cancelled', released_at = ? WHERE id = ?",
        [new Date(), pending.id]
      );
      await connection.execute(
        `
          UPDATE wallets
          SET pending_cents = GREATEST(pending_cents - ?, 0)
          WHERE user_id = ?
        `,
        [amountCents, pending.user_id]
      );
      await connection.execute(
        `
          INSERT INTO wallet_transactions
            (user_id, type, entry_type, amount_cents, status, provider, provider_ref, metadata)
          VALUES (?, 'adjustment', 'reversal', ?, 'completed', 'system', ?, ?)
        `,
        [
          pending.user_id,
          -amountCents,
          `${reversalRef}:pending`,
          parseMetadata({
            label: "Pending Cashback Cancelled",
            reversed_transaction_ref: pendingRef,
            reversal_reason: reason,
          }),
        ]
      );
      await connection.commit();
      return { ok: true, skipped: false, transactionId, reversalCents: amountCents };
    }

    const [releaseRows] = await connection.execute(
      `
        SELECT id, user_id, amount_cents, status
        FROM wallet_transactions
        WHERE provider = 'system'
          AND type = 'reward'
          AND provider_ref = ?
        LIMIT 1
        FOR UPDATE
      `,
      [releaseRef]
    );
    if (!releaseRows.length) {
      await connection.rollback();
      return { ok: true, skipped: true, reason: "no_cashback" };
    }

    const release = releaseRows[0];
    if (release.status !== "completed") {
      await connection.rollback();
      return { ok: true, skipped: true, reason: "cashback_not_available" };
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

    const amountCents = Number(release.amount_cents || 0);
    await ensureWalletRow(release.user_id, connection);
    await updateWalletBalancesForUser(connection, release.user_id);
    await connection.execute(
      `
        INSERT INTO wallet_transactions
          (user_id, type, entry_type, amount_cents, status, provider, provider_ref, metadata)
        VALUES (?, 'adjustment', 'reversal', ?, 'completed', 'system', ?, ?)
      `,
      [
        release.user_id,
        -amountCents,
        reversalRef,
        parseMetadata({
          label: "Cashback Reversal",
          reversed_transaction_ref: releaseRef,
          reversal_reason: reason,
        }),
      ]
    );

    await connection.execute(
      `
        UPDATE wallets
        SET available_cents = GREATEST(available_cents - ?, 0),
            balance_cents = GREATEST(balance_cents - ?, 0)
        WHERE user_id = ?
      `,
      [amountCents, amountCents, release.user_id]
    );

    await connection.execute(
      "UPDATE wallet_transactions SET status = 'cancelled', expired_at = ? WHERE id = ?",
      [new Date(), release.id]
    );

    await connection.commit();
    return {
      ok: true,
      skipped: false,
      transactionId: transactionId,
      reversalCents: amountCents,
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
    await reverseBookingCashbackIfExists(booking.booking_id, "booking_refunded_or_cancelled");
    return { ok: true, skipped: true, reason: "linked_transaction_not_found" };
  }

  await reverseTransactionCashbackIfExists(linkedTxRows[0].id, "booking_refunded_or_cancelled");
  await reverseBookingCashbackIfExists(booking.booking_id, "booking_refunded_or_cancelled");
  return { ok: true, skipped: false };
}

async function reverseBookingCashbackIfExists(bookingId, reason = "refund_or_cancelled") {
  if (!bookingId) return { ok: true, skipped: true, reason: "booking_missing" };
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();
    const pendingRef = `booking_cashback_pending:${bookingId}`;
    const releaseRef = `booking_cashback_release:${bookingId}`;
    const reversalRef = `booking_cashback_reversal:${bookingId}`;

    const [pendingRows] = await connection.execute(
      `
        SELECT id, user_id, amount_cents, status
        FROM wallet_transactions
        WHERE provider = 'system'
          AND type = 'reward'
          AND provider_ref = ?
        LIMIT 1
        FOR UPDATE
      `,
      [pendingRef]
    );
    if (pendingRows.length && pendingRows[0].status === "pending") {
      const pending = pendingRows[0];
      const amountCents = Number(pending.amount_cents || 0);
      await ensureWalletRow(pending.user_id, connection);
      await updateWalletBalancesForUser(connection, pending.user_id);
      await connection.execute(
        "UPDATE wallet_transactions SET status = 'cancelled', released_at = ? WHERE id = ?",
        [new Date(), pending.id]
      );
      await connection.execute(
        `
          UPDATE wallets
          SET pending_cents = GREATEST(pending_cents - ?, 0)
          WHERE user_id = ?
        `,
        [amountCents, pending.user_id]
      );
      await connection.execute(
        `
          INSERT INTO wallet_transactions
            (user_id, type, entry_type, amount_cents, status, provider, provider_ref, metadata)
          VALUES (?, 'adjustment', 'reversal', ?, 'completed', 'system', ?, ?)
        `,
        [
          pending.user_id,
          -amountCents,
          `${reversalRef}:pending`,
          parseMetadata({
            label: "Pending Booking Cashback Cancelled",
            reversal_reason: reason,
          }),
        ]
      );
      await connection.commit();
      return { ok: true, skipped: false };
    }

    const [releaseRows] = await connection.execute(
      `
        SELECT id, user_id, amount_cents, status
        FROM wallet_transactions
        WHERE provider = 'system'
          AND type = 'reward'
          AND provider_ref = ?
        LIMIT 1
        FOR UPDATE
      `,
      [releaseRef]
    );
    if (!releaseRows.length) {
      await connection.rollback();
      return { ok: true, skipped: true, reason: "no_cashback" };
    }
    const release = releaseRows[0];
    if (release.status !== "completed") {
      await connection.rollback();
      return { ok: true, skipped: true, reason: "cashback_not_available" };
    }

    await ensureWalletRow(release.user_id, connection);
    await updateWalletBalancesForUser(connection, release.user_id);
    const amountCents = Number(release.amount_cents || 0);
    await connection.execute(
      `
        INSERT INTO wallet_transactions
          (user_id, type, entry_type, amount_cents, status, provider, provider_ref, metadata)
        VALUES (?, 'adjustment', 'reversal', ?, 'completed', 'system', ?, ?)
      `,
      [
        release.user_id,
        -amountCents,
        reversalRef,
        parseMetadata({
          label: "Booking Cashback Reversal",
          reversal_reason: reason,
        }),
      ]
    );
    await connection.execute(
      `
        UPDATE wallets
        SET available_cents = GREATEST(available_cents - ?, 0),
            balance_cents = GREATEST(balance_cents - ?, 0)
        WHERE user_id = ?
      `,
      [amountCents, amountCents, release.user_id]
    );
    await connection.execute(
      "UPDATE wallet_transactions SET status = 'cancelled', expired_at = ? WHERE id = ?",
      [new Date(), release.id]
    );
    await connection.commit();
    return { ok: true, skipped: false };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
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
          r.normal_hourly_rate,
          r.peak_hourly_rate
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

    const bookingOnlyTotal = calculateBookingPrice(start, end, {
      normalRate: booking.normal_hourly_rate,
      peakRate: booking.peak_hourly_rate,
    });
    const bookingOnlyTotalCents = Math.round(Number(bookingOnlyTotal) * 100);
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

    const tierInfo = await updateUserMembershipTier(booking.user_id);
    const cashbackCents = calculateCashbackCents(rewardBaseCents, tierInfo.rate);
    if (cashbackCents <= 0) {
      await connection.rollback();
      return { ok: true, skipped: true, reason: "cashback_zero" };
    }
    const providerRef = `booking_cashback_pending:${booking.booking_id}`;

    await ensureWalletRow(booking.user_id, connection);
    await updateWalletBalancesForUser(connection, booking.user_id);

    const releaseAt = new Date(Date.now() + CASHBACK_RELEASE_DELAY_MS);
    try {
      await connection.execute(
        `
          INSERT INTO wallet_transactions
            (user_id, type, entry_type, amount_cents, status, provider, provider_ref, related_booking_id, release_at, metadata)
          VALUES (?, 'reward', 'credit', ?, 'pending', 'system', ?, ?, ?, ?)
        `,
        [
          booking.user_id,
          cashbackCents,
          providerRef,
          booking.booking_id,
          releaseAt,
          parseMetadata({
            label: "Booking Cashback Pending",
            booking_id: booking.booking_id,
            cashback_rate: tierInfo.rate,
            membership_tier: tierInfo.tier,
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
      `
        UPDATE wallets
        SET pending_cents = pending_cents + ?
        WHERE user_id = ?
      `,
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
  getWalletPendingBalanceCents,
  getCashbackRateForUser,
  listWalletTransactions,
  syncWalletStateForUser,
  createPendingPaypalTopup,
  createPendingTopup,
  bindProviderRef,
  markWalletTransactionStatus,
  findWalletTransactionByProviderRef,
  completePaypalTopup,
  completeTopupByProviderRef,
  payWithWallet,
  issueTransactionCashbackIfEligible,
  reverseTransactionCashbackIfExists,
  reverseOrderCashbackForBookingIfRefunded,
  issueBookingCashbackIfEligible,
};
