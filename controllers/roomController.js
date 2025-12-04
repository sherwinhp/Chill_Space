const { getRooms, findRoomById } = require("../models/roomsModel");
const { isRoomAvailable } = require("../models/bookingsModel");

function listRooms(req, res) {
  res.json(getRooms());
}

function getRoom(req, res) {
  const roomId = Number(req.params.id);
  const room = findRoomById(roomId);
  if (!room) {
    return res.status(404).json({ error: "Room not found" });
  }
  res.json(room);
}

function checkAvailability(req, res) {
  const roomId = Number(req.params.id);
  const { date, startTime, endTime } = req.query;
  const room = findRoomById(roomId);
  if (!room) {
    return res.status(404).json({ error: "Room not found" });
  }

  if (!date || !startTime || !endTime) {
    return res.status(400).json({ error: "Missing date, startTime, or endTime" });
  }

  const available = isRoomAvailable(roomId, date, startTime, endTime);
  res.json({ available });
}

module.exports = {
  listRooms,
  getRoom,
  checkAvailability,
};
