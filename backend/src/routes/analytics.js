const express = require("express");
const router = express.Router();
const { authenticateToken, authorizeRoles } = require("../middleware/auth");
const {
  getTopDrivers,
  getZoneRevenue,
  getPromoPerformance,
} = require("../controllers/analyticsController");

// All analytics endpoints are admin-only
router.get("/top-drivers", authenticateToken, authorizeRoles("admin"), getTopDrivers);
router.get("/zone-revenue", authenticateToken, authorizeRoles("admin"), getZoneRevenue);
router.get("/promo-performance", authenticateToken, authorizeRoles("admin"), getPromoPerformance);

module.exports = router;
