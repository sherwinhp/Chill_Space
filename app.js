const express = require("express");
const path = require("path");
const multer = require("multer");
const siteController = require("./controllers/siteController");
const bookingsPageController = require("./controllers/bookingsPageController");
const roomController = require("./controllers/roomController");
const cartController = require("./controllers/cartController");
const authController = require("./controllers/authController");
const paymentsController = require("./controllers/paymentsController");
const accountController = require("./controllers/accountController");
const walletController = require("./controllers/walletController");
const reviewsController = require("./controllers/reviewsController");
const eventsController = require("./controllers/eventsController");
const promotionsController = require("./controllers/promotionsController");
const adminController = require("./controllers/adminController");
const refundController = require("./controllers/refundController");
const {
  sessionMiddleware,
  requireAdmin,
  attachWalletBalance,
  attachNotificationCount,
} = require("./middleware");

const app = express();
const PORT = process.env.PORT || 3000;

app.post(
  "/stripe/webhook",
  express.raw({ type: "application/json" }),
  paymentsController.handleStripeWebhook
);

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
app.use(attachNotificationCount);

app.use((req, res, next) => {
  if (req.session && req.session.role === "admin") {
    const acceptsHtml = req.headers.accept && req.headers.accept.includes("text/html");
    if (acceptsHtml && req.method === "GET" && !req.path.startsWith("/admin")) {
      return res.redirect("/admin");
    }
  }
  next();
});

app.get("/", siteController.renderHome);
app.get("/bookings", bookingsPageController.renderBookings);
app.post("/bookings", bookingsPageController.createBooking);
app.post("/bookings/:id/cancel", bookingsPageController.cancelBooking);
app.get("/bookings/:id/refund", refundController.renderRefundForm);
app.post(
  "/bookings/:id/refund",
  uploadImage.single("refund_photo"),
  refundController.submitRefundRequest
);
app.get("/rooms", roomController.listRooms);
app.get("/rooms/:id", roomController.showRoom);
app.get("/rooms/:id/book", roomController.showRoom);
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
app.post("/payments/wallet/pay", express.json(), paymentsController.payCheckoutWithWallet);
app.post("/payments/stripe/card/pay", express.json(), paymentsController.payCheckoutWithStripeCard);
app.post(
  "/payments/stripe/card/confirm",
  express.json(),
  paymentsController.confirmStripeCardPayment
);
app.post(
  "/stripe/grabpay/create-session",
  express.json(),
  paymentsController.createStripeGrabPaySession
);
app.get("/stripe/success", paymentsController.handleStripeSuccess);
app.post("/payments/nets/qr/create", express.json(), paymentsController.createNetsQrPayment);
app.get("/payments/nets/qr/status/:txnRetrievalRef", paymentsController.getNetsTxnStatus);
app.get("/payments/nets/qr/stream/:txnRetrievalRef", paymentsController.streamNetsTxnStatus);
app.post("/payments/nets/qr/complete", express.json(), paymentsController.completeNetsPayment);
app.post("/payments/hitpay/paynow/create", express.json(), paymentsController.createHitpayPayNowPayment);
app.get("/payments/hitpay/return", paymentsController.handleHitpayReturn);
app.get("/menu", siteController.renderMenu);
app.get("/products", siteController.getMenu);
app.get("/api/products", siteController.getMenu);
app.get("/wallet", walletController.renderWallet);
app.get("/notifications", accountController.renderNotifications);
app.post("/notifications/read-all", accountController.markAllRead);
app.post("/wallet/topup/paypal/create", express.json(), walletController.createPaypalTopup);
app.post("/wallet/topup/paypal/capture", express.json(), walletController.capturePaypalTopup);
app.post("/wallet/topup/paynow/create", express.json(), walletController.createHitpayTopup);
app.get("/wallet/topup/hitpay/return", walletController.handleHitpayTopupReturn);
app.post("/wallet/topup/grabpay/create", express.json(), walletController.createGrabPayTopupSession);
app.get("/wallet/topup/stripe/success", walletController.handleGrabPayTopupSuccess);
app.post("/wallet/topup/nets/qr/create", express.json(), walletController.createNetsTopupQr);
app.post("/wallet/topup/nets/qr/complete", express.json(), walletController.completeNetsTopup);
app.post("/wallet/topup/stripe/card/pay", express.json(), walletController.createStripeCardTopup);
app.post("/wallet/topup/stripe/card/confirm", express.json(), walletController.confirmStripeCardTopup);
app.get("/cart", (req, res) => res.render("cart"));
app.get("/checkout", (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.redirect("/login?redirect=/checkout&reason=checkout");
  }
  return res.render("checkout");
});
app.get("/payment-processing/:id", accountController.renderPaymentProcessing);
app.get("/payment-success/:id", accountController.renderPaymentSuccess);
app.get("/invoice/:id", accountController.renderInvoice);
app.get("/invoice/:id/refund", refundController.renderTransactionRefundForm);
app.post(
  "/invoice/:id/refund",
  uploadImage.single("refund_photo"),
  refundController.submitTransactionRefundRequest
);
app.get("/purchases", accountController.renderPurchases);
app.get("/profile", accountController.renderProfile);
app.post("/profile", uploadImage.single("avatar"), accountController.updateProfile);
app.get("/profile/password", accountController.renderChangePassword);
app.post("/profile/password", accountController.updatePassword);
app.get("/login", authController.renderLoginPage);
app.get("/register", authController.renderRegisterPage);
app.get("/forgot-password", authController.renderForgotPasswordPage);
app.get("/reset-password", authController.renderResetPasswordPage);
app.get("/auth/me", authController.me);
app.post("/auth/login", authController.login);
app.post("/auth/verify-2fa", authController.verifyTwoFactor);
app.post("/auth/resend-2fa", authController.resendTwoFactor);
app.post("/auth/forgot-password", authController.forgotPassword);
app.post("/auth/reset-password", authController.resetPassword);
app.post("/auth/register", authController.register);
app.post("/auth/logout", authController.logout);
app.get("/reviews", reviewsController.index);
app.get("/reviews/add", reviewsController.addForm);
app.post("/reviews/add", uploadImage.single("photo"), reviewsController.create);
app.get("/reviews/edit/:id", reviewsController.editForm);
app.post("/reviews/edit/:id", uploadImage.single("photo"), reviewsController.update);
app.get("/reviews/delete/:id", reviewsController.delete);
app.get("/events", eventsController.renderEvents);
app.post("/events/:id/signup", eventsController.signup);
app.post("/promotions/apply", express.json(), promotionsController.apply);
app.post("/promotions/remove", express.json(), promotionsController.remove);

