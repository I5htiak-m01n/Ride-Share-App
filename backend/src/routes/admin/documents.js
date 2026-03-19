const express = require("express");
const router = express.Router();
const {
  getAllDocuments,
  verifyDocument,
  approveOnboarding,
  rejectOnboarding,
} = require("../../controllers/adminController");

// GET /api/admin/documents?status=pending
router.get("/", getAllDocuments);

// PUT /api/admin/documents/onboarding/:driverId/approve (must be before /:driverId/:docType)
router.put("/onboarding/:driverId/approve", approveOnboarding);

// PUT /api/admin/documents/onboarding/:driverId/reject
router.put("/onboarding/:driverId/reject", rejectOnboarding);

// PUT /api/admin/documents/:driverId/:docType
router.put("/:driverId/:docType", verifyDocument);

module.exports = router;
