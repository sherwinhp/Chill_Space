const express = require("express");
const path = require("path");
const multer = require("multer");
const homeController = require("./controllers/homeController");
const bookingsPageController = require("./controllers/bookingsPageController");
const menuController = require("./controllers/menuController");
const eventsPageController = require("./controllers/eventsPageController");
const roomController = require("./controllers/roomController");
const roomsRouter = require("./routes/rooms");
const cartController = require("./controllers/cartController");
const authController = require("./controllers/authController");
const paymentsController = require("./controllers/paymentsController");
const purchasesController = require("./controllers/purchasesController");
const walletController = require("./controllers/walletController");
const reviewsRouter = require("./routes/reviews");
const { sessionMiddleware, requireAdmin, attachWalletBalance } = require("./middleware");
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
app.use("/images", express.static(path.join(__dirname, "public", "uploads")));
app.use(attachWalletBalance);

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
app.use("/rooms", roomsRouter);

app.post("/holds/:id/release", roomController.releaseHold);
app.get("/cart/items", cartController.listItems);
app.post("/cart/items", express.json(), cartController.addItem);
app.patch("/cart/items/:id", express.json(), cartController.updateItemQty);
app.delete("/cart/items/:id", cartController.removeItem);
app.delete("/cart/clear", cartController.clear);
app.post("/payments/paypal/create", express.json(), paymentsController.createPaypalOrder);
app.post("/api/paypal/create-order", express.json(), paymentsController.createPaypalButtonOrder);
app.post("/api/paypal/capture-order", express.json(), paymentsController.capturePaypalButtonOrder);
app.post("/payments/wallet/pay", express.json(), paymentsController.payCheckoutWithWallet);
app.post("/payments/nets/qr/create", express.json(), paymentsController.createNetsQrPayment);
app.get("/payments/nets/qr/status/:txnRetrievalRef", paymentsController.getNetsTxnStatus);
app.get("/payments/nets/qr/stream/:txnRetrievalRef", paymentsController.streamNetsTxnStatus);
app.post("/payments/nets/qr/complete", express.json(), paymentsController.completeNetsPayment);
app.post("/payments/hitpay/paynow/create", express.json(), paymentsController.createHitpayPayNowPayment);
app.get("/payments/hitpay/return", paymentsController.handleHitpayReturn);
app.get("/menu", menuController.renderMenu);
app.get("/products", menuController.getMenu);
app.get("/api/products", menuController.getMenu);
app.get("/events", eventsPageController.renderEvents);
app.get("/wallet", walletController.renderWallet);
app.post("/wallet/topup/paypal/create", express.json(), walletController.createPaypalTopup);
app.post("/wallet/topup/paypal/capture", express.json(), walletController.capturePaypalTopup);
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
app.get("/forgot-password", authController.renderForgotPasswordPage);
app.get("/reset-password", authController.renderResetPasswordPage);
app.get("/auth/me", authController.me);
app.post("/auth/login", authController.login);
app.post("/auth/verify-2fa", authController.verifyTwoFactor);
app.post("/auth/forgot-password", authController.forgotPassword);
app.post("/auth/reset-password", authController.resetPassword);
app.post("/auth/register", authController.register);
app.post("/auth/logout", authController.logout);
app.use("/reviews", reviewsRouter);

app.use("/admin", requireAdmin, adminRouter);

app.listen(PORT, () => {
  console.log(`Chill Space running on http://localhost:${PORT}`);
});
