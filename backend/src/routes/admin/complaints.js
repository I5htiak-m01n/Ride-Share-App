const express = require("express");
const router = express.Router();
const {
  getAllComplaints,
  getTicketDetail,
} = require("../../controllers/adminController");

// GET /api/admin/complaints?status=filed
router.get("/", getAllComplaints);

// GET /api/admin/complaints/:ticketId
router.get("/:ticketId", getTicketDetail);

module.exports = router;
