const express = require("express");
const path = require("path");
const homeController = require("./controllers/homeController");
const bookingsPageController = require("./controllers/bookingsPageController");
const menuController = require("./controllers/menuController");
const eventsPageController = require("./controllers/eventsPageController");
const roomController = require("./controllers/roomController");
const cartController = require("./controllers/cartController");
const authController = require("./controllers/authController");
const paymentsController = require("./controllers/paymentsController");
const reviewsRouter = require("./routes/reviews");
const { sessionMiddleware, requireAdmin } = require("./middleware");
const profileController = require("./controllers/profileController");
const adminRouter = require("./routes/admin");

const app = express();
const PORT = process.env.PORT || 3000;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(sessionMiddleware);
app.use((req, res, next) => {
  res.locals.session = req.session;
  next();
});
app.use(express.static(path.join(__dirname, "public")));

app.get("/", homeController.renderHome);
app.get("/bookings", bookingsPageController.renderBookings);
app.post("/bookings", bookingsPageController.createBooking);
app.post("/bookings/:id/cancel", bookingsPageController.cancelBooking);
app.get("/rooms/:id/book", roomController.renderRoomBooking);
app.get("/rooms/:id/availability", roomController.listAvailability);
app.post("/rooms/:id/hold", express.json(), roomController.createHold);
app.post("/holds/:id/release", roomController.releaseHold);
app.get("/cart/items", cartController.listItems);
app.post("/cart/items", express.json(), cartController.addItem);
app.patch("/cart/items/:id", express.json(), cartController.updateItemQty);
app.delete("/cart/items/:id", cartController.removeItem);
app.delete("/cart/clear", cartController.clear);
app.post("/payments/paypal/create", express.json(), paymentsController.createPaypalOrder);
app.get("/menu", menuController.renderMenu);
app.get("/events", eventsPageController.renderEvents);
app.get("/cart", (req, res) => res.render("cart"));
app.get("/checkout", (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.redirect("/login?redirect=/checkout&reason=checkout");
  }
  return res.render("checkout");
});
app.get("/profile", profileController.renderProfile);
app.post("/profile", profileController.updateProfile);
app.get("/login", authController.renderLoginPage);
app.get("/register", authController.renderRegisterPage);
app.get("/auth/me", authController.me);
app.post("/auth/login", authController.login);
app.post("/auth/register", authController.register);
app.post("/auth/logout", authController.logout);
app.use("/reviews", reviewsRouter);

app.use("/admin", requireAdmin, adminRouter);

app.listen(PORT, () => {
  console.log(`Chill Space running on http://localhost:${PORT}`);
});
