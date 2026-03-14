const express = require("express");
const router = express.Router();
const { authenticateToken, authorizeRoles } = require("../middleware/auth");
const {
  getAssignedTickets,
  getTicketDetail,
  respondToTicket,
} = require("../controllers/supportStaffController");

// All routes require support role
router.use(authenticateToken, authorizeRoles("support"));

router.get("/tickets", getAssignedTickets);
router.get("/tickets/:ticketId", getTicketDetail);
router.post("/tickets/:ticketId/respond", respondToTicket);

module.exports = router;