app.use("/admin", requireAdmin);
app.get("/admin", adminController.renderDashboard);
app.get("/admin/rooms", adminController.renderRooms);
app.get("/admin/rooms/new", adminController.renderRoomCreate);
app.post("/admin/rooms", uploadImage.single("image"), adminController.addRoom);
app.post("/admin/rooms/:id", uploadImage.single("image"), adminController.editRoom);
app.post("/admin/rooms/:id/delete", adminController.removeRoom);
app.get("/admin/bookings", adminController.renderBookings);
app.post("/admin/bookings", adminController.addBooking);
app.post("/admin/bookings/:id", adminController.editBooking);
app.post("/admin/bookings/:id/delete", adminController.removeBooking);
app.get("/admin/menu", adminController.renderMenu);
app.get("/admin/menu/new", adminController.renderMenuCreate);
app.post("/admin/menu", uploadImage.single("image"), adminController.addMenuItem);
app.post("/admin/menu/:id", uploadImage.single("image"), adminController.editMenuItem);
app.post("/admin/menu/:id/stock/increment", adminController.incrementMenuItemStock);
app.post("/admin/menu/:id/stock/decrement", adminController.decrementMenuItemStock);
app.post("/admin/menu/:id/delete", adminController.removeMenuItem);
app.get("/admin/events", eventsController.adminList);
app.get("/admin/events/new", eventsController.adminCreateForm);
app.post("/admin/events", uploadImage.single("image"), eventsController.adminCreate);
app.post("/admin/events/:id", uploadImage.single("image"), eventsController.adminEdit);
app.post("/admin/events/:id/delete", eventsController.adminDelete);
app.get("/admin/events/:id/participants", eventsController.adminParticipants);
app.post("/admin/events/:id/signups/:signupId/delete", eventsController.adminRemoveParticipant);
app.get("/admin/promotions", promotionsController.adminList);
app.get("/admin/promotions/new", promotionsController.adminCreateForm);
app.post("/admin/promotions", uploadImage.single("image"), promotionsController.adminCreate);
app.post("/admin/promotions/:id", uploadImage.single("image"), promotionsController.adminEdit);
app.post("/admin/promotions/:id/delete", promotionsController.adminDelete);
app.get("/admin/reviews", adminController.renderReviews);
app.get("/admin/reviews/new", adminController.renderReviewsCreate);
app.post("/admin/reviews", adminController.addReview);
app.post("/admin/reviews/:id", adminController.editReview);
app.post("/admin/reviews/:id/delete", adminController.removeReview);
app.get("/admin/users", adminController.renderUsers);
app.get("/admin/users/new", adminController.renderUsersCreate);
app.get("/admin/users/:id/purchases", adminController.renderUserPurchases);
app.post("/admin/users", adminController.addUser);
app.post("/admin/users/:id", adminController.editUser);
app.post("/admin/users/:id/delete", adminController.removeUser);
app.get("/admin/purchases", adminController.renderPurchases);
app.get("/admin/invoices", adminController.renderAdminInvoices);
app.get("/admin/invoices/:id", adminController.renderAdminInvoice);
app.get("/admin/transactions", adminController.renderTransactionLogs);
app.get("/admin/reports", adminController.renderReports);
app.get("/admin/reports.csv", adminController.exportReportsCsv);
app.get("/admin/compliance", adminController.renderCompliance);
app.post("/admin/compliance/watchlist", adminController.addWatchlist);
app.post("/admin/compliance/watchlist/:id/delete", adminController.removeWatchlist);
app.post("/admin/compliance/flags/:id/resolve", adminController.resolveCompliance);
app.get("/api/refunds", requireAdmin, adminController.listRefundsApi);
app.post("/api/refunds/:id/approve", requireAdmin, adminController.approveRefund);
app.post("/api/refunds/:id/deny", requireAdmin, adminController.denyRefund);
app.get("/admin/refunds", adminController.renderRefunds);
app.post("/admin/refunds/:id/approve", adminController.approveRefund);
app.post("/admin/refunds/:id/deny", adminController.denyRefund);

app.listen(PORT, () => {
  console.log(`Chill Space running on http://localhost:${PORT}`);
});
