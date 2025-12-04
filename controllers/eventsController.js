const { listEvents } = require("../models/eventsModel");

function getEvents(req, res) {
  res.json(listEvents());
}

module.exports = {
  getEvents,
};
