const express = require("express");
const path = require("path");
const multer = require("multer");
const adminController = require("../controllers/adminController");

const router = express.Router();

const storage = multer.diskStorage({
  destination: path.join(__dirname, "..", "public", "uploads"),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, safeName);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith("image/")) {
      cb(null, true);
      return;
    }
    cb(new Error("Only image uploads are allowed."));
  },
  limits: { fileSize: 3 * 1024 * 1024 },
});

router.get("/", adminController.renderDashboard);

router.get("/rooms", adminController.renderRooms);
router.get("/rooms/new", adminController.renderRoomCreate);
router.post("/rooms", upload.single("image"), adminController.addRoom);
router.post("/rooms/:id", upload.single("image"), adminController.editRoom);
router.post("/rooms/:id/delete", adminController.removeRoom);

router.get("/bookings", adminController.renderBookings);
router.post("/bookings", adminController.addBooking);
router.post("/bookings/:id", adminController.editBooking);
router.post("/bookings/:id/delete", adminController.removeBooking);

router.get("/menu", adminController.renderMenu);
router.get("/menu/new", adminController.renderMenuCreate);
router.post("/menu", upload.single("image"), adminController.addMenuItem);
router.post("/menu/:id", upload.single("image"), adminController.editMenuItem);
router.post("/menu/:id/delete", adminController.removeMenuItem);

router.get("/events", adminController.renderEvents);
router.get("/events/new", adminController.renderEventsCreate);
router.post("/events", upload.single("image"), adminController.addEvent);
router.post("/events/:id", upload.single("image"), adminController.editEvent);
router.post("/events/:id/delete", adminController.removeEvent);

router.get("/promotions", adminController.renderPromotions);
router.get("/promotions/new", adminController.renderPromotionsCreate);
router.post("/promotions", upload.single("image"), adminController.addPromotion);
router.post("/promotions/:id", upload.single("image"), adminController.editPromotion);
router.post("/promotions/:id/delete", adminController.removePromotion);

router.get("/reviews", adminController.renderReviews);
router.get("/reviews/new", adminController.renderReviewsCreate);
router.post("/reviews", adminController.addReview);
router.post("/reviews/:id", adminController.editReview);
router.post("/reviews/:id/delete", adminController.removeReview);

router.get("/users", adminController.renderUsers);
router.get("/users/new", adminController.renderUsersCreate);
router.get("/users/:id/purchases", adminController.renderUserPurchases);
router.post("/users", adminController.addUser);
router.post("/users/:id", adminController.editUser);
router.post("/users/:id/delete", adminController.removeUser);

router.get("/purchases", adminController.renderPurchases);

module.exports = router;
