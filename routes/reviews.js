const express = require("express");
const path = require("path");
const multer = require("multer");
const router = express.Router();
const reviewsController = require("../controllers/reviewsController");

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

router.get("/", reviewsController.index);
router.get("/add", reviewsController.addForm);
router.post("/add", upload.single("photo"), reviewsController.create);
router.get("/edit/:id", reviewsController.editForm);
router.post("/edit/:id", upload.single("photo"), reviewsController.update);
router.get("/delete/:id", reviewsController.delete);

module.exports = router;
