const express = require("express");
const router = express.Router();
const reviewsController = require("../controllers/reviewsController");

router.get("/", reviewsController.index);
router.get("/add", reviewsController.addForm);
router.post("/add", reviewsController.create);
router.get("/edit/:id", reviewsController.editForm);
router.post("/edit/:id", reviewsController.update);
router.get("/delete/:id", reviewsController.delete);

module.exports = router;
