const {
  listBookings,
  createBooking,
  isRoomAvailable,
} = require("../models/bookingsModel");
const { findRoomById } = require("../models/roomsModel");

function getBookings(req, res) {
  res.json(listBookings());
}

function addBooking(req, res) {
  const { name, email, phone, date, startTime, endTime, purpose, roomId } = req.body;
  const roomIdNumber = Number(roomId);
  const room = findRoomById(roomIdNumber);
  if (!room) {
    return res.status(400).json({ error: "Please select a valid room." });
  }

  if (startTime && endTime && startTime >= endTime) {
    return res.status(400).json({ error: "End time must be later than start time." });
  }

  try {
    const booking = createBooking({
      roomId: roomIdNumber,
      name,
      email,
      phone,
      date,
      startTime,
      endTime,
      purpose,
    });
    res.status(201).json(booking);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

function availabilityPreview(req, res) {
  const { roomId, date, startTime, endTime } = req.body;
  const roomIdNumber = Number(roomId);
  const room = findRoomById(roomIdNumber);
  if (!room) {
    return res.status(400).json({ error: "Please select a valid room." });
  }

  if (!date || !startTime || !endTime) {
    return res.status(400).json({ error: "Missing date, startTime, or endTime." });
  }

  if (startTime >= endTime) {
    return res.status(400).json({ error: "End time must be later than start time." });
  }

  const available = isRoomAvailable(roomIdNumber, date, startTime, endTime);
  res.json({ available });
}

module.exports = {
  getBookings,
  addBooking,
  availabilityPreview,
};
