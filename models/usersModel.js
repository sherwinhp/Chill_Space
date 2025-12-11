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

async function findById(id) {
  const rows = await db.query("SELECT * FROM users WHERE user_id = ?", [id]);
  return rows.length ? toUser(rows[0]) : null;
}

async function createUser({ name, email, password, role = "user" }) {
  try {
    const result = await db.query(
      "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)",
      [name, email, password, role]
    );
    return findById(result.insertId);
  } catch (error) {
    // Fallback if role column does not exist in current schema
    const result = await db.query("INSERT INTO users (name, email, password) VALUES (?, ?, ?)", [
      name,
      email,
      password,
    ]);
    return { ...(await findById(result.insertId)), role };
  }
}

async function updateUser(id, updates) {
  const allowed = ["name", "email", "password", "role", "student_status", "student_id", "venue_id"];
  const fields = [];
  const values = [];
  for (const key of allowed) {
    if (updates[key] !== undefined) {
      fields.push(`${key} = ?`);
      values.push(updates[key]);
    }
  }
  if (!fields.length) return findById(id);
  values.push(id);
  try {
    await db.query(`UPDATE users SET ${fields.join(", ")} WHERE user_id = ?`, values);
  } catch (error) {
    // Retry without role if column missing
    const filtered = fields
      .map((f, idx) => ({ f, v: values[idx] }))
      .filter(({ f }) => !f.startsWith("role"));
    if (!filtered.length) throw error;
    const retryFields = filtered.map(({ f }) => f);
    const retryValues = filtered.map(({ v }) => v);
    retryValues.push(id);
    await db.query(`UPDATE users SET ${retryFields.join(", ")} WHERE user_id = ?`, retryValues);
  }
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
  createUser,
  updateUser,
  deleteUser,
};
