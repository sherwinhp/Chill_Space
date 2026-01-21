// Lightweight booking store. In a real project this would be a database.
const { findRoomById } = require("./roomsModel");

const BOOKING_STATUSES = ["pending", "approved", "rejected", "cancelled"];
const PAYMENT_STATUSES = ["pending", "paid", "refunded", "void"];
const ACTIVE_STATUSES = new Set(["pending", "approved"]);

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
  const totalPrice = Number(((totalMinutes / 60) * room.pricePerHour).toFixed(2));

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
};
