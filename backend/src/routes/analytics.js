const express = require("express");
const router = express.Router();
const { authenticateToken, authorizeRoles } = require("../middleware/auth");
const {
  getTopDrivers,
  getPromoPerformance,
} = require("../controllers/analyticsController");

// All analytics endpoints are admin-only
router.get("/top-drivers", authenticateToken, authorizeRoles("admin"), getTopDrivers);
router.get("/promo-performance", authenticateToken, authorizeRoles("admin"), getPromoPerformance);

module.exports = router;
