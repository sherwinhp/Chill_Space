const { listMenuItems } = require("../models/menuDbModel");

function getCategoryLabel(value) {
  if (value === "food") return "Food";
  if (value === "drink") return "Beverages";
  if (value === "addon") return "Room Themes";
  return "Food";
}

async function renderMenu(req, res) {
  try {
    const items = await listMenuItems();
    const menuItems = items.map((item) => ({
      ...item,
      displayCategory: getCategoryLabel(item.category),
    }));
    res.render("menu", { menuItems });
  } catch (error) {
    console.error(error);
    res.status(500).send("Unable to load menu.");
  }
}

async function getMenu(req, res) {
  const items = await listMenuItems();
  res.json(items);
}

module.exports = {
  renderMenu,
  getMenu,
};
