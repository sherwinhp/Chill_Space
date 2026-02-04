const { listRooms: listRoomsData, findRoomById } = require("../models/roomsModel");
const Reviews = require("../models/reviewsModel");
const {
  isRoomAvailable,
  listBookingsByRoomRange,
  listHoldsByRoomRange,
  createBookingHold,
  releaseBookingHold,
} = require("../models/bookingsModel");
const {
  NORMAL_RATE_PER_HOUR,
  PEAK_RATE_PER_HOUR,
  getMaxAllowedDate,
} = require("../utils/bookingPricing");

async function listRooms(req, res) {
  const rooms = await listRoomsData();
  res.json(rooms);
}

async function getRoom(req, res) {
  const roomId = Number(req.params.id);
  const room = await findRoomById(roomId);
  if (!room) {
    return res.status(404).json({ error: "Room not found" });
  }
  res.json(room);
}

async function renderRoomBooking(req, res) {
  const roomId = Number(req.params.id);
  const room = await findRoomById(roomId);
  if (!room) {
    return res.status(404).send("Room not found");
  }
  const [stats] = await Reviews.getRoomStats(roomId);
  const reviews = await Reviews.getVisibleByRoomId(roomId);
  const avgRating = stats ? Number(stats.avg_rating || 0) : 0;
  const reviewCount = stats ? Number(stats.review_count || 0) : 0;
  res.render("room-book", {
    room,
    pricing: {
      normalRate: NORMAL_RATE_PER_HOUR,
      peakRate: PEAK_RATE_PER_HOUR,
    },
    rating: {
      average: avgRating,
      count: reviewCount,
    },
    reviews,
  });
}

async function checkAvailability(req, res) {
  const roomId = Number(req.params.id);
  const { date, startTime, endTime } = req.query;
  const room = await findRoomById(roomId);
  if (!room) {
    return res.status(404).json({ error: "Room not found" });
  }

  if (!date || !startTime || !endTime) {
    return res.status(400).json({ error: "Missing date, startTime, or endTime" });
  }

  const available = isRoomAvailable(roomId, date, startTime, endTime);
  res.json({ available });
}

async function listAvailability(req, res) {
  const roomId = Number(req.params.id);
  const { start, end } = req.query;
  if (!roomId || !start || !end) {
    return res.status(400).json({ error: "Missing roomId, start, or end." });
  }

  const room = await findRoomById(roomId);
  if (!room) {
    return res.status(404).json({ error: "Room not found" });
  }

  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return res.status(400).json({ error: "Invalid date range." });
  }
  const maxAllowedDate = getMaxAllowedDate(new Date());
  if (startDate > maxAllowedDate || endDate > maxAllowedDate) {
    return res.status(400).json({ error: "Bookings are only available up to 3 months ahead." });
  }

  const [bookings, holds] = await Promise.all([
    listBookingsByRoomRange(roomId, startDate, endDate),
    listHoldsByRoomRange(roomId, startDate, endDate),
  ]);
  const blocked = [...bookings, ...holds];
  res.json({ roomId, start, end, bookings: blocked });
}

async function createHold(req, res) {
  const roomId = Number(req.params.id);
  const { start_time, end_time } = req.body;
  if (!roomId || !start_time || !end_time) {
    return res.status(400).json({ error: "Missing room, start, or end time." });
  }

  const room = await findRoomById(roomId);
  if (!room) {
    return res.status(404).json({ error: "Room not found" });
  }

  const start = parseLocalDateTime(start_time);
  const end = parseLocalDateTime(end_time);
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return res.status(400).json({ error: "Invalid booking time." });
  }
  if (start <= new Date()) {
    return res.status(400).json({ error: "Booking time must be in the future." });
  }
  const maxAllowedDate = getMaxAllowedDate(new Date());
  if (start > maxAllowedDate || end > maxAllowedDate) {
    return res.status(400).json({ error: "Bookings are only available up to 3 months ahead." });
  }

  const normalizedStart = formatLocalDateTime(start);
  const normalizedEnd = formatLocalDateTime(end);

  const [bookings, holds] = await Promise.all([
    listBookingsByRoomRange(roomId, start, end),
    listHoldsByRoomRange(roomId, start, end),
  ]);
  if (bookings.length || holds.length) {
    return res.status(409).json({ error: "Slot not available." });
  }

  const holdId = await createBookingHold({
    room_id: roomId,
    user_id: req.session ? req.session.userId : null,
    start_time: normalizedStart,
    end_time: normalizedEnd,
  });
  res.status(201).json({ holdId });
}

function parseLocalDateTime(value) {
  if (!value || typeof value !== "string") return null;
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/
  );
  if (!match) {
    const fallback = new Date(value);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }
  const [, year, month, day, hour, minute, second] = match;
  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second || 0)
  );
}

function formatLocalDateTime(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  const hour = String(value.getHours()).padStart(2, "0");
  const minute = String(value.getMinutes()).padStart(2, "0");
  const second = String(value.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

async function releaseHold(req, res) {
  const holdId = Number(req.params.id);
  if (!holdId) {
    return res.status(400).json({ error: "Invalid hold." });
  }
  await releaseBookingHold(holdId);
  res.json({ ok: true });
}

module.exports = {
  listRooms,
  getRoom,
  renderRoomBooking,
  checkAvailability,
  listAvailability,
  createHold,
  releaseHold,
};
