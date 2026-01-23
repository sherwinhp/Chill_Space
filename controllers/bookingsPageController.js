const {
  listBookingsDb,
  findBookingDbById,
  createBookingDb,
  updateBookingDb,
} = require("../models/bookingsModel");
const { listRooms, findRoomById } = require("../models/roomsModel");

async function renderBookings(req, res) {
  try {
    const isLoggedIn = !!(req.session && req.session.userId);
    if (!isLoggedIn) {
      return res.render("bookings", { bookings: [], rooms: [], isLoggedIn: false });
    }

    const { userId, email } = req.query;
    const bookings = await listBookingsDb({
      userId: userId ? Number(userId) : req.session.userId,
      email: email ? String(email) : undefined,
    });
    const rooms = await listRooms();

    res.render("bookings", { bookings, rooms, isLoggedIn: true });
  } catch (error) {
    console.error(error);
    res.status(500).send("Unable to load bookings.");
  }
}

async function createBooking(req, res) {
  try {
    if (!req.session || !req.session.userId) {
      return res.redirect("/login");
    }

    const { room_id, start_time, end_time, pax } = req.body;
    if (!room_id || !start_time || !end_time) {
      return res.status(400).send("Room, start time, and end time are required.");
    }

    const room = await findRoomById(Number(room_id));
    if (!room) {
      return res.status(400).send("Room not found.");
    }

    const start = new Date(start_time);
    const end = new Date(end_time);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return res.status(400).send("End time must be later than start time.");
    }

    const totalMinutes = (end - start) / 60000;
    const totalPrice = Number(((totalMinutes / 60) * room.pricePerHour).toFixed(2));

    await createBookingDb({
      user_id: req.session.userId,
      room_id: Number(room_id),
      start_time,
      end_time,
      pax: Number(pax) || 1,
      total_price: totalPrice,
      payment_status: "pending",
      admin_status: "pending",
    });

    res.redirect("/bookings");
  } catch (error) {
    console.error(error);
    res.status(500).send("Unable to create booking.");
  }
}

async function cancelBooking(req, res) {
  try {
    if (!req.session || !req.session.userId) {
      return res.redirect("/login");
    }

    const booking = await findBookingDbById(req.params.id);
    if (!booking) {
      return res.status(404).send("Booking not found.");
    }

    const isOwner = booking.userId === req.session.userId;
    const isAdmin = req.session.role === "admin";
    if (!isOwner && !isAdmin) {
      return res.status(403).send("Not authorized.");
    }

    await updateBookingDb(req.params.id, {
      payment_status: "cancelled",
      admin_status: "declined",
    });

    res.redirect("/bookings");
  } catch (error) {
    console.error(error);
    res.status(500).send("Unable to cancel booking.");
  }
}

module.exports = {
  renderBookings,
  createBooking,
  cancelBooking,
};
