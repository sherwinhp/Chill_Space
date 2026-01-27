const { listRooms, createRoom, updateRoom, deleteRoom } = require("../models/roomsModel");
const {
  listBookingsDb,
  createBookingDb,
  updateBookingDb,
  deleteBookingDb,
} = require("../models/bookingsModel");
const {
  listMenuItems,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
} = require("../models/menuDbModel");
const { listEvents, createEvent, updateEvent, deleteEvent } = require("../models/eventsDbModel");
const {
  listPromotions,
  createPromotion,
  updatePromotion,
  deletePromotion,
} = require("../models/promotionsDbModel");
const Reviews = require("../models/reviewsModel");
const {
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  findById,
} = require("../models/usersModel");
const {
  listAllTransactionsWithItems,
  getSalesSummary,
  listTransactionsWithItems,
} = require("../models/transactionsModel");

async function renderDashboard(req, res) {
  const [bookings, events, salesSummary] = await Promise.all([
    listBookingsDb(),
    listEvents(),
    getSalesSummary(),
  ]);
  const now = new Date();
  const upcomingBookings = bookings
    .filter((booking) => new Date(booking.endTime) > now)
    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
    .slice(0, 6);
  const upcomingEvents = events
    .filter((event) => {
      const endDate = event.endDate ? new Date(event.endDate) : new Date(event.startDate);
      return endDate >= now;
    })
    .slice(0, 4);

  res.render("admin/index", {
    upcomingBookings,
    upcomingEvents,
    salesSummary,
  });
}

async function renderRooms(req, res) {
  const rooms = await listRooms();
  res.render("admin/rooms", { rooms });
}

function renderRoomCreate(req, res) {
  res.render("admin/rooms-create");
}

async function addRoom(req, res) {
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : req.body.image_url;
  const payload = {
    name: req.body.name,
    subtitle: req.body.subtitle,
    capacity: Number(req.body.capacity),
    hourly_rate: Number(req.body.hourly_rate),
    description: req.body.description,
    image_url: imageUrl,
    features: req.body.features,
    is_available: req.body.is_available === "1",
  };
  await createRoom(payload);
  res.redirect("/admin/rooms");
}

async function editRoom(req, res) {
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : req.body.current_image_url;
  const updates = {
    name: req.body.name,
    subtitle: req.body.subtitle,
    capacity: Number(req.body.capacity),
    hourly_rate: Number(req.body.hourly_rate),
    description: req.body.description,
    image_url: imageUrl,
    features: req.body.features,
    is_available: req.body.is_available === "1",
  };
  await updateRoom(req.params.id, updates);
  res.redirect("/admin/rooms");
}

async function removeRoom(req, res) {
  await deleteRoom(req.params.id);
  res.redirect("/admin/rooms");
}

async function renderBookings(req, res) {
  const bookings = await listBookingsDb();
  res.render("admin/bookings", { bookings });
}

async function addBooking(req, res) {
  await createBookingDb({
    user_id: Number(req.body.user_id),
    room_id: Number(req.body.room_id),
    start_time: req.body.start_time,
    end_time: req.body.end_time,
    pax: Number(req.body.pax),
    total_price: Number(req.body.total_price) || null,
    payment_status: req.body.payment_status || "pending",
    admin_status: req.body.admin_status || "pending",
  });
  res.redirect("/admin/bookings");
}

async function editBooking(req, res) {
  await updateBookingDb(req.params.id, {
    user_id: Number(req.body.user_id),
    room_id: Number(req.body.room_id),
    start_time: req.body.start_time,
    end_time: req.body.end_time,
    pax: Number(req.body.pax),
    total_price: Number(req.body.total_price) || null,
    payment_status: req.body.payment_status,
    admin_status: req.body.admin_status,
  });
  res.redirect("/admin/bookings");
}

async function removeBooking(req, res) {
  await deleteBookingDb(req.params.id);
  res.redirect("/admin/bookings");
}

async function renderMenu(req, res) {
  const menuItems = await listMenuItems();
  res.render("admin/menu", { menuItems });
}

async function renderMenuCreate(req, res) {
  res.render("admin/menu-create");
}

async function addMenuItem(req, res) {
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : req.body.image_url;
  await createMenuItem({
    name: req.body.name,
    category: req.body.category,
    price: Number(req.body.price),
    description: req.body.description,
    image_url: imageUrl,
    is_available: req.body.is_available === "1",
  });
  res.redirect("/admin/menu");
}

async function editMenuItem(req, res) {
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : req.body.current_image_url;
  await updateMenuItem(req.params.id, {
    name: req.body.name,
    category: req.body.category,
    price: Number(req.body.price),
    description: req.body.description,
    image_url: imageUrl,
    is_available: req.body.is_available === "1",
  });
  res.redirect("/admin/menu");
}

async function removeMenuItem(req, res) {
  await deleteMenuItem(req.params.id);
  res.redirect("/admin/menu");
}

async function renderEvents(req, res) {
  const events = await listEvents();
  res.render("admin/events", { events });
}

async function renderEventsCreate(req, res) {
  res.render("admin/events-create");
}

async function addEvent(req, res) {
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : req.body.image_url;
  await createEvent({
    title: req.body.title,
    description: req.body.description,
    event_date: req.body.event_date,
    end_date: req.body.end_date || req.body.event_date,
    image_url: imageUrl,
  });
  res.redirect("/admin/events");
}

