// Lightweight booking store. In a real project this would be a database.
const { findRoomById } = require("./roomsModel");

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
  },
];

let nextId = bookings.length + 1;

function listBookings() {
  return bookings;
}

function isRoomAvailable(roomId, date, startTime, endTime) {
  return !bookings.some(
    (booking) =>
      booking.roomId === roomId &&
      booking.date === date &&
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

  if (!isRoomAvailable(payload.roomId, payload.date, payload.startTime, payload.endTime)) {
    throw new Error("This room is already booked for that time.");
  }

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
  };

  bookings.push(booking);
  return booking;
}

// Simple overlap check for HH:MM strings.
function timesOverlap(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

module.exports = {
  listBookings,
  createBooking,
  isRoomAvailable,
};
