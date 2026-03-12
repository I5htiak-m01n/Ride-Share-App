const express = require("express");
const router = express.Router();
const {
  getAllUsers,
  toggleBanUser,
} = require("../../controllers/adminController");

// GET /api/admin/users
router.get("/", getAllUsers);

// PUT /api/admin/users/:userId/ban
router.put("/:userId/ban", toggleBanUser);

module.exports = router;
