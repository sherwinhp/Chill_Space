const Reviews = require("../models/reviewsModel");

const fallbackReviews = [
  { name: "Student Gamer", rating: 5, date: "2024-05-12", text: "Comfortable chairs and solid Wi-Fi.", room: "Room A" },
  { name: "Movie Night Crew", rating: 4, date: "2024-04-28", text: "Projector was great, sound could be louder.", room: "Room B" },
  { name: "Board Games Group", rating: 5, date: "2024-03-14", text: "Plenty of space for our team matches.", room: "Room C" },
];

function normalizeReviews(rows) {
  if (!rows || !rows.length) return fallbackReviews;
  return rows.map((r) => ({
    name: r.user_name || "Anonymous",
    rating: Number(r.rating) || 0,
    date: r.created_at ? new Date(r.created_at).toISOString().split("T")[0] : "",
    text: r.comment || "",
    room: r.room_name || undefined,
  }));
}

module.exports = {

  // API: return reviews as JSON
  getApiReviews: async (req, res) => {
    try {
      const rows = await Reviews.getAll();
      res.json(normalizeReviews(rows));
    } catch (err) {
      console.error(err);
      res.json(normalizeReviews());
    }
  },

  // Show all reviews
  index: async (req, res) => {
    try {
      const rows = await Reviews.getAll();  // 🔥 FIXED

      res.render("reviews/index", {
        reviews: normalizeReviews(rows),
        page: "reviews"
      });
    } catch (err) {
      console.error(err);
      res.status(500).send("Error loading reviews");
    }
  },


  // Render add review form
  addForm: (req, res) => {
  res.render("reviews/add", {
    page: "reviews"   // <-- Add this
  });
},


  // Create review
  create: async (req, res) => {
    try {
      const { roomId, rating, comment } = req.body;
      const userId = req.session.userId; // logged in user

      await Reviews.create(userId, roomId, rating, comment);
      res.redirect("/reviews");
    } catch (err) {
      console.error(err);
      res.status(500).send("Error creating review");
    }
  },

  // Edit form
  editForm: async (req, res) => {
    try {
      const id = req.params.id;
      const [review] = await Reviews.getById(id);

      res.render("reviews/edit", { review: review[0] });
    } catch (err) {
      console.error(err);
      res.status(500).send("Error loading edit page");
    }
  },

  // Update review
  update: async (req, res) => {
    try {
      const id = req.params.id;
      const { rating, comment } = req.body;

      await Reviews.update(id, rating, comment);
      res.redirect("/reviews");
    } catch (err) {
      console.error(err);
      res.status(500).send("Error updating review");
    }
  },

  // Delete review
  delete: async (req, res) => {
    try {
      const id = req.params.id;
      await Reviews.delete(id);
      res.redirect("/reviews");
    } catch (err) {
      console.error(err);
      res.status(500).send("Error deleting review");
    }
  }
};
