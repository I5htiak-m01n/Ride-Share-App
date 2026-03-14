const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../middleware/auth");
const { createTicket, getMyTickets, getTicketDetail } = require("../controllers/supportController");

// All routes require authentication (any role)
router.use(authenticateToken);

router.post("/", createTicket);
router.get("/mine", getMyTickets);
router.get("/:ticketId", getTicketDetail);

module.exports = router;
