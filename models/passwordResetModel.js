/*
I declare that this code was written by me.
I will not copy or allow others to copy my code.
I understand that copying code is considered as plagiarism.

Student Name: Angelo Miguel Beltran Casia, Aaron Ryan Tan Wei Rong, Chow Sherwin, Aniq Syazwan Bin Muliadi, Choo Tian En Javier, Christine Joy Teh Shi Hui

Student ID: 24048278, 24045221, 24049188, 24048876, 24046565, 24048424

Class: C372-002-E63C
Date created: 06-02-2026
*/
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

