const express = require("express");
const router = express.Router();
const {
  getPromos,
  getPromoStats,
  createPromo,
  updatePromo,
  deletePromo,
} = require("../../controllers/promoController");

// GET /api/admin/promos
router.get("/", getPromos);

// GET /api/admin/promos/stats
router.get("/stats", getPromoStats);

// POST /api/admin/promos
router.post("/", createPromo);

// PUT /api/admin/promos/:promoId
router.put("/:promoId", updatePromo);

// DELETE /api/admin/promos/:promoId
router.delete("/:promoId", deletePromo);

module.exports = router;
