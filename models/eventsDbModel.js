const db = require("../db");

function toEvent(row) {
  return {
    id: row.event_id,
    title: row.title,
    description: row.description || "",
    startDate: row.event_date,
    endDate: row.end_date || row.event_date,
    image: row.image_url || "",
  };
}

async function listEvents() {
  try {
    const rows = await db.query(
      "SELECT event_id, title, description, event_date, end_date, image_url FROM events ORDER BY event_date DESC"
    );
    return rows.map(toEvent);
  } catch (error) {
    if (error && error.code === "ER_BAD_FIELD_ERROR") {
      const rows = await db.query(
        "SELECT event_id, title, description, event_date, image_url FROM events ORDER BY event_date DESC"
      );
      return rows.map((row) => toEvent({ ...row, end_date: row.event_date }));
    }
    throw error;
  }
}

async function createEvent(payload) {
  const { title, description, event_date, end_date, image_url } = payload;
  const result = await db.query(
    `INSERT INTO events (title, description, event_date, end_date, image_url)
     VALUES (?, ?, ?, ?, ?)`,
    [title, description || "", event_date, end_date || event_date, image_url || ""]
  );
  return result.insertId;
}

async function updateEvent(id, updates) {
  const fields = [];
  const params = [];
  const allowed = ["title", "description", "event_date", "end_date", "image_url"];
  allowed.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      fields.push(`${key} = ?`);
      params.push(updates[key]);
    }
  });
  if (!fields.length) return true;
  params.push(id);
  await db.query(`UPDATE events SET ${fields.join(", ")} WHERE event_id = ?`, params);
  return true;
}

async function deleteEvent(id) {
  const result = await db.query("DELETE FROM events WHERE event_id = ?", [id]);
  return result.affectedRows > 0;
}

module.exports = {
  listEvents,
  createEvent,
  updateEvent,
  deleteEvent,
};
