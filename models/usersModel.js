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

const HASH_PREFIX = "scrypt$";
const SALT_BYTES = 16;
const KEY_BYTES = 64;

function isPasswordHashed(value) {
  return typeof value === "string" && value.startsWith(HASH_PREFIX);
}

function hashPassword(password) {
  if (!password) return "";
  if (isPasswordHashed(password)) return password;
  const salt = crypto.randomBytes(SALT_BYTES);
  const key = crypto.scryptSync(String(password), salt, KEY_BYTES);
  return `${HASH_PREFIX}${salt.toString("hex")}$${key.toString("hex")}`;
}

function verifyPassword(password, stored) {
  if (!stored) return false;
  if (!isPasswordHashed(stored)) {
    return String(stored) === String(password);
  }
  const parts = String(stored).split("$");
  if (parts.length !== 3) return false;
  const saltHex = parts[1];
  const keyHex = parts[2];
  try {
    const salt = Buffer.from(saltHex, "hex");
    const key = Buffer.from(keyHex, "hex");
    const derived = crypto.scryptSync(String(password), salt, key.length);
    return crypto.timingSafeEqual(key, derived);
  } catch (error) {
    return false;
  }
}

function formatDateOnly(value) {
  if (!value) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toUser(row) {
  return {
    id: row.user_id,
    name: row.name,
    email: row.email,
    password: row.password,
    role: row.role || "user",
    address: row.address,
    contact_number: row.contact_number,
    avatar_url: row.avatar_url,
    is_active: row.is_active !== undefined ? Boolean(row.is_active) : true,
    birth_date: formatDateOnly(row.birth_date),
    membership_tier: row.membership_tier || "Bronze",
    kyc_status: row.kyc_status || "unverified",
    kyc_checked_at: row.kyc_checked_at || null,
    created_at: row.created_at,
  };
}

async function listUsers() {
  const rows = await db.query("SELECT * FROM users ORDER BY user_id ASC");
  return rows.map(toUser);
}

async function findByEmail(email) {
  const rows = await db.query("SELECT * FROM users WHERE email = ?", [email]);
  return rows.length ? toUser(rows[0]) : null;
}

async function findById(id) {
  const rows = await db.query("SELECT * FROM users WHERE user_id = ?", [id]);
  return rows.length ? toUser(rows[0]) : null;
}

async function getMainAdmin() {
  const rows = await db.query(
    "SELECT * FROM users WHERE role = 'admin' ORDER BY user_id ASC LIMIT 1"
  );
  return rows.length ? toUser(rows[0]) : null;
}

async function createUser({
  name,
  email,
  password,
  address,
  contact_number,
  role = "user",
  is_active = true,
  birth_date = null,
  membership_tier = "Bronze",
  kyc_status = "unverified",
  kyc_checked_at = null,
}) {
  const existing = await findByEmail(email);
  if (existing) {
    throw new Error("Email already registered");
  }
  const result = await db.query(
    "INSERT INTO users (name, email, password, role, address, contact_number, is_active, birth_date, membership_tier, kyc_status, kyc_checked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      name,
      email,
      hashPassword(password),
      role,
      address || null,
      contact_number || null,
      is_active ? 1 : 0,
      birth_date || null,
      membership_tier || "Bronze",
      kyc_status || "unverified",
      kyc_checked_at || null,
    ]
  );
  return findById(result.insertId);
}

async function updateUser(id, updates) {
  const existing = await findById(id);
  const fields = [];
  const params = [];
  const allowed = [
    "name",
    "email",
    "password",
    "role",
    "address",
    "contact_number",
    "avatar_url",
    "is_active",
    "birth_date",
    "membership_tier",
    "kyc_status",
    "kyc_checked_at",
  ];

  const isSuperAdmin =
    existing && String(existing.email || "").trim().toLowerCase() === "admin@admin.com";

  if (Object.prototype.hasOwnProperty.call(updates, "password")) {
    if (updates.password) {
      updates.password = hashPassword(updates.password);
    } else {
      delete updates.password;
    }
  }

  allowed.forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(updates, key)) {
      return;
    }
    if (isSuperAdmin && ["email", "role", "is_active"].includes(key)) {
      return;
    }
    fields.push(`${key} = ?`);
    params.push(updates[key]);
  });

  if (isSuperAdmin) {
    fields.push("role = ?");
    params.push("admin");
    fields.push("is_active = ?");
    params.push(1);
    fields.push("email = ?");
    params.push("admin@admin.com");
  }

  if (!fields.length) return findById(id);
  params.push(id);
  await db.query(`UPDATE users SET ${fields.join(", ")} WHERE user_id = ?`, params);
  return findById(id);
}

async function deleteUser(id) {
  const user = await findById(id);
  if (
    user &&
    (user.role === "admin" || String(user.email || "").trim().toLowerCase() === "admin@admin.com")
  ) {
    return false;
  }
  const result = await db.query("DELETE FROM users WHERE user_id = ?", [id]);
  return result.affectedRows > 0;
}

module.exports = {
  listUsers,
  findByEmail,
  findById,
  getMainAdmin,
  createUser,
  updateUser,
  deleteUser,
  verifyPassword,
  isPasswordHashed,
};
