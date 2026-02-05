// Lightweight booking store (in-memory) and DB-backed admin helpers.
const db = require("../db");
const { findRoomById } = require("./roomsModel");

const BOOKING_STATUSES = ["pending", "approved", "rejected", "cancelled"];
const PAYMENT_STATUSES = ["pending", "paid", "refunded", "void"];
const ACTIVE_STATUSES = new Set(["pending", "approved"]);
const PEAK_START_HOUR = 18;
const PEAK_END_HOUR = 23;

const bookings = [
  {
    id: 1,
    roomId: 1,
    roomName: "Collab Studio",
    name: "Jamie Lee",
    email: "jamie@example.com",
    date: "2025-04-20",
    startTime: "10:00",
    endTime: "12:00",
    purpose: "Sprint planning",
    pax: 4,
    bookingStatus: "approved",
    paymentStatus: "paid",
    createdAt: "2025-04-10T09:00:00Z",
  },
];

let nextId = bookings.length + 1;

function listBookings(filters = {}) {
  const { status, roomId, email, date } = filters;
  return bookings.filter((booking) => {
    if (status && booking.bookingStatus !== status) return false;
    if (roomId && booking.roomId !== Number(roomId)) return false;
    if (email && booking.email !== email) return false;
    if (date && booking.date !== date) return false;
    return true;
  });
}

function getBookingById(id) {
  return bookings.find((b) => b.id === Number(id));
}

function isRoomAvailable(roomId, date, startTime, endTime, excludeBookingId) {
  return !bookings.some(
    (booking) =>
      booking.roomId === roomId &&
      booking.date === date &&
      ACTIVE_STATUSES.has(booking.bookingStatus) &&
      booking.id !== Number(excludeBookingId) &&
      timesOverlap(booking.startTime, booking.endTime, startTime, endTime)
  );
}

function createBooking(payload) {
  const room = findRoomById(payload.roomId);
  if (!room) {
    throw new Error("Room not found");
  }

  if (
    !payload.name ||
    !payload.email ||
    !payload.date ||
    !payload.startTime ||
    !payload.endTime
  ) {
    throw new Error("Missing required fields");
  }

  if (payload.pax && Number(payload.pax) > room.capacity) {
    throw new Error(`This room supports up to ${room.capacity} pax.`);
  }

  if (!isRoomAvailable(payload.roomId, payload.date, payload.startTime, payload.endTime)) {
    throw new Error("This room is already booked for that time.");
  }

  const totalMinutes =
    toMinutes(payload.endTime) - toMinutes(payload.startTime) > 0
      ? toMinutes(payload.endTime) - toMinutes(payload.startTime)
      : 0;
  const rateUsed = isPeakHourTime(payload.startTime)
    ? Number(room.peakHourlyRate)
    : Number(room.normalHourlyRate);
  const safeRate = Number.isFinite(rateUsed) ? rateUsed : 0;
  const totalPrice = Number(((totalMinutes / 60) * safeRate).toFixed(2));

  const booking = {
    id: nextId++,
    roomId: room.id,
    roomName: room.name,
    name: payload.name,
    email: payload.email,
    phone: payload.phone || "",
    date: payload.date,
    startTime: payload.startTime,
    endTime: payload.endTime,
    purpose: payload.purpose || "",
    pax: Number(payload.pax) || 1,
    bookingStatus: "pending",
    paymentStatus: "pending",
    totalPrice,
    createdAt: new Date().toISOString(),
  };

  bookings.push(booking);
  return booking;
}

function updateBooking(id, updates) {
  const booking = getBookingById(id);
  if (!booking) {
    throw new Error("Booking not found");
  }
  if (["cancelled", "rejected"].includes(booking.bookingStatus)) {
    throw new Error("Cannot update a cancelled or rejected booking.");
  }

  const nextDate = updates.date || booking.date;
  const nextStart = updates.startTime || booking.startTime;
  const nextEnd = updates.endTime || booking.endTime;
  if (nextStart && nextEnd && nextStart >= nextEnd) {
    throw new Error("End time must be later than start time.");
  }

  if (!isRoomAvailable(booking.roomId, nextDate, nextStart, nextEnd, booking.id)) {
    throw new Error("New time conflicts with an existing booking.");
  }

  const room = findRoomById(booking.roomId);
  if (updates.pax && Number(updates.pax) > room.capacity) {
    throw new Error(`This room supports up to ${room.capacity} pax.`);
  }

  booking.date = nextDate;
  booking.startTime = nextStart;
  booking.endTime = nextEnd;
  booking.purpose = updates.purpose ?? booking.purpose;
  booking.pax = updates.pax ? Number(updates.pax) : booking.pax;
  booking.updatedAt = new Date().toISOString();
  return booking;
}

