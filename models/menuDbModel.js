/*
I declare that this code was written by me.
I will not copy or allow others to copy my code.
I understand that copying code is considered as plagiarism.

Student Name: Angelo Miguel Beltran Casia, Aaron Ryan Tan Wei Rong, Chow Sherwin, Aniq Syazwan Bin Muliadi, Choo Tian En Javier, Christine Joy Teh Shi Hui

Student ID: 24048278, 24045221, 24049188, 24048876, 24046565, 24048424

Class: C372-002-E63C
Date created: 06-02-2026
*/
// I declare that this code was written by me. 
// I will not copy or allow others to copy my code. 
// I understand that copying code is considered as plagiarism.
 
// Student Name: Aaron Ryan Tan Wei Rong

// Student ID:24048424​

//  Class: C372-002-E63C
//  Date created: 06-02-2026

const db = require("../db");

const LOW_STOCK_THRESHOLD = 5;

function normalizeStockQty(value) {
  if (value === null || value === undefined || value === "") return null;
  const qty = Number(value);
  if (!Number.isFinite(qty)) return null;
  return Math.max(0, Math.floor(qty));
}

function getStockInfo({ category, stockQty, isAvailable }) {
  const trackStock = category === "food" || category === "drink";
  if (!trackStock) {
    const status = isAvailable ? "available" : "unavailable";
    return {
      qty: stockQty,
      status,
      label: isAvailable ? "Available" : "Unavailable",
      isOrderable: isAvailable,
    };
  }
  if (!isAvailable) {
    return {
      qty: stockQty,
      status: "unavailable",
      label: "Unavailable",
      isOrderable: false,
    };
  }
  if (stockQty == null) {
    return {
      qty: null,
      status: "in_stock",
      label: "In stock",
      isOrderable: true,
    };
  }
  if (stockQty <= 0) {
    return {
      qty: 0,
      status: "out_of_stock",
      label: "No stock",
      isOrderable: false,
    };
  }
  if (stockQty <= LOW_STOCK_THRESHOLD) {
    return {
      qty: stockQty,
      status: "low_stock",
      label: "Low in stock",
      isOrderable: true,
    };
  }
  return {
    qty: stockQty,
    status: "in_stock",
    label: "In stock",
    isOrderable: true,
  };
}

function pick(row, keys, fallback = null) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key) && row[key] != null) {
      return row[key];
    }
  }
  return fallback;
}

function toMenuItem(row) {
  const rawCategory = String(pick(row, ["category", "type"], "food")).toLowerCase();
  const category = ["food", "drink", "addon"].includes(rawCategory) ? rawCategory : "food";
  const isAvailable = Boolean(pick(row, ["is_available", "available", "isAvailable"], 1));
  const stockQty = normalizeStockQty(pick(row, ["stock_qty", "stock", "stockQty"], null));
  const stockInfo = getStockInfo({ category, stockQty, isAvailable });
  return {
    id: Number(pick(row, ["item_id", "product_id", "id"], 0)),
    name: pick(row, ["name", "product_name", "title"], ""),
    category,
    description: pick(row, ["description", "product_description"], ""),
    price: Number(pick(row, ["price", "product_price"], 0)),
    image: pick(row, ["image_url", "image", "product_image"], ""),
    isAvailable,
    stockQty: stockInfo.qty,
    stockStatus: stockInfo.status,
    stockLabel: stockInfo.label,
    isOrderable: stockInfo.isOrderable,
  };
}

async function listMenuItems() {
  try {
    const rows = await db.query("SELECT * FROM menu_items ORDER BY item_id ASC");
    return rows.map(toMenuItem);
  } catch (error) {
    if (error && error.code !== "ER_NO_SUCH_TABLE") {
      throw error;
    }
    try {
      const legacyRows = await db.query("SELECT * FROM products");
      return legacyRows
        .map(toMenuItem)
        .sort((a, b) => Number(a.id || 0) - Number(b.id || 0));
    } catch (legacyError) {
      if (legacyError && legacyError.code === "ER_NO_SUCH_TABLE") {
        return [];
      }
      throw legacyError;
    }
  }
}

async function findMenuItemById(id) {
  if (!id) return null;
  try {
    const rows = await db.query("SELECT * FROM menu_items WHERE item_id = ? LIMIT 1", [id]);
    return rows.length ? toMenuItem(rows[0]) : null;
  } catch (error) {
    if (error && error.code !== "ER_NO_SUCH_TABLE") {
      throw error;
    }
    try {
      const legacyRows = await db.query("SELECT * FROM products WHERE id = ? LIMIT 1", [id]);
      return legacyRows.length ? toMenuItem(legacyRows[0]) : null;
    } catch (legacyError) {
      if (legacyError && legacyError.code === "ER_NO_SUCH_TABLE") {
        return null;
      }
      throw legacyError;
    }
  }
}

async function createMenuItem(payload) {
  const { name, category, price, description, image_url, is_available, stock_qty } = payload;
  const normalizedStock = normalizeStockQty(stock_qty);
  const result = await db.query(
    `INSERT INTO menu_items (name, category, price, description, image_url, is_available, stock_qty)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      name,
      category,
      price,
      description || "",
      image_url || "",
      is_available ? 1 : 0,
      normalizedStock,
    ]
  );
  return result.insertId;
}

async function updateMenuItem(id, updates) {
  const fields = [];
  const params = [];
  const allowed = [
    "name",
    "category",
    "price",
    "description",
    "image_url",
    "is_available",
    "stock_qty",
  ];
  allowed.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      const value = key === "stock_qty" ? normalizeStockQty(updates[key]) : updates[key];
      fields.push(`${key} = ?`);
      params.push(value);
    }
  });
  if (!fields.length) return true;
  params.push(id);
  await db.query(`UPDATE menu_items SET ${fields.join(", ")} WHERE item_id = ?`, params);
  return true;
}

async function deleteMenuItem(id) {
  const result = await db.query("DELETE FROM menu_items WHERE item_id = ?", [id]);
  return result.affectedRows > 0;
}

module.exports = {
  listMenuItems,
  findMenuItemById,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
};
