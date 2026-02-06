// I declare that this code was written by me. 
// I will not copy or allow others to copy my code. 
// I understand that copying code is considered as plagiarism.
 
// Student Name: Aaron Ryan Tan Wei Rong

// Student ID:24048424​

//  Class: C372-002-E63C
//  Date created: 06-02-2026

const db = require("../db");

async function listComplianceFlags({ status = "open", limit = 100, from, to } = {}) {
  const where = [];
  const params = [];
  const limitValue = Number(limit);
  const safeLimit =
    Number.isFinite(limitValue) && limitValue > 0 ? Math.min(limitValue, 500) : 100;
  if (status === "open") {
    where.push("cf.resolved_at IS NULL");
  } else if (status === "resolved") {
    where.push("cf.resolved_at IS NOT NULL");
  }
  if (from) {
    where.push("cf.created_at >= ?");
    params.push(from);
  }
  if (to) {
    where.push("cf.created_at <= ?");
    params.push(to);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = await db.query(
    `
      SELECT
        cf.flag_id,
        cf.user_id,
        cf.related_type,
        cf.related_id,
        cf.severity,
        cf.reason,
        cf.details,
        cf.created_at,
        cf.resolved_at,
        cf.resolved_by,
        u.name AS user_name,
        u.email AS user_email,
        u.kyc_status
      FROM compliance_flags cf
      LEFT JOIN users u ON u.user_id = cf.user_id
      ${whereSql}
      ORDER BY cf.created_at DESC
      LIMIT ${safeLimit}
    `,
    params
  );
  return Array.isArray(rows) ? rows : [];
}

async function createComplianceFlag({
  userId,
  relatedType = "transaction",
  relatedId = null,
  severity = "medium",
  reason,
  details = null,
}) {
  if (!reason) return null;
  const result = await db.query(
    `
      INSERT INTO compliance_flags
        (user_id, related_type, related_id, severity, reason, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [userId || null, relatedType, relatedId, severity, reason, details]
  );
  return result.insertId || null;
}

async function resolveComplianceFlag(flagId, resolvedBy) {
  await db.query(
    `
      UPDATE compliance_flags
      SET resolved_at = NOW(), resolved_by = ?
      WHERE flag_id = ?
    `,
    [resolvedBy || null, flagId]
  );
}

async function listWatchlist() {
  const rows = await db.query(
    "SELECT watch_id, name, email, contact_number, reason, created_at FROM watchlist ORDER BY created_at DESC"
  );
  return Array.isArray(rows) ? rows : [];
}

async function addWatchlistEntry({ name, email, contact_number, reason }) {
  const result = await db.query(
    `
      INSERT INTO watchlist (name, email, contact_number, reason)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        contact_number = VALUES(contact_number),
        reason = VALUES(reason)
    `,
    [name || null, email || null, contact_number || null, reason || null]
  );
  return result.insertId || null;
}

async function removeWatchlistEntry(watchId) {
  const result = await db.query("DELETE FROM watchlist WHERE watch_id = ?", [watchId]);
  return result.affectedRows > 0;
}

async function findWatchlistMatch({ name, email, contact_number }) {
  const clauses = [];
  const params = [];
  if (email) {
    clauses.push("LOWER(email) = LOWER(?)");
    params.push(String(email).trim());
  }
  if (contact_number) {
    clauses.push("contact_number = ?");
    params.push(String(contact_number).trim());
  }
  if (name) {
    clauses.push("LOWER(name) = LOWER(?)");
    params.push(String(name).trim());
  }
  if (!clauses.length) return null;
  const rows = await db.query(
    `
      SELECT watch_id, name, email, contact_number, reason, created_at
      FROM watchlist
      WHERE ${clauses.join(" OR ")}
      LIMIT 1
    `,
    params
  );
  return rows.length ? rows[0] : null;
}

module.exports = {
  listComplianceFlags,
  createComplianceFlag,
  resolveComplianceFlag,
  listWatchlist,
  addWatchlistEntry,
  removeWatchlistEntry,
  findWatchlistMatch,
};
