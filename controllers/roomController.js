const { listRooms: listRoomsData, findRoomById } = require("../models/roomsModel");
const {
  isRoomAvailable,
  listBookingsByRoomRange,
  listHoldsByRoomRange,
  createBookingHold,
  releaseBookingHold,
} = require("../models/bookingsModel");

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
  res.render("room-book", { room });
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

  const start = new Date(start_time);
  const end = new Date(end_time);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return res.status(400).json({ error: "Invalid booking time." });
  }

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
    start_time,
    end_time,
  });
  res.status(201).json({ holdId });
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
