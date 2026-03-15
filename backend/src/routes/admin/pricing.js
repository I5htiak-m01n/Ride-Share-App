const express = require("express");
const router = express.Router();
const { getPricingStandards, updatePricingStandards } = require("../../controllers/adminController");

// GET /api/admin/pricing
router.get("/", getPricingStandards);

// PUT /api/admin/pricing
router.put("/", updatePricingStandards);

module.exports = router;
