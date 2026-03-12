const express = require("express");
const router = express.Router();
const { authenticateToken, authorizeRoles } = require("../middleware/auth");
const { getDashboardStats } = require("../controllers/adminController");

// Sub-routers
const documentRoutes = require("./admin/documents");
const ticketRoutes = require("./admin/tickets");
const complaintRoutes = require("./admin/complaints");
const userRoutes = require("./admin/users");
const promoRoutes = require("./admin/promos");

// All routes require admin role
router.use(authenticateToken, authorizeRoles("admin"));

// Dashboard overview
router.get("/stats", getDashboardStats);

// Feature routes
router.use("/documents", documentRoutes);
router.use("/tickets", ticketRoutes);
router.use("/complaints", complaintRoutes);
router.use("/users", userRoutes);
router.use("/promos", promoRoutes);

module.exports = router;
