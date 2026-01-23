const db = require("../db");

const Reviews = {
  // Create a new review
  create: (userId, roomId, rating, comment, imageUrl) => {
    return db.query(
      "INSERT INTO reviews (user_id, room_id, rating, comment, image_url) VALUES (?, ?, ?, ?, ?)",
      [userId, roomId, rating, comment, imageUrl || null]
    );
  },

  // Get all reviews
  getAll: () => {
    return db.query(
      `SELECT 
          r.*, 
          u.name AS user_name, 
          rm.name AS room_name
       FROM reviews r
       JOIN users u ON r.user_id = u.user_id
       JOIN rooms rm ON r.room_id = rm.room_id
       ORDER BY r.created_at DESC`
    );
  },

  // Get single review
  getById: (id) => {
    return db.query("SELECT * FROM reviews WHERE review_id = ?", [id]);
  },

  // Update review
  update: (id, rating, comment, imageUrl) => {
    return db.query(
      "UPDATE reviews SET rating = ?, comment = ?, image_url = ? WHERE review_id = ?",
      [rating, comment, imageUrl || null, id]
    );
  },

  // Delete review
  delete: (id) => {
    return db.query("DELETE FROM reviews WHERE review_id = ?", [id]);
  }
};

module.exports = Reviews;
