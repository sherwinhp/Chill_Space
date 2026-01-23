const db = require("../db");

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
}) {
  const existing = await findByEmail(email);
  if (existing) {
    throw new Error("Email already registered");
  }
  const result = await db.query(
    "INSERT INTO users (name, email, password, role, address, contact_number, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [name, email, password, role, address || null, contact_number || null, is_active ? 1 : 0]
  );
  return findById(result.insertId);
}

async function updateUser(id, updates) {
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
  ];

  allowed.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      fields.push(`${key} = ?`);
      params.push(updates[key]);
    }
  });

  if (!fields.length) return findById(id);
  params.push(id);
  await db.query(`UPDATE users SET ${fields.join(", ")} WHERE user_id = ?`, params);
  return findById(id);
}

async function deleteUser(id) {
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
};
