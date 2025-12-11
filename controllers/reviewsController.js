const Reviews = require("../models/reviewsModel");

module.exports = {
  // Show all reviews
  index: async (req, res) => {
    try {
      const rows = await Reviews.getAll();  // 🔥 FIXED

      res.render("reviews/index", {
        reviews: rows,
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
