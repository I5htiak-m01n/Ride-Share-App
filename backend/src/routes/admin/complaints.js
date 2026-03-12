const express = require("express");
const router = express.Router();
const {
  getAllComplaints,
  resolveComplaint,
} = require("../../controllers/adminController");

// GET /api/admin/complaints?status=filed
router.get("/", getAllComplaints);

// PUT /api/admin/complaints/:ticketId
router.put("/:ticketId", resolveComplaint);

module.exports = router;
