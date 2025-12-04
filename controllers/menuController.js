const { listMenu } = require("../models/menuModel");

function getMenu(req, res) {
  res.json(listMenu());
}

module.exports = {
  getMenu,
};
