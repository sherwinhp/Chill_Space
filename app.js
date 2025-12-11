const express = require("express");
const path = require("path");
const roomsController = require("./controllers/roomController");
const bookingsController = require("./controllers/bookingController");
const authController = require("./controllers/authController");
const userController = require("./controllers/userController");
const menuController = require("./controllers/menuController");
const eventsController = require("./controllers/eventsController");
const reviewsController = require("./controllers/reviewsController");
const { sessionMiddleware, requestLogger, requireAdmin, notFound, errorHandler } = require("./middleware");

const app = express();
const PORT = process.env.PORT || 3000;

app.set("view engine", "ejs");          // <-- ADD THIS
app.set("views", path.join(__dirname, "views"));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(sessionMiddleware);
app.use(requestLogger);
app.use(express.static(path.join(__dirname, "public")));
app.use("/partials", express.static(path.join(__dirname, "views", "partials")));

// Serve the landing page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Room routes
app.get("/api/rooms", roomsController.listRooms);
app.get("/api/rooms/:id", roomsController.getRoom);
app.get("/api/rooms/:id/availability", roomsController.checkAvailability);

// Booking routes
app.get("/api/bookings", bookingsController.getBookings);
app.get("/api/bookings/:id", bookingsController.getBooking);
app.post("/api/bookings", bookingsController.addBooking);
app.post("/api/bookings/availability", bookingsController.availabilityPreview);
app.patch("/api/bookings/:id", bookingsController.updateExistingBooking);
app.post("/api/bookings/:id/cancel", bookingsController.cancelExistingBooking);
app.post("/api/bookings/:id/approve", bookingsController.approveExistingBooking);
app.post("/api/bookings/:id/reject", bookingsController.rejectExistingBooking);
app.post("/api/bookings/:id/payment", bookingsController.updatePayment);

// Auth + users (non-API routes)
app.get("/login", authController.renderLoginPage);
app.get("/register", authController.renderRegisterPage);
app.post("/auth/register", authController.register);
app.post("/auth/login", authController.login);
app.get("/auth/me", authController.me);
app.post("/auth/logout", authController.logout);

// Admin users (non-API)
app.get("/admin/users", requireAdmin, userController.renderUsersPage);
app.get("/users", requireAdmin, userController.getUsers);
app.get("/users/:id", requireAdmin, userController.getUser);
app.patch("/users/:id", requireAdmin, userController.editUser);
app.delete("/users/:id", requireAdmin, userController.removeUser);

// Legacy API aliases (kept for compatibility)
app.post("/api/auth/register", authController.register);
app.post("/api/auth/login", authController.login);
app.get("/api/auth/me", authController.me);
app.post("/api/auth/logout", authController.logout);
app.get("/api/users", requireAdmin, userController.getUsers);
app.get("/api/users/:id", requireAdmin, userController.getUser);
app.patch("/api/users/:id", requireAdmin, userController.editUser);
app.delete("/api/users/:id", requireAdmin, userController.removeUser);

// Menu, reviews, events
app.get("/api/menu", menuController.getMenu);
app.get("/api/reviews", reviewsController.getApiReviews);
app.get("/api/events", eventsController.getEvents);
const reviewRouter = require("./routes/reviews");
app.use("/reviews", reviewRouter);


app.use(notFound);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Chill Space running on http://localhost:${PORT}`);
});
