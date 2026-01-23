const db = require("../db");

function toMenuItem(row) {
  return {
    id: row.item_id,
    name: row.name,
    category: row.category,
    description: row.description || "",
    price: Number(row.price),
    image: row.image_url || "",
    isAvailable: Boolean(row.is_available),
  };
}

async function listMenuItems() {
  const rows = await db.query("SELECT * FROM menu_items ORDER BY item_id ASC");
  return rows.map(toMenuItem);
}

async function createMenuItem(payload) {
  const { name, category, price, description, image_url, is_available } = payload;
  const result = await db.query(
    `INSERT INTO menu_items (name, category, price, description, image_url, is_available)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [name, category, price, description || "", image_url || "", is_available ? 1 : 0]
  );
  return result.insertId;
}

async function updateMenuItem(id, updates) {
  const fields = [];
  const params = [];
  const allowed = ["name", "category", "price", "description", "image_url", "is_available"];
  allowed.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      fields.push(`${key} = ?`);
      params.push(updates[key]);
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
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
};
