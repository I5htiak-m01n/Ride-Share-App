const bcrypt = require("bcrypt");
const { pool } = require("../db");

const BCRYPT_SALT_ROUNDS = 10;

// Get all users (admin only)
const getAllUsers = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT user_id, first_name, last_name, email, role, phone_number, avatar_url, created_at FROM users ORDER BY created_at DESC"
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Get users error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get user by ID (authenticated users can view)
const getUser = async (req, res) => {
  try {
    const { userId } = req.params;

    // Users can only view their own profile unless admin
    if (req.user.id !== userId && req.user.dbRole !== "admin") {
      return res.status(403).json({
        error: "You can only view your own profile"
      });
    }

    const result = await pool.query(
      `SELECT user_id, first_name, last_name, email, role, phone_number,
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
};

// Update user profile (own profile only)
const updateUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { first_name, last_name, phone_number, avatar_url } = req.body;

    // Users can only update their own profile
    if (req.user.id !== userId) {
      return res.status(403).json({
        error: "You can only update your own profile"
      });
    }

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (first_name) {
      updates.push(`first_name = $${paramCount++}`);
      values.push(first_name);
    }
    if (last_name) {
      updates.push(`last_name = $${paramCount++}`);
      values.push(last_name);
    }
    if (phone_number) {
      updates.push(`phone_number = $${paramCount++}`);
      values.push(phone_number);
    }
    if (avatar_url !== undefined) {
      updates.push(`avatar_url = $${paramCount++}`);
      values.push(avatar_url || null);
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
       RETURNING user_id, first_name, last_name, email, phone_number, avatar_url, created_at`,
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
};

// Upload avatar
const uploadAvatar = async (req, res) => {
  try {
    const { userId } = req.params;
    if (req.user.id !== userId) {
      return res.status(403).json({ error: "You can only update your own avatar" });
    }
    if (!req.file) {
      return res.status(400).json({ error: "No image file provided" });
    }
    const avatarUrl = `/uploads/documents/${req.file.filename}`;
    const result = await pool.query(
      `UPDATE users SET avatar_url = $1 WHERE user_id = $2
       RETURNING user_id, first_name, last_name, email, phone_number, avatar_url, created_at`,
      [avatarUrl, userId]
    );
    res.json({ message: "Avatar updated", user: result.rows[0] });
  } catch (error) {
    console.error("Avatar upload error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Change password (own account only)
const changePassword = async (req, res) => {
  const { userId } = req.params;
  const { current_password, new_password } = req.body;

  if (req.user.id !== userId) {
    return res.status(403).json({ error: "You can only change your own password" });
  }
  if (!current_password || !new_password) {
    return res.status(400).json({ error: "Current and new password are required" });
  }
  if (new_password.length < 6) {
    return res.status(400).json({ error: "New password must be at least 6 characters" });
  }

  try {
    const result = await pool.query(
      "SELECT password_hash FROM users WHERE user_id = $1",
      [userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const valid = await bcrypt.compare(current_password, result.rows[0].password_hash);
    if (!valid) {
      return res.status(400).json({ error: "Current password is incorrect" });
    }

    const newHash = await bcrypt.hash(new_password, BCRYPT_SALT_ROUNDS);
    await pool.query("UPDATE users SET password_hash = $1 WHERE user_id = $2", [newHash, userId]);

    res.json({ message: "Password changed successfully" });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Delete user (admin only)
const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;

    await pool.query("DELETE FROM users WHERE user_id = $1", [userId]);

    res.json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = {
  getAllUsers,
  getUser,
  updateUser,
  uploadAvatar,
  changePassword,
  deleteUser,
};
