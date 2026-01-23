const { listEvents } = require("../models/eventsDbModel");
const { listPromotions } = require("../models/promotionsDbModel");

async function renderEvents(req, res) {
  try {
    const [events, promotions] = await Promise.all([
      listEvents(),
      listPromotions(),
    ]);
    res.render("events", { events, promotions });
  } catch (error) {
    console.error(error);
    res.status(500).send("Unable to load events.");
  }
}

module.exports = {
  renderEvents,
};
