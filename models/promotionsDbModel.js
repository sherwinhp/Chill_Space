const db = require("../db");

function toPromotion(row) {
  return {
    id: row.promo_id,
    title: row.title,
    description: row.description || "",
    discountPercent: row.discount_percent,
    code: row.code || "",
    minTotal: Number(row.min_total || 0),
    startDate: row.start_date,
    endDate: row.end_date,
    image: row.image_url || "",
  };
}

async function listPromotions() {
  try {
    const rows = await db.query(
      "SELECT promo_id, title, description, discount_percent, code, min_total, start_date, end_date, image_url FROM promotions ORDER BY start_date DESC"
    );
    return rows.map(toPromotion);
  } catch (error) {
    if (error && error.code === "ER_BAD_FIELD_ERROR") {
      const rows = await db.query(
        "SELECT promo_id, title, description, discount_percent, start_date, end_date, image_url FROM promotions ORDER BY start_date DESC"
      );
      return rows.map((row) =>
        toPromotion({
          ...row,
          code: "",
          min_total: 0,
        })
      );
    }
    throw error;
  }
}

async function createPromotion(payload) {
  const {
    title,
    description,
    code,
    discount_percent,
    min_total,
    start_date,
    end_date,
    image_url,
  } = payload;
  const result = await db.query(
    `INSERT INTO promotions
      (title, description, code, discount_percent, min_total, start_date, end_date, image_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      title,
      description || "",
      code || "",
      discount_percent,
      min_total || 0,
      start_date,
      end_date,
      image_url || "",
    ]
  );
  return result.insertId;
}

async function updatePromotion(id, updates) {
  const fields = [];
  const params = [];
  const allowed = [
    "title",
    "description",
    "code",
    "discount_percent",
    "min_total",
    "start_date",
    "end_date",
    "image_url",
  ];
  allowed.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      fields.push(`${key} = ?`);
      params.push(updates[key]);
    }
  });
  if (!fields.length) return true;
  params.push(id);
  await db.query(`UPDATE promotions SET ${fields.join(", ")} WHERE promo_id = ?`, params);
  return true;
}

async function deletePromotion(id) {
  const result = await db.query("DELETE FROM promotions WHERE promo_id = ?", [id]);
  return result.affectedRows > 0;
}

module.exports = {
  listPromotions,
  createPromotion,
  updatePromotion,
  deletePromotion,
};