function cancelBooking(id, reason = "") {
  const booking = getBookingById(id);
  if (!booking) {
    throw new Error("Booking not found");
  }
  if (booking.bookingStatus === "cancelled") {
    throw new Error("Booking is already cancelled.");
  }
  booking.bookingStatus = "cancelled";
  if (booking.paymentStatus === "paid") {
    booking.paymentStatus = "refunded";
  }
  booking.cancellationReason = reason;
  booking.cancelledAt = new Date().toISOString();
  return booking;
}

function approveBooking(id) {
  const booking = getBookingById(id);
  if (!booking) {
    throw new Error("Booking not found");
  }
  if (booking.bookingStatus === "approved") {
    throw new Error("Booking already approved.");
  }
  if (booking.bookingStatus === "rejected") {
    throw new Error("Rejected bookings cannot be approved.");
  }
  booking.bookingStatus = "approved";
  booking.approvedAt = new Date().toISOString();
  return booking;
}

function rejectBooking(id, reason = "") {
  const booking = getBookingById(id);
  if (!booking) {
    throw new Error("Booking not found");
  }
  if (booking.bookingStatus === "rejected") {
    throw new Error("Booking already rejected.");
  }
  if (booking.bookingStatus === "approved") {
    throw new Error("Approved bookings cannot be rejected.");
  }
  booking.bookingStatus = "rejected";
  booking.rejectionReason = reason;
  booking.rejectedAt = new Date().toISOString();
  return booking;
}

function updatePaymentStatus(id, nextStatus) {
  if (!PAYMENT_STATUSES.includes(nextStatus)) {
    throw new Error("Invalid payment status");
  }
  const booking = getBookingById(id);
  if (!booking) {
    throw new Error("Booking not found");
  }
  booking.paymentStatus = nextStatus;
  booking.paymentUpdatedAt = new Date().toISOString();
  return booking;
}

