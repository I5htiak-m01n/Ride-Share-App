const express = require("express");
const router = express.Router();
const { authenticateToken, authorizeRoles } = require("../middleware/auth");
const {
  getDashboardStats,
  getAllDocuments,
  verifyDocument,
  getAllTickets,
  getTicketDetail,
  respondToTicket,
  getAllComplaints,
  resolveComplaint,
  getAllUsers,
  toggleBanUser,
} = require("../controllers/adminController");

// All routes require admin role
router.use(authenticateToken, authorizeRoles("admin"));

// Dashboard
router.get("/stats", getDashboardStats);

// Documents
router.get("/documents", getAllDocuments);
router.put("/documents/:driverId/:docType", verifyDocument);

// Tickets
router.get("/tickets", getAllTickets);
router.get("/tickets/:ticketId", getTicketDetail);
router.post("/tickets/:ticketId/respond", respondToTicket);

// Complaints
router.get("/complaints", getAllComplaints);
router.put("/complaints/:ticketId", resolveComplaint);

// Users
router.get("/users", getAllUsers);
router.put("/users/:userId/ban", toggleBanUser);

module.exports = router;