async function editEvent(req, res) {
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : req.body.current_image_url;
  await updateEvent(req.params.id, {
    title: req.body.title,
    description: req.body.description,
    event_date: req.body.event_date,
    end_date: req.body.end_date || req.body.event_date,
    image_url: imageUrl,
  });
  res.redirect("/admin/events");
}

async function removeEvent(req, res) {
  await deleteEvent(req.params.id);
  res.redirect("/admin/events");
}

async function renderPromotions(req, res) {
  const promotions = await listPromotions();
  res.render("admin/promotions", { promotions });
}

async function renderPromotionsCreate(req, res) {
  res.render("admin/promotions-create");
}

async function addPromotion(req, res) {
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : req.body.image_url;
  await createPromotion({
    title: req.body.title,
    description: req.body.description,
    code: req.body.code,
    discount_percent: Number(req.body.discount_percent),
    min_total: Number(req.body.min_total),
    start_date: req.body.start_date,
    end_date: req.body.end_date,
    image_url: imageUrl,
  });
  res.redirect("/admin/promotions");
}

async function editPromotion(req, res) {
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : req.body.current_image_url;
  await updatePromotion(req.params.id, {
    title: req.body.title,
    description: req.body.description,
    code: req.body.code,
    discount_percent: Number(req.body.discount_percent),
    min_total: Number(req.body.min_total),
    start_date: req.body.start_date,
    end_date: req.body.end_date,
    image_url: imageUrl,
  });
  res.redirect("/admin/promotions");
}

async function removePromotion(req, res) {
  await deletePromotion(req.params.id);
  res.redirect("/admin/promotions");
}

async function renderReviews(req, res) {
  const reviews = await Reviews.getAll();
  res.render("admin/reviews", { reviews });
}

async function renderReviewsCreate(req, res) {
  res.render("admin/reviews-create");
}

async function addReview(req, res) {
  const result = await Reviews.create(
    Number(req.body.user_id),
    Number(req.body.room_id),
    Number(req.body.rating),
    Number(req.body.rating_food || req.body.rating),
    Number(req.body.rating_service || req.body.rating),
    req.body.comment,
    req.body.image_url || null,
    "room"
  );
  if (typeof req.body.is_visible !== "undefined") {
    const reviewId = result && result.insertId ? result.insertId : null;
    if (reviewId) {
      await Reviews.setVisibility(reviewId, req.body.is_visible === "1");
    }
  }
  res.redirect("/admin/reviews");
}

async function editReview(req, res) {
  await Reviews.updateAdmin(
    req.params.id,
    Number(req.body.rating),
    Number(req.body.rating_food || req.body.rating),
    Number(req.body.rating_service || req.body.rating),
    req.body.comment,
    req.body.image_url || null,
    req.body.admin_reply
  );
  if (typeof req.body.is_visible !== "undefined") {
    await Reviews.setVisibility(req.params.id, req.body.is_visible === "1");
  }
  res.redirect("/admin/reviews");
}

async function removeReview(req, res) {
  await Reviews.delete(req.params.id);
  res.redirect("/admin/reviews");
}

async function renderUsers(req, res) {
  const users = await listUsers();
  res.render("admin/users", { users });
}

async function renderUsersCreate(req, res) {
  res.render("admin/users-create");
}

async function addUser(req, res) {
  await createUser({
    name: req.body.name,
    email: req.body.email,
    password: req.body.password,
    role: req.body.role || "user",
    is_active: req.body.is_active !== "0",
  });
  res.redirect("/admin/users");
}

async function editUser(req, res) {
  await updateUser(req.params.id, {
    name: req.body.name,
    email: req.body.email,
    password: req.body.password || undefined,
    role: req.body.role,
    is_active: req.body.is_active !== "0",
  });
  res.redirect("/admin/users");
}

async function removeUser(req, res) {
  await deleteUser(req.params.id);
  res.redirect("/admin/users");
}

async function renderPurchases(req, res) {
  const { transactions, itemsByTransaction } = await listAllTransactionsWithItems(100);
  res.render("admin/purchases", { transactions, itemsByTransaction, user: null });
}

async function renderUserPurchases(req, res) {
  const userId = Number(req.params.id);
  const user = await findById(userId);
  if (!user) {
    return res.status(404).send("User not found");
  }
  const { transactions, itemsByTransaction } = await listTransactionsWithItems(userId);
  const enrichedTransactions = transactions.map((transaction) => ({
    ...transaction,
    user_name: user.name,
    user_email: user.email,
  }));
  res.render("admin/purchases", {
    transactions: enrichedTransactions,
    itemsByTransaction,
    user,
  });
}

module.exports = {
  renderDashboard,
  renderRooms,
  renderRoomCreate,
  addRoom,
  editRoom,
  removeRoom,
  renderBookings,
  addBooking,
  editBooking,
  removeBooking,
  renderMenu,
  renderMenuCreate,
  addMenuItem,
  editMenuItem,
  removeMenuItem,
  renderEvents,
  renderEventsCreate,
  addEvent,
  editEvent,
  removeEvent,
  renderPromotions,
  renderPromotionsCreate,
  addPromotion,
  editPromotion,
  removePromotion,
  renderReviews,
  renderReviewsCreate,
  addReview,
  editReview,
  removeReview,
  renderUsers,
  renderUsersCreate,
  addUser,
  editUser,
  removeUser,
  renderPurchases,
  renderUserPurchases,
};
