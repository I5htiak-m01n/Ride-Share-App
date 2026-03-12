const express = require("express");
const router = express.Router();
const {
  getAllDocuments,
  verifyDocument,
} = require("../../controllers/adminController");

// GET /api/admin/documents?status=pending
router.get("/", getAllDocuments);

// PUT /api/admin/documents/:driverId/:docType
router.put("/:driverId/:docType", verifyDocument);

module.exports = router;
