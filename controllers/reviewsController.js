const { listReviews } = require("../models/reviewsModel");

function getReviews(req, res) {
  res.json(listReviews());
}

module.exports = {
  getReviews,
};
