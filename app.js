const express = require("express");
const path = require("path");
const roomsController = require("./controllers/roomController");
const bookingsController = require("./controllers/bookingController");
const authController = require("./controllers/authController");
const userController = require("./controllers/userController");
const menuController = require("./controllers/menuController");
const eventsController = require("./controllers/eventsController");
const reviewsController = require("./controllers/reviewsController");
const { requestLogger, notFound, errorHandler } = require("./middleware");

const app = express();
const PORT = process.env.PORT || 3000;

app.set("view engine", "ejs");          // <-- ADD THIS
app.set("views", path.join(__dirname, "views"));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
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
app.post("/api/bookings", bookingsController.addBooking);
app.post("/api/bookings/availability", bookingsController.availabilityPreview);

// Auth + users
app.post("/api/auth/register", authController.register);
app.post("/api/auth/login", authController.login);
app.get("/api/users", userController.getUsers);
app.get("/api/users/:id", userController.getUser);
app.patch("/api/users/:id", userController.editUser);
app.delete("/api/users/:id", userController.removeUser);

// Menu, reviews, events
app.get("/api/menu", menuController.getMenu);
app.get("/api/events", eventsController.getEvents);
const reviewRouter = require("./routes/reviews");
app.use("/reviews", reviewRouter);


app.use(notFound);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Chill Space running on http://localhost:${PORT}`);
});
