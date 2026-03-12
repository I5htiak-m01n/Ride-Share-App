const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../middleware/auth");
const { fileComplaint, getMyComplaints } = require("../controllers/complaintController");

router.post("/", authenticateToken, fileComplaint);
router.get("/mine", authenticateToken, getMyComplaints);

module.exports = router;
