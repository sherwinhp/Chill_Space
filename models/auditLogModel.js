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
      LIMIT ?
    `,
    [Number(limit) || 100]
  );
  return Array.isArray(rows) ? rows : [];
}

module.exports = {
  addAuditLog,
  listAuditLogs,
};
