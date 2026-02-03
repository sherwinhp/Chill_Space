const crypto = require("crypto");
const db = require("../db");

const RESET_TOKEN_TTL_MINUTES = 30;

function buildToken() {
  return crypto.randomBytes(32).toString("hex");
}

async function createPasswordReset(userId) {
  const token = buildToken();
  await db.query("DELETE FROM password_resets WHERE user_id = ? AND used_at IS NULL", [userId]);
  await db.query(
    `
      INSERT INTO password_resets (user_id, token, expires_at)
      VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))
    `,
    [userId, token, RESET_TOKEN_TTL_MINUTES]
  );
  return token;
}

async function findValidPasswordResetByToken(token) {
  const rows = await db.query(
    `
      SELECT id, user_id, token, expires_at, used_at
      FROM password_resets
      WHERE token = ?
        AND used_at IS NULL
        AND expires_at > NOW()
      LIMIT 1
    `,
    [token]
  );
  return rows.length ? rows[0] : null;
}

async function markPasswordResetUsed(id) {
  await db.query("UPDATE password_resets SET used_at = NOW() WHERE id = ?", [id]);
}

async function markAllPasswordResetsUsedForUser(userId) {
  await db.query(
    "UPDATE password_resets SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL",
    [userId]
  );
}

module.exports = {
  createPasswordReset,
  findValidPasswordResetByToken,
  markPasswordResetUsed,
  markAllPasswordResetsUsedForUser,
};

