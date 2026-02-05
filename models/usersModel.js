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
    birth_date: row.birth_date || null,
    membership_tier: row.membership_tier || "Bronze",
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
}) {
  const existing = await findByEmail(email);
  if (existing) {
    throw new Error("Email already registered");
  }
  const result = await db.query(
    "INSERT INTO users (name, email, password, role, address, contact_number, is_active, birth_date, membership_tier) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      name,
      email,
      password,
      role,
      address || null,
      contact_number || null,
      is_active ? 1 : 0,
      birth_date || null,
      membership_tier || "Bronze",
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
  ];

  const isSuperAdmin =
    existing && String(existing.email || "").trim().toLowerCase() === "admin@admin.com";

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
};
