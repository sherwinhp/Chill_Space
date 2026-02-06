// I declare that this code was written by me. 
// I will not copy or allow others to copy my code. 
// I understand that copying code is considered as plagiarism.
 
// Student Name: Aaron Ryan Tan Wei Rong

// Student ID:24048424​

// Class: C372-002-E63C
// Date created: 06-02-2026

const { listRooms } = require("../models/roomsModel");
const { applyPeakSurcharge } = require("../models/bookingsModel");
const { listEvents } = require("../models/eventsDbModel");
const { listPromotions } = require("../models/promotionsDbModel");
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

async function renderHome(req, res) {
  try {
    const rooms = await listRooms();
    const roomsWithDisplayRates = rooms.map((room) => ({
      ...room,
      peakHourlyRateDisplay: applyPeakSurcharge(room.peakHourlyRate),
    }));
    res.render("home", { rooms: roomsWithDisplayRates });
  } catch (error) {
    console.error(error);
    res.status(500).send("Unable to load rooms.");
  }
}

async function renderEvents(req, res) {
  try {
    const [events, promotions] = await Promise.all([listEvents(), listPromotions()]);
    res.render("events", { events, promotions });
  } catch (error) {
    console.error(error);
    res.status(500).send("Unable to load events.");
  }
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
  renderHome,
  renderEvents,
  renderMenu,
  getMenu,
};
