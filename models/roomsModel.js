/*
I declare that this code was written by me.
I will not copy or allow others to copy my code.
I understand that copying code is considered as plagiarism.

Student Name: Angelo Miguel Beltran Casia, Aaron Ryan Tan Wei Rong, Chow Sherwin, Aniq Syazwan Bin Muliadi, Choo Tian En Javier, Christine Joy Teh Shi Hui

Student ID: 24048278, 24045221, 24049188, 24048876, 24046565, 24048424

Class: C372-002-E63C
Date created: 06-02-2026
*/
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
  const normalRate = Number(row.normal_hourly_rate);
  const peakRate = Number(row.peak_hourly_rate);
  const safeNormalRate = Number.isFinite(normalRate) ? normalRate : 0;
  const safePeakRate = Number.isFinite(peakRate) ? peakRate : safeNormalRate;
  return {
    id: row.room_id,
    name: row.name,
    subtitle: row.subtitle || "",
    capacity: row.capacity,
    pricePerHour: safeNormalRate,
    normalHourlyRate: safeNormalRate,
    peakHourlyRate: safePeakRate,
    description: row.description || "",
    image: row.image_url || "",
    image_url: row.image_url || "",
    isAvailable: Boolean(row.is_available),
    features: parseFeatures(row.features),
  };
}

async function listRooms() {
  const rows = await db.query(
    `SELECT
      room_id,
      name,
      subtitle,
      description,
      capacity,
      normal_hourly_rate,
      peak_hourly_rate,
      image_url,
      features,
      is_available,
      created_at
     FROM rooms
     ORDER BY room_id ASC`
  );
  return rows.map(toRoom);
}

async function getAllRooms() {
  const rows = await db.query(
    `SELECT
      room_id,
      name,
      subtitle,
      description,
      capacity,
      normal_hourly_rate,
      peak_hourly_rate,
      image_url,
      features,
      is_available,
      created_at
     FROM rooms
     WHERE is_available = 1
     ORDER BY room_id ASC`
  );
  return rows.map(toRoom);
}

async function findRoomById(id) {
  const rows = await db.query(
    `SELECT
      room_id,
      name,
      subtitle,
      description,
      capacity,
      normal_hourly_rate,
      peak_hourly_rate,
      image_url,
      features,
      is_available,
      created_at
     FROM rooms
     WHERE room_id = ?`,
    [id]
  );
  return rows.length ? toRoom(rows[0]) : null;
}

async function getRoomById(roomId) {
  const rows = await db.query(
    `SELECT
      room_id,
      name,
      subtitle,
      description,
      capacity,
      normal_hourly_rate,
      peak_hourly_rate,
      image_url,
      features,
      is_available,
      created_at
     FROM rooms
     WHERE room_id = ?`,
    [roomId]
  );
  return rows.length ? toRoom(rows[0]) : null;
}

async function createRoom(payload) {
  const {
    name,
    subtitle,
    capacity,
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
        (name, subtitle, capacity, normal_hourly_rate, peak_hourly_rate, description, image_url, features, is_available)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        subtitle || "",
        capacity,
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
  getAllRooms,
  findRoomById,
  getRoomById,
  createRoom,
  updateRoom,
  deleteRoom,
};
