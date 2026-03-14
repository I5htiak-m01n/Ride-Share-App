const express = require("express");
const router = express.Router();
const {
  getSupportStaff,
  updateStaffLevel,
} = require("../../controllers/adminController");

// GET /api/admin/staff
router.get("/", getSupportStaff);

// PUT /api/admin/staff/:staffId/level
router.put("/:staffId/level", updateStaffLevel);

module.exports = router;
