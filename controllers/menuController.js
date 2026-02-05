const { listMenuItems } = require("../models/menuDbModel");

const FALLBACK_MENU_IMAGES = {
  "Burger Basket": "Burger Basket.jpg",
  "Nachos Supreme": "Nachos Supreme.jpg",
  "Pizza Party Box": "Pizza Party Box.png",
  "Snack Attack Bundle": "Snack Attack Bundle.jpg",
  "Wings & Fries Combo": "Wings & Fries Combo.jpg",
};

function getCategoryLabel(value) {
  if (value === "food") return "Food";
  if (value === "drink") return "Beverages";
  if (value === "addon") return "Room Themes";
  return "Food";
}

function normalizeImageUrl(value) {
  if (!value) return "";
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }
  if (value.startsWith("/")) {
    return encodeURI(value);
  }
  if (value.startsWith("uploads/") || value.startsWith("images/")) {
    return encodeURI(`/${value}`);
  }
  return encodeURI(`/uploads/${value}`);
}

function resolveMenuImage(item) {
  const rawImage = (item.image || "").trim();
  if (rawImage) {
    return normalizeImageUrl(rawImage);
  }
  const fallback = FALLBACK_MENU_IMAGES[item.name];
  return fallback ? normalizeImageUrl(`uploads/${fallback}`) : "";
}

async function renderMenu(req, res) {
  try {
    const items = await listMenuItems();
    const menuItems = items.map((item) => ({
      ...item,
      displayCategory: getCategoryLabel(item.category),
      imageUrl: resolveMenuImage(item),
    }));
    res.render("menu", { menuItems });
  } catch (error) {
    console.error(error);
    res.status(500).send("Unable to load menu.");
  }
}

async function getMenu(req, res) {
  try {
    const items = await listMenuItems();
    res.json(items);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error retrieving products" });
  }
}

module.exports = {
  renderMenu,
  getMenu,
};
