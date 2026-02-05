const express = require("express");
const roomController = require("../controllers/roomController");

const router = express.Router();

router.get("/", roomController.listRooms);
router.get("/:id", roomController.showRoom);
router.get("/:id/book", roomController.showRoom);
router.get("/:id/availability", roomController.listAvailability);
router.post("/:id/hold", express.json(), roomController.createHold);

module.exports = router;
