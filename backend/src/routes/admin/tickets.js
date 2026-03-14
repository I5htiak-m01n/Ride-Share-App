const express = require("express");
const router = express.Router();
const {
  getAllTickets,
  getTicketDetail,
  respondToTicket,
  setTicketPriority,
  assignTicketToStaff,
} = require("../../controllers/adminController");

// GET /api/admin/tickets?status=open
router.get("/", getAllTickets);

// GET /api/admin/tickets/:ticketId
router.get("/:ticketId", getTicketDetail);

// POST /api/admin/tickets/:ticketId/respond
router.post("/:ticketId/respond", respondToTicket);

// PUT /api/admin/tickets/:ticketId/priority
router.put("/:ticketId/priority", setTicketPriority);

// PUT /api/admin/tickets/:ticketId/assign
router.put("/:ticketId/assign", assignTicketToStaff);

module.exports = router;
