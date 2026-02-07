/*
I declare that this code was written by me.
I will not copy or allow others to copy my code.
I understand that copying code is considered as plagiarism.

Student Name: Angelo Miguel Beltran Casia, Aaron Ryan Tan Wei Rong, Chow Sherwin, Aniq Syazwan Bin Muliadi, Choo Tian En Javier, Christine Joy Teh Shi Hui

Student ID: 24048278, 24045221, 24049188, 24048876, 24046565, 24048424

Class: C372-002-E63C
Date created: 06-02-2026
*/
const Reviews = require("../models/reviewsModel");

const fallbackReviews = [
  {
    name: "Student Gamer",
    rating: 5,
    ratingFood: 5,
    ratingService: 5,
    date: "2024-05-12",
    text: "Comfortable chairs and solid Wi-Fi.",
    room: "Room A",
    category: "room",
  },
  {
    name: "Movie Night Crew",
    rating: 4,
    ratingFood: 4,
    ratingService: 4,
    date: "2024-04-28",
    text: "Projector was great, sound could be louder.",
    room: "Room B",
    category: "room",
  },
  {
    name: "Board Games Group",
    rating: 5,
    ratingFood: 5,
    ratingService: 5,
    date: "2024-03-14",
    text: "Plenty of space for our team matches.",
    room: "Room C",
    category: "room",
  },
];

function normalizeReviews(rows, { allowFallback = false } = {}) {
  if (!rows || !rows.length) return allowFallback ? fallbackReviews : [];
  return rows.map((r) => ({
    id: r.review_id,
    userId: r.user_id,
    name: r.user_name || "Anonymous",
    rating: Number(r.rating) || 0,
    ratingFood: Number(r.rating_food) || Number(r.rating) || 0,
    ratingService: Number(r.rating_service) || Number(r.rating) || 0,
    date: r.created_at ? new Date(r.created_at).toISOString().split("T")[0] : "",
    text: r.comment || "",
    adminReply: r.admin_reply || "",
    room: r.room_name || undefined,
    imageUrl: r.image_url || "",
    category: r.category || "room",
  }));
}

async function getOwnedReview(req, res, id) {
  if (!req.session || !req.session.userId) {
    res.redirect("/login");
    return null;
  }

  const rows = await Reviews.getById(id);
  const review = rows && rows[0];

  if (!review) {
    res.status(404).send("Review not found");
    return null;
  }

  if (Number(review.user_id) !== Number(req.session.userId)) {
    res.status(403).send("You can only manage your own reviews.");
    return null;
  }

  return review;
}

module.exports = {

  // API: return reviews as JSON
  getApiReviews: async (req, res) => {
    try {
      const rows = await Reviews.getVisible();
      res.json(normalizeReviews(rows, { allowFallback: true }));
    } catch (err) {
      console.error(err);
      res.json(normalizeReviews([], { allowFallback: true }));
    }
  },

  // Show all reviews
  index: async (req, res) => {
    try {
      const rows = req.session && req.session.userId
        ? await Reviews.getVisibleOrOwned(req.session.userId)
        : await Reviews.getVisible();  // FIXED

      res.render("reviews/index", {
        reviews: normalizeReviews(rows, { allowFallback: false }),
        page: "reviews"
      });
    } catch (err) {
      console.error(err);
      res.status(500).send("Error loading reviews");
    }
  },


  // Render add review form
  addForm: async (req, res) => {
    if (!req.session || !req.session.userId) {
      return res.redirect("/login");
    }
    const { listRooms } = require("../models/roomsModel");
    const rooms = await listRooms();
    res.render("reviews/add", {
      page: "reviews",
      rooms,
    });
  },


  // Create review
  create: async (req, res) => {
    try {
      if (!req.session || !req.session.userId) {
        return res.status(401).json({ error: "Login required." });
      }

      const { roomId, ratingRoom, ratingFood, ratingService, comment } = req.body;
      const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
      const userId = req.session.userId; // logged in user

      if (!roomId) {
        return res.status(400).send("Room is required for reviews.");
      }

      await Reviews.create(
        userId,
        Number(roomId),
        Number(ratingRoom),
        Number(ratingFood),
        Number(ratingService),
        comment,
        imageUrl,
        "room"
      );
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
      const review = await getOwnedReview(req, res, id);

      if (!review) return;
      res.render("reviews/edit", { review });
    } catch (err) {
      console.error(err);
      res.status(500).send("Error loading edit page");
    }
  },

  // Update review
  update: async (req, res) => {
    try {
      const id = req.params.id;
      const review = await getOwnedReview(req, res, id);
      if (!review) return;
      const {
        rating,
        ratingRoom,
        ratingFood,
        ratingService,
        comment,
        currentImageUrl,
      } = req.body;
      const imageUrl = req.file ? `/uploads/${req.file.filename}` : currentImageUrl || null;

      const roomScore = Number(ratingRoom || rating);
      const foodScore = Number(ratingFood || rating);
      const serviceScore = Number(ratingService || rating);

      await Reviews.update(
        id,
        roomScore,
        foodScore,
        serviceScore,
        comment,
        imageUrl
      );
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
      const review = await getOwnedReview(req, res, id);
      if (!review) return;
      await Reviews.delete(id);
      res.redirect("/reviews");
    } catch (err) {
      console.error(err);
      res.status(500).send("Error deleting review");
    }
  }
};


