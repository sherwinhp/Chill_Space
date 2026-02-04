const db = require("../db");

function parseFeatures(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return String(value)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
}

function toRoom(row) {
  const fallbackRate = Number(row.hourly_rate || 0);
  const normalRate = row.normal_hourly_rate != null ? Number(row.normal_hourly_rate) : fallbackRate;
  const peakRate = row.peak_hourly_rate != null ? Number(row.peak_hourly_rate) : normalRate;
  return {
    id: row.room_id,
    name: row.name,
    subtitle: row.subtitle || "",
    capacity: row.capacity,
    pricePerHour: normalRate,
    normalHourlyRate: normalRate,
    peakHourlyRate: peakRate,
    description: row.description || "",
    image: row.image_url || "",
    isAvailable: Boolean(row.is_available),
    features: parseFeatures(row.features),
  };
}

async function listRooms() {
  const rows = await db.query("SELECT * FROM rooms ORDER BY room_id ASC");
  return rows.map(toRoom);
}

async function findRoomById(id) {
  const rows = await db.query("SELECT * FROM rooms WHERE room_id = ?", [id]);
  return rows.length ? toRoom(rows[0]) : null;
}

async function createRoom(payload) {
  const {
    name,
    subtitle,
    capacity,
    hourly_rate,
    normal_hourly_rate,
    peak_hourly_rate,
    description,
    image_url,
    features,
    is_available,
  } = payload;

  try {
    const result = await db.query(
      `INSERT INTO rooms
        (name, subtitle, capacity, hourly_rate, normal_hourly_rate, peak_hourly_rate, description, image_url, features, is_available)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        subtitle || "",
        capacity,
        hourly_rate,
        normal_hourly_rate,
        peak_hourly_rate,
        description || "",
        image_url || "",
        features || "",
        is_available ? 1 : 0,
      ]
    );
    return findRoomById(result.insertId);
  } catch (error) {
    if (error && error.code === "ER_BAD_FIELD_ERROR") {
      const result = await db.query(
        `INSERT INTO rooms
          (name, capacity, hourly_rate, description, image_url)
         VALUES (?, ?, ?, ?, ?)`,
        [
          name,
          capacity,
          hourly_rate,
          description || "",
          image_url || "",
        ]
      );
      return findRoomById(result.insertId);
    }
    throw error;
  }
}

async function updateRoom(id, updates) {
  const fields = [];
  const params = [];
  const allowed = [
    "name",
    "subtitle",
    "capacity",
    "hourly_rate",
    "normal_hourly_rate",
    "peak_hourly_rate",
    "description",
    "image_url",
    "features",
    "is_available",
  ];

  allowed.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      fields.push(`${key} = ?`);
      params.push(updates[key]);
    }
  });

  if (!fields.length) return findRoomById(id);
  params.push(id);
  try {
    await db.query(`UPDATE rooms SET ${fields.join(", ")} WHERE room_id = ?`, params);
  } catch (error) {
    if (error && error.code === "ER_BAD_FIELD_ERROR") {
      const fallbackFields = fields.filter(
        (field) =>
          !field.startsWith("subtitle") &&
          !field.startsWith("features") &&
          !field.startsWith("is_available") &&
          !field.startsWith("normal_hourly_rate") &&
          !field.startsWith("peak_hourly_rate")
      );
      const fallbackParams = params.filter((_, idx) => fallbackFields.includes(fields[idx]));
      fallbackParams.push(id);
      await db.query(
        `UPDATE rooms SET ${fallbackFields.join(", ")} WHERE room_id = ?`,
        fallbackParams
      );
    } else {
      throw error;
    }
  }
  return findRoomById(id);
}

async function deleteRoom(id) {
  const result = await db.query("DELETE FROM rooms WHERE room_id = ?", [id]);
  return result.affectedRows > 0;
}

module.exports = {
  listRooms,
  findRoomById,
  createRoom,
  updateRoom,
  deleteRoom,
};
