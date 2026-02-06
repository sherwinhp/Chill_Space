

const db = require("../db");

const Reviews = {
  // Create a new review
  create: (
    userId,
    roomId,
    ratingRoom,
    ratingFood,
    ratingService,
    comment,
    imageUrl,
    category = "room"
  ) => {
    return db.query(
      "INSERT INTO reviews (user_id, room_id, rating, rating_food, rating_service, comment, image_url, category) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [
        userId,
        roomId || null,
        ratingRoom,
        ratingFood,
        ratingService,
        comment,
        imageUrl || null,
        category,
      ]
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
       LEFT JOIN rooms rm ON r.room_id = rm.room_id
       ORDER BY r.created_at DESC`
    );
  },

  getVisible: () => {
    return db.query(
      `SELECT
          r.*,
          u.name AS user_name,
          rm.name AS room_name
       FROM reviews r
       JOIN users u ON r.user_id = u.user_id
       LEFT JOIN rooms rm ON r.room_id = rm.room_id
       WHERE r.is_visible = 1
       ORDER BY r.created_at DESC`
    );
  },

  // Get single review
  getById: (id) => {
    return db.query("SELECT * FROM reviews WHERE review_id = ?", [id]);
  },

  // Update review
  update: (id, ratingRoom, ratingFood, ratingService, comment, imageUrl) => {
    return db.query(
      "UPDATE reviews SET rating = ?, rating_food = ?, rating_service = ?, comment = ?, image_url = ? WHERE review_id = ?",
      [ratingRoom, ratingFood, ratingService, comment, imageUrl || null, id]
    );
  },

  updateAdmin: (
    id,
    ratingRoom,
    ratingFood,
    ratingService,
    comment,
    imageUrl,
    adminReply
  ) => {
    return db.query(
      "UPDATE reviews SET rating = ?, rating_food = ?, rating_service = ?, comment = ?, image_url = ?, admin_reply = ? WHERE review_id = ?",
      [
        ratingRoom,
        ratingFood,
        ratingService,
        comment,
        imageUrl || null,
        adminReply || null,
        id,
      ]
    );
  },

  setVisibility: (id, isVisible) => {
    return db.query("UPDATE reviews SET is_visible = ? WHERE review_id = ?", [
      isVisible ? 1 : 0,
      id,
    ]);
  },

  getRoomStats: (roomId) => {
    return db.query(
      "SELECT AVG(rating) AS avg_rating, COUNT(*) AS review_count FROM reviews WHERE room_id = ? AND is_visible = 1",
      [roomId]
    );
  },

  getByRoomId: (roomId) => {
    return db.query(
      `SELECT
          r.review_id,
          r.rating,
          r.rating_food,
          r.rating_service,
          r.comment,
          r.image_url,
          r.admin_reply,
          r.created_at,
          u.name AS user_name
       FROM reviews r
       JOIN users u ON r.user_id = u.user_id
       WHERE r.room_id = ?
       ORDER BY r.created_at DESC`,
      [roomId]
    );
  },

  getVisibleByRoomId: (roomId) => {
    return db.query(
      `SELECT
          r.review_id,
          r.rating,
          r.rating_food,
          r.rating_service,
          r.comment,
          r.image_url,
          r.admin_reply,
          r.created_at,
          u.name AS user_name
       FROM reviews r
       JOIN users u ON r.user_id = u.user_id
       WHERE r.room_id = ? AND r.is_visible = 1
       ORDER BY r.created_at DESC`,
      [roomId]
    );
  },

  // Delete review
  delete: (id) => {
    return db.query("DELETE FROM reviews WHERE review_id = ?", [id]);
  }
};

module.exports = Reviews;
