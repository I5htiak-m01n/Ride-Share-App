const { pool } = require("../db");

// POST /api/ratings
// Submit a rating for a completed ride
const submitRating = async (req, res) => {
  const raterId = req.user.id;
  const { ride_id, ratee_user_id, score, comment } = req.body;

  if (!ride_id || !ratee_user_id || !score) {
    return res.status(400).json({ error: "ride_id, ratee_user_id, and score are required" });
  }

  if (!Number.isInteger(score) || score < 1 || score > 5) {
    return res.status(400).json({ error: "Score must be an integer between 1 and 5" });
  }

  if (raterId === ratee_user_id) {
    return res.status(400).json({ error: "You cannot rate yourself" });
  }

  try {
    // Verify the ride exists, is completed, and the rater was part of it
    const rideCheck = await pool.query(
      `SELECT ride_id, rider_id, driver_id, status
       FROM rides
       WHERE ride_id = $1`,
      [ride_id]
    );

    if (rideCheck.rows.length === 0) {
      return res.status(404).json({ error: "Ride not found" });
    }

    const ride = rideCheck.rows[0];

    if (ride.status !== "completed") {
      return res.status(400).json({ error: "Can only rate completed rides" });
    }

    // Ensure the rater was part of this ride
    if (ride.rider_id !== raterId && ride.driver_id !== raterId) {
      return res.status(403).json({ error: "You were not part of this ride" });
    }

    // Ensure the ratee was part of this ride
    if (ride.rider_id !== ratee_user_id && ride.driver_id !== ratee_user_id) {
      return res.status(400).json({ error: "Ratee was not part of this ride" });
    }

    // Insert the rating (UNIQUE constraint prevents duplicates)
    const result = await pool.query(
      `INSERT INTO ratings (ride_id, rater_user_id, ratee_user_id, score, comment)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING rating_id, score, comment, created_at`,
      [ride_id, raterId, ratee_user_id, score, comment || null]
    );

    res.status(201).json({
      message: "Rating submitted successfully",
      rating: result.rows[0],
    });
  } catch (err) {
    // Handle unique constraint violation (already rated)
    if (err.code === "23505") {
      return res.status(409).json({ error: "You have already rated this ride" });
    }
    console.error("submitRating error:", err);
    res.status(500).json({ error: "Failed to submit rating", details: err.message });
  }
};

// GET /api/ratings/:rideId
// Check if the current user has already rated a specific ride
const getRatingForRide = async (req, res) => {
  const raterId = req.user.id;
  const { rideId } = req.params;

  try {
    const result = await pool.query(
      `SELECT rating_id, score, comment, created_at
       FROM ratings
       WHERE ride_id = $1 AND rater_user_id = $2`,
      [rideId, raterId]
    );

    if (result.rows.length === 0) {
      return res.json({ rated: false });
    }

    res.json({ rated: true, rating: result.rows[0] });
  } catch (err) {
    console.error("getRatingForRide error:", err);
    res.status(500).json({ error: "Failed to fetch rating" });
  }
};

// GET /api/ratings/user/me
// Get the current user's average rating
const getMyRating = async (req, res) => {
  const userId = req.user.id;

  try {
    const result = await pool.query(
      `SELECT
         ROUND(AVG(score)::numeric, 2) AS rating_avg,
         COUNT(*)::int AS rating_count
       FROM ratings
       WHERE ratee_user_id = $1`,
      [userId]
    );

    const row = result.rows[0];
    res.json({
      rating_avg: row.rating_count > 0 ? parseFloat(row.rating_avg) : null,
      rating_count: row.rating_count,
    });
  } catch (err) {
    console.error("getMyRating error:", err);
    res.status(500).json({ error: "Failed to fetch user rating" });
  }
};

module.exports = {
  submitRating,
  getRatingForRide,
  getMyRating,
};
