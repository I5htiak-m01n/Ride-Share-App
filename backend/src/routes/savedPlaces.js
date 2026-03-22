const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../middleware/auth");
const {
  getSavedPlaces,
  createSavedPlace,
  updateSavedPlace,
  deleteSavedPlace,
} = require("../controllers/savedPlacesController");

router.get("/", authenticateToken, getSavedPlaces);
router.post("/", authenticateToken, createSavedPlace);
router.put("/:placeId", authenticateToken, updateSavedPlace);
router.delete("/:placeId", authenticateToken, deleteSavedPlace);

module.exports = router;
