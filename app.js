const express = require("express");
const path = require("path");
const multer = require("multer");
const homeController = require("./controllers/homeController");
const bookingsPageController = require("./controllers/bookingsPageController");
const menuController = require("./controllers/menuController");
const eventsPageController = require("./controllers/eventsPageController");
const roomController = require("./controllers/roomController");
const cartController = require("./controllers/cartController");
const authController = require("./controllers/authController");
const paymentsController = require("./controllers/paymentsController");
const purchasesController = require("./controllers/purchasesController");
const reviewsRouter = require("./routes/reviews");
const { sessionMiddleware, requireAdmin } = require("./middleware");
const profileController = require("./controllers/profileController");
const adminRouter = require("./routes/admin");

const app = express();
const PORT = process.env.PORT || 3000;

const uploadStorage = multer.diskStorage({
  destination: path.join(__dirname, "public", "uploads"),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, safeName);
  },
});

const uploadImage = multer({
  storage: uploadStorage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith("image/")) {
      cb(null, true);
      return;
    }
    cb(new Error("Only image uploads are allowed."));
  },
  limits: { fileSize: 3 * 1024 * 1024 },
});

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

app.use((req, res, next) => {
  if (req.session && req.session.role === "admin") {
    const acceptsHtml = req.headers.accept && req.headers.accept.includes("text/html");
    if (acceptsHtml && req.method === "GET" && !req.path.startsWith("/admin")) {
      return res.redirect("/admin");
    }
  }
  next();
});

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
app.post("/api/paypal/create-order", express.json(), paymentsController.createPaypalButtonOrder);
app.post("/api/paypal/capture-order", express.json(), paymentsController.capturePaypalButtonOrder);
app.get("/menu", menuController.renderMenu);
app.get("/products", menuController.getMenu);
app.get("/api/products", menuController.getMenu);
app.get("/events", eventsPageController.renderEvents);
app.get("/cart", (req, res) => res.render("cart"));
app.get("/checkout", (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.redirect("/login?redirect=/checkout&reason=checkout");
  }
  return res.render("checkout");
});
app.get("/invoice/:id", purchasesController.renderInvoice);
app.get("/purchases", purchasesController.renderPurchases);
app.get("/profile", profileController.renderProfile);
app.post("/profile", uploadImage.single("avatar"), profileController.updateProfile);
app.get("/login", authController.renderLoginPage);
app.get("/register", authController.renderRegisterPage);
app.get("/auth/me", authController.me);
app.post("/auth/login", authController.login);
app.post("/auth/verify-2fa", authController.verifyTwoFactor);
app.post("/auth/register", authController.register);
app.post("/auth/logout", authController.logout);
app.use("/reviews", reviewsRouter);

app.use("/admin", requireAdmin, adminRouter);

app.listen(PORT, () => {
  console.log(`Chill Space running on http://localhost:${PORT}`);
});
