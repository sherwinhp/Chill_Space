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

const db = require("../db");

function normalizeImageUrl(value) {
  const raw = (value || "").toString().trim();
  if (!raw) return "";
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  if (raw.startsWith("/")) return encodeURI(raw);
  if (raw.startsWith("uploads/") || raw.startsWith("images/")) return encodeURI(`/${raw}`);
  return encodeURI(`/uploads/${raw}`);
}

function toEvent(row) {
  return {
    id: row.event_id,
    title: row.title,
    description: row.description || "",
    startDate: row.event_date,
    endDate: row.end_date || row.event_date,
    image: normalizeImageUrl(row.image_url),
    capacity: row.capacity === null || typeof row.capacity === "undefined" ? null : Number(row.capacity),
    entryFee: typeof row.entry_fee === "undefined" ? 0 : Number(row.entry_fee || 0),
    paidPax: typeof row.paid_pax === "undefined" ? 0 : Number(row.paid_pax || 0),
    spotsLeft:
      row.capacity === null || typeof row.capacity === "undefined"
        ? null
        : Math.max(0, Number(row.capacity || 0) - Number(row.paid_pax || 0)),
  };
}

async function listEvents() {
  try {
    const rows = await db.query(
      `
        SELECT
          e.event_id, e.title, e.description, e.event_date, e.end_date, e.image_url,
          e.capacity, e.entry_fee,
          COALESCE(SUM(CASE WHEN es.payment_status = 'paid' THEN es.pax END), 0) AS paid_pax
        FROM events e
        LEFT JOIN event_signups es ON es.event_id = e.event_id
        GROUP BY e.event_id
        ORDER BY e.event_date DESC
      `
    );
    return rows.map(toEvent);
  } catch (error) {
    if (error && error.code === "ER_BAD_FIELD_ERROR") {
      const rows = await db.query(
        "SELECT event_id, title, description, event_date, image_url FROM events ORDER BY event_date DESC"
      );
      return rows.map((row) =>
        toEvent({
          ...row,
          end_date: row.event_date,
          capacity: null,
          entry_fee: 0,
          paid_pax: 0,
        })
      );
    }
    if (error && (error.code === "ER_NO_SUCH_TABLE" || error.code === "ER_BAD_FIELD_ERROR")) {
      // event_signups table might not exist yet.
      const rows = await db.query(
        "SELECT event_id, title, description, event_date, end_date, image_url, capacity, entry_fee FROM events ORDER BY event_date DESC"
      );
      return rows.map(toEvent);
    }
    throw error;
  }
}

async function createEvent(payload) {
  const { title, description, event_date, end_date, image_url } = payload;
  const capacityRaw = payload.capacity;
  const entryFeeRaw = payload.entry_fee;
  const capacity =
    capacityRaw === "" || typeof capacityRaw === "undefined" || capacityRaw === null
      ? null
      : Number(capacityRaw);
  const entryFee =
    entryFeeRaw === "" || typeof entryFeeRaw === "undefined" || entryFeeRaw === null
      ? 0
      : Number(entryFeeRaw);

  let result;
  try {
    result = await db.query(
      `
        INSERT INTO events (title, description, event_date, end_date, image_url, capacity, entry_fee)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        title,
        description || "",
        event_date,
        end_date || event_date,
        image_url || "",
        Number.isFinite(capacity) ? capacity : null,
        Number.isFinite(entryFee) ? entryFee : 0,
      ]
    );
  } catch (error) {
    if (error && error.code === "ER_BAD_FIELD_ERROR") {
      result = await db.query(
        `INSERT INTO events (title, description, event_date, end_date, image_url)
         VALUES (?, ?, ?, ?, ?)`,
        [title, description || "", event_date, end_date || event_date, image_url || ""]
      );
    } else {
      throw error;
    }
  }
  return result.insertId;
}

async function updateEvent(id, updates) {
  const fields = [];
  const params = [];
  const allowed = ["title", "description", "event_date", "end_date", "image_url", "capacity", "entry_fee"];
  allowed.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      fields.push(`${key} = ?`);
      if (key === "capacity") {
        const raw = updates[key];
        const value =
          raw === "" || typeof raw === "undefined" || raw === null ? null : Number(raw);
        params.push(Number.isFinite(value) ? value : null);
      } else if (key === "entry_fee") {
        const raw = updates[key];
        const value =
          raw === "" || typeof raw === "undefined" || raw === null ? 0 : Number(raw);
        params.push(Number.isFinite(value) ? value : 0);
      } else {
        params.push(updates[key]);
      }
    }
  });
  if (!fields.length) return true;
  params.push(id);
  try {
    await db.query(`UPDATE events SET ${fields.join(", ")} WHERE event_id = ?`, params);
  } catch (error) {
    if (error && error.code === "ER_BAD_FIELD_ERROR") {
      // Schema may not include capacity/entry_fee yet; retry with safe subset.
      const fallbackFields = [];
      const fallbackParams = [];
      ["title", "description", "event_date", "end_date", "image_url"].forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(updates, key)) {
          fallbackFields.push(`${key} = ?`);
          fallbackParams.push(updates[key]);
        }
      });
      if (!fallbackFields.length) return true;
      fallbackParams.push(id);
      await db.query(
        `UPDATE events SET ${fallbackFields.join(", ")} WHERE event_id = ?`,
        fallbackParams
      );
    } else {
      throw error;
    }
  }
  return true;
}

async function deleteEvent(id) {
  const result = await db.query("DELETE FROM events WHERE event_id = ?", [id]);
  return result.affectedRows > 0;
}

async function getEventById(id) {
  const eventId = Number(id);
  if (!eventId) return null;
  try {
    const rows = await db.query(
      `
        SELECT
          e.event_id, e.title, e.description, e.event_date, e.end_date, e.image_url,
          e.capacity, e.entry_fee,
          COALESCE(SUM(CASE WHEN es.payment_status = 'paid' THEN es.pax END), 0) AS paid_pax
        FROM events e
        LEFT JOIN event_signups es ON es.event_id = e.event_id
        WHERE e.event_id = ?
        GROUP BY e.event_id
        LIMIT 1
      `,
      [eventId]
    );
    return rows.length ? toEvent(rows[0]) : null;
  } catch (error) {
    if (error && (error.code === "ER_NO_SUCH_TABLE" || error.code === "ER_BAD_FIELD_ERROR")) {
      const rows = await db.query(
        "SELECT event_id, title, description, event_date, end_date, image_url, capacity, entry_fee FROM events WHERE event_id = ? LIMIT 1",
        [eventId]
      );
      if (!rows.length) return null;
      return toEvent({ ...rows[0], paid_pax: 0 });
    }
    throw error;
  }
}

async function updateEventSignupStatus(eventId, userId, status) {
  const safeEventId = Number(eventId);
  const safeUserId = Number(userId);
  const safeStatus = String(status || "").trim() || "paid";
  if (!Number.isFinite(safeEventId) || !Number.isFinite(safeUserId)) return false;
  try {
    await db.query(
      "UPDATE event_signups SET payment_status = ? WHERE event_id = ? AND user_id = ?",
      [safeStatus, safeEventId, safeUserId]
    );
    return true;
  } catch (error) {
    if (error && (error.code === "ER_NO_SUCH_TABLE" || error.code === "ER_BAD_FIELD_ERROR")) {
      return false;
    }
    throw error;
  }
}

module.exports = {
  listEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  getEventById,
  updateEventSignupStatus,
};
