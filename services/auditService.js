const { addAuditLog } = require("../models/auditLogModel");

function getIp(req) {
  return (
    req.headers["x-forwarded-for"] ||
    req.headers["x-real-ip"] ||
    req.socket?.remoteAddress ||
    null
  );
}

async function logAdminAction(req, action, targetType = null, targetId = null, details = null) {
  try {
    await addAuditLog({
      actorId: req.session ? req.session.userId : null,
      actorRole: req.session ? req.session.role : "admin",
      action,
      targetType,
      targetId,
      details,
      ipAddress: getIp(req),
    });
  } catch (error) {
    console.error("Audit log failed:", error.message);
  }
}

module.exports = {
  logAdminAction,
  getIp,
};
