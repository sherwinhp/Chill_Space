const db = require("../db");

// Normalize DB rows to a consistent shape used by controllers/UI
function toUser(row) {
  return {
    id: row.user_id,
    name: row.name,
    email: row.email,
    password: row.password,
    role: row.role || "user",
    student_status: row.student_status,
    student_id: row.student_id,
    venue_id: row.venue_id,
  };
}

async function listUsers() {
  const rows = await db.query("SELECT * FROM users");
  return rows.map(toUser);
}

async function findByEmail(email) {
  const rows = await db.query("SELECT * FROM users WHERE email = ?", [email]);
  return rows.length ? toUser(rows[0]) : null;
}

function findById(id) {
  return users.find((u) => u.id === id);
}

function createUser({ name, email, password, role = "user" }) {
  if (findByEmail(email)) {
    throw new Error("Email already registered");
  }
  const user = { id: nextUserId++, name, email, password, role };
  users.push(user);
  return user;
}

function updateUser(id, updates) {
  const user = findById(id);
  if (!user) return null;
  Object.assign(user, updates);
  return user;
}

function deleteUser(id) {
  const index = users.findIndex((u) => u.id === id);
  if (index === -1) return false;
  users.splice(index, 1);
  return true;
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
