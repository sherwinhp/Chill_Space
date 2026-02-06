/*
I declare that this code was written by me.
I will not copy or allow others to copy my code.
I understand that copying code is considered as plagiarism.

Student Name: Angelo Miguel Beltran Casia, Aaron Ryan Tan Wei Rong, Chow Sherwin, Aniq Syazwan Bin Muliadi, Choo Tian En Javier, Christine Joy Teh Shi Hui

Student ID: 24048278, 24045221, 24049188, 24048876, 24046565, 24048424

Class: C372-002-E63C
Date created: 06-02-2026
*/
const {
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
} = require("../models/bookingsModel");
const { findRoomById } = require("../models/roomsModel");

function getBookings(req, res) {
  try {
    const { status, roomId, email, date } = req.query;
    if (status && !BOOKING_STATUSES.includes(status)) {
      return res.status(400).json({ error: "Invalid status filter." });
    }
    const bookings = listBookings({ status, roomId, email, date });
    res.json(bookings);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

function getBooking(req, res) {
  const booking = getBookingById(req.params.id);
  if (!booking) {
    return res.status(404).json({ error: "Booking not found." });
  }
  res.json(booking);
}

function addBooking(req, res) {
  const { name, email, phone, date, startTime, endTime, purpose, roomId, pax } = req.body;
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
      pax,
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

function updateExistingBooking(req, res) {
  const { id } = req.params;
  const { date, startTime, endTime, purpose, pax } = req.body;
  try {
    if (startTime && endTime && startTime >= endTime) {
      return res.status(400).json({ error: "End time must be later than start time." });
    }
    const booking = updateBooking(id, { date, startTime, endTime, purpose, pax });
    res.json(booking);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

function cancelExistingBooking(req, res) {
  const { id } = req.params;
  const { reason } = req.body;
  try {
    const booking = cancelBooking(id, reason);
    res.json(booking);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

function approveExistingBooking(req, res) {
  const { id } = req.params;
  try {
    const booking = approveBooking(id);
    res.json(booking);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

function rejectExistingBooking(req, res) {
  const { id } = req.params;
  const { reason } = req.body;
  try {
    const booking = rejectBooking(id, reason);
    res.json(booking);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

function updatePayment(req, res) {
  const { id } = req.params;
  const { paymentStatus } = req.body;
  if (!PAYMENT_STATUSES.includes(paymentStatus)) {
    return res.status(400).json({ error: "Invalid payment status." });
  }
  try {
    const booking = updatePaymentStatus(id, paymentStatus);
    res.json(booking);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

module.exports = {
  getBookings,
  getBooking,
  addBooking,
  availabilityPreview,
  updateExistingBooking,
  cancelExistingBooking,
  approveExistingBooking,
  rejectExistingBooking,
  updatePayment,
};
