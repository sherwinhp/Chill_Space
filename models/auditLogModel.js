/*
I declare that this code was written by me.
I will not copy or allow others to copy my code.
I understand that copying code is considered as plagiarism.

Student Name: Angelo Miguel Beltran Casia, Aaron Ryan Tan Wei Rong, Chow Sherwin, Aniq Syazwan Bin Muliadi, Choo Tian En Javier, Christine Joy Teh Shi Hui

Student ID: 24048278, 24045221, 24049188, 24048876, 24046565, 24048424

Class: C372-002-E63C
Date created: 06-02-2026
*/
const db = require("../db");

async function addAuditLog({
  actorId,
  actorRole = "admin",
  action,
  targetType = null,
  targetId = null,
  details = null,
  ipAddress = null,
}) {
  if (!action) return null;
  const result = await db.query(
    `
      INSERT INTO audit_logs
        (actor_id, actor_role, action, target_type, target_id, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [actorId || null, actorRole, action, targetType, targetId, details, ipAddress]
  );
  return result.insertId || null;
}

async function listAuditLogs({ limit = 100 } = {}) {
  const limitValue = Number(limit);
  const safeLimit =
    Number.isFinite(limitValue) && limitValue > 0 ? Math.min(limitValue, 500) : 100;
  const rows = await db.query(
    `
      SELECT
        al.log_id,
        al.actor_id,
        al.actor_role,
        al.action,
        al.target_type,
        al.target_id,
        al.details,
        al.ip_address,
        al.created_at,
        u.name AS actor_name,
        u.email AS actor_email
      FROM audit_logs al
      LEFT JOIN users u ON u.user_id = al.actor_id
      ORDER BY al.created_at DESC
      LIMIT ${safeLimit}
    `,
    []
  );
  return Array.isArray(rows) ? rows : [];
}

module.exports = {
  addAuditLog,
  listAuditLogs,
};