// Simple overlap check for HH:MM strings.
function timesOverlap(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

function toMinutes(value) {
  const [hours, minutes] = value.split(":").map((v) => Number(v));
  return hours * 60 + minutes;
}

function isPeakHourTime(value) {
  if (!value || typeof value !== "string") return false;
  const [hours] = value.split(":").map((v) => Number(v));
  if (!Number.isFinite(hours)) return false;
  return hours >= PEAK_START_HOUR && hours < PEAK_END_HOUR;
}

module.exports = {
  listBookings,
  getBookingById,
  createBooking,
  isRoomAvailable,
  updateBooking,
  cancelBooking,
  approveBooking,
  rejectBooking,
  updatePaymentStatus,
  BOOKING_STATUSES,
  PAYMENT_STATUSES,
  listBookingsDb,
  listBookingsByRoomRange,
  listHoldsByRoomRange,
  createBookingHold,
  releaseBookingHold,
  findBookingDbById,
  createBookingDb,
  updateBookingDb,
  deleteBookingDb,
};

function toBookingDb(row) {
  return {
    id: row.booking_id,
    userId: row.user_id,
    roomId: row.room_id,
    startTime: row.start_time,
    endTime: row.end_time,
    pax: row.pax,
    totalPrice: row.total_price,
    paymentStatus: row.payment_status,
    adminStatus: row.admin_status,
    roomName: row.room_name,
    roomImage: row.room_image,
    userName: row.user_name,
    userEmail: row.user_email,
  };
}

async function listBookingsDb(filters = {}) {
  const conditions = [];
  const params = [];

  if (filters.userId) {
    conditions.push("u.user_id = ?");
    params.push(filters.userId);
  }

  if (filters.email) {
    conditions.push("u.email = ?");
    params.push(filters.email);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = await db.query(
    `
      SELECT
        b.booking_id,
        b.user_id,
        b.room_id,
        b.start_time,
        b.end_time,
        b.pax,
        b.total_price,
        b.payment_status,
        b.admin_status,
        r.name AS room_name,
        r.image_url AS room_image,
        u.name AS user_name,
        u.email AS user_email
      FROM bookings b
      JOIN rooms r ON b.room_id = r.room_id
      JOIN users u ON b.user_id = u.user_id
      ${whereClause}
      ORDER BY b.start_time DESC
    `,
    params
  );

  return rows.map(toBookingDb);
}

async function listBookingsByRoomRange(roomId, startDate, endDate) {
  const rows = await db.query(
    `
      SELECT start_time, end_time
      FROM bookings
      WHERE room_id = ?
        AND start_time < ?
        AND end_time > ?
        AND admin_status <> 'declined'
        AND payment_status <> 'cancelled'
      ORDER BY start_time ASC
    `,
    [roomId, endDate, startDate]
  );

  return rows.map((row) => ({
    startTime: row.start_time,
    endTime: row.end_time,
  }));
}

async function listHoldsByRoomRange(roomId, startDate, endDate) {
  const rows = await db.query(
    `
      SELECT hold_id, start_time, end_time
      FROM booking_holds
      WHERE room_id = ?
        AND start_time < ?
        AND end_time > ?
      ORDER BY start_time ASC
    `,
    [roomId, endDate, startDate]
  );

  return rows.map((row) => ({
    holdId: row.hold_id,
    startTime: row.start_time,
    endTime: row.end_time,
  }));
}

async function createBookingHold({ room_id, start_time, end_time, user_id }) {
  const startValue = normalizeDateTime(start_time);
  const endValue = normalizeDateTime(end_time);
  try {
    const result = await db.query(
      `
        INSERT INTO booking_holds (room_id, user_id, start_time, end_time, expires_at)
        VALUES (?, ?, ?, ?, ?)
      `,
      [room_id, user_id || null, startValue, endValue, "9999-12-31 23:59:59"]
    );
    return result.insertId;
  } catch (error) {
    if (error && error.code === "ER_BAD_FIELD_ERROR") {
      const fallback = await db.query(
        `
          INSERT INTO booking_holds (room_id, user_id, start_time, end_time)
          VALUES (?, ?, ?, ?)
        `,
        [room_id, user_id || null, startValue, endValue]
      );
      return fallback.insertId;
    }
    throw error;
  }
}

async function releaseBookingHold(holdId) {
  const result = await db.query("DELETE FROM booking_holds WHERE hold_id = ?", [holdId]);
  return result.affectedRows > 0;
}

function normalizeDateTime(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return value.toISOString().slice(0, 19).replace("T", " ");
  }
  if (typeof value === "string" && value.includes("T")) {
    return value.replace("T", " ").replace("Z", "").slice(0, 19);
  }
  return value;
}

async function findBookingDbById(id) {
  const rows = await db.query(
    `
      SELECT
        b.booking_id,
        b.user_id,
        b.room_id,
        b.start_time,
        b.end_time,
        b.pax,
        b.total_price,
        b.payment_status,
        b.admin_status,
        r.name AS room_name,
        r.image_url AS room_image,
        u.name AS user_name,
        u.email AS user_email
      FROM bookings b
      JOIN rooms r ON b.room_id = r.room_id
      JOIN users u ON b.user_id = u.user_id
      WHERE b.booking_id = ?
      LIMIT 1
    `,
    [id]
  );

  return rows.length ? toBookingDb(rows[0]) : null;
}

async function createBookingDb(payload) {
  const {
    user_id,
    room_id,
    start_time,
    end_time,
    pax,
    total_price,
    payment_status,
    admin_status,
  } = payload;

  await db.query(
    `INSERT INTO bookings
      (user_id, room_id, start_time, end_time, pax, total_price, payment_status, admin_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      user_id,
      room_id,
      start_time,
      end_time,
      pax || 1,
      total_price || null,
      payment_status || "pending",
      admin_status || "pending",
    ]
  );
}

async function updateBookingDb(id, updates) {
  const fields = [];
  const params = [];
  const allowed = [
    "user_id",
    "room_id",
    "start_time",
    "end_time",
    "pax",
    "total_price",
    "payment_status",
    "admin_status",
  ];

  allowed.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      fields.push(`${key} = ?`);
      params.push(updates[key]);
    }
  });

  if (!fields.length) return;
  params.push(id);
  await db.query(`UPDATE bookings SET ${fields.join(", ")} WHERE booking_id = ?`, params);
}

async function deleteBookingDb(id) {
  await db.query("DELETE FROM bookings WHERE booking_id = ?", [id]);
}
