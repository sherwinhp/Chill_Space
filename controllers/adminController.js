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
} = require("../models/usersModel");

function renderDashboard(req, res) {
  res.render("admin/index");
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

async function addReview(req, res) {
  await Reviews.create(
    Number(req.body.user_id),
    Number(req.body.room_id),
    Number(req.body.rating),
    req.body.comment,
    req.body.image_url || null
  );
  res.redirect("/admin/reviews");
}

async function editReview(req, res) {
  await Reviews.update(
    req.params.id,
    Number(req.body.rating),
    req.body.comment,
    req.body.image_url || null
  );
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
  addMenuItem,
  editMenuItem,
  removeMenuItem,
  renderEvents,
  addEvent,
  editEvent,
  removeEvent,
  renderPromotions,
  addPromotion,
  editPromotion,
  removePromotion,
  renderReviews,
  addReview,
  editReview,
  removeReview,
  renderUsers,
  addUser,
  editUser,
  removeUser,
};
