const express = require("express");
const router = express.Router();
const { register, login, getProfile, logout } = require("../controllers/authController");
const { authenticateToken } = require("../middleware/auth");

// Public routes
router.post("/register", register);
router.post("/login", login);

// Protected routes
router.get("/profile", authenticateToken, getProfile);
router.post("/logout", authenticateToken, logout);

module.exports = router;
