const express = require("express");
const router = express.Router();
const { pool } = require("../db");
const { authenticateToken, authorizeRoles } = require("../middleware/auth");

// Get all users (admin only)
router.get("/", authenticateToken, authorizeRoles("admin"), async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT user_id, name, email, role, phone_number, avatar_url, created_at FROM users ORDER BY created_at DESC"
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Get users error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get user by ID (authenticated users can view)
router.get("/:userId", authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;

    // Users can only view their own profile unless admin
    if (req.user.id !== userId && req.user.dbRole !== "admin") {
      return res.status(403).json({
        error: "You can only view your own profile"
      });
    }

    const result = await pool.query(
      `SELECT user_id, name, email, role, phone_number,
              avatar_url, created_at
       FROM users
       WHERE user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update user profile (own profile only)
router.put("/:userId", authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const { name, phone_number, avatar_url } = req.body;

    // Users can only update their own profile
    if (req.user.id !== userId) {
      return res.status(403).json({
        error: "You can only update your own profile"
      });
    }

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (name) {
      updates.push(`name = $${paramCount++}`);
      values.push(name);
    }
    if (phone_number) {
      updates.push(`phone_number = $${paramCount++}`);
      values.push(phone_number);
    }
    if (avatar_url) {
      updates.push(`avatar_url = $${paramCount++}`);
      values.push(avatar_url);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        error: "No valid fields to update"
      });
    }

    values.push(userId);

    const result = await pool.query(
      `UPDATE users
       SET ${updates.join(", ")}
       WHERE user_id = $${paramCount}
       RETURNING user_id, name, email, phone_number, avatar_url, created_at`,
      values
    );

    res.json({
      message: "Profile updated successfully",
      user: result.rows[0]
    });
  } catch (error) {
    console.error("Update user error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete user (admin only)
router.delete("/:userId", authenticateToken, authorizeRoles("admin"), async (req, res) => {
  try {
    const { userId } = req.params;

    await pool.query("DELETE FROM users WHERE user_id = $1", [userId]);

    res.json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
