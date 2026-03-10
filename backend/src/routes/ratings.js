const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../middleware/auth");
const {
  submitRating,
  getRatingForRide,
  getMyRating,
} = require("../controllers/ratingsController");

// Submit a rating for a completed ride
router.post("/", authenticateToken, submitRating);

// Get current user's average rating
router.get("/user/me", authenticateToken, getMyRating);

// Check if user already rated a specific ride
router.get("/:rideId", authenticateToken, getRatingForRide);

module.exports = router;
