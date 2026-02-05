const {
  listBookingsDb,
  findBookingDbById,
  createBookingDb,
  updateBookingDb,
} = require("../models/bookingsModel");
const { listRooms, findRoomById } = require("../models/roomsModel");
const { reverseOrderCashbackForBookingIfRefunded } = require("../models/walletModel");
const { calculateBookingPrice, getMaxAllowedDate } = require("../models/bookingsModel");
const MIN_LEAD_HOURS = 2;

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
    const now = new Date();
    const upcomingBookings = [];
    const pastBookings = [];
    bookings.forEach((booking) => {
      const endTime = new Date(booking.endTime);
      if (!Number.isNaN(endTime.getTime()) && endTime > now) {
        upcomingBookings.push(booking);
      } else {
        pastBookings.push(booking);
      }
    });
    const rooms = await listRooms();

    res.render("bookings", {
      bookings: upcomingBookings,
      pastBookings,
      rooms,
      isLoggedIn: true,
    });
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
    const minStart = new Date(Date.now() + MIN_LEAD_HOURS * 60 * 60000);
    if (start < minStart) {
      return res.status(400).send("Bookings must be at least 2 hours in advance.");
    }

    const maxAllowedDate = getMaxAllowedDate(new Date());
    if (start > maxAllowedDate || end > maxAllowedDate) {
      return res.status(400).send("Bookings are only available up to 3 months ahead.");
    }

    const totalPrice = calculateBookingPrice(start, end, {
      normalRate: room.normalHourlyRate,
      peakRate: room.peakHourlyRate,
    });

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

    if (booking.paymentStatus === "paid") {
      return res.redirect(`/bookings/${req.params.id}/refund`);
    }

    await updateBookingDb(req.params.id, {
      payment_status: "cancelled",
      admin_status: "declined",
    });
    reverseOrderCashbackForBookingIfRefunded(req.params.id).catch((error) => {
      console.error("Cashback reversal failed:", error.message);
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
