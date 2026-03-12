const express = require("express");
const router = express.Router();
const {
  getAllTickets,
  getTicketDetail,
  respondToTicket,
} = require("../../controllers/adminController");

// GET /api/admin/tickets?status=open
router.get("/", getAllTickets);

// GET /api/admin/tickets/:ticketId
router.get("/:ticketId", getTicketDetail);

// POST /api/admin/tickets/:ticketId/respond
router.post("/:ticketId/respond", respondToTicket);

module.exports = router;
