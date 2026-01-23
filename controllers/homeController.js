const { listRooms } = require("../models/roomsModel");

async function renderHome(req, res) {
  try {
    const rooms = await listRooms();
    res.render("home", { rooms });
  } catch (error) {
    console.error(error);
    res.status(500).send("Unable to load rooms.");
  }
}

module.exports = {
  renderHome,
};
