const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../middleware/auth");
const { fileComplaint, getMyComplaints, getComplaintDetail } = require("../controllers/complaintController");

router.post("/", authenticateToken, fileComplaint);
router.get("/mine", authenticateToken, getMyComplaints);
router.get("/:ticketId", authenticateToken, getComplaintDetail);

module.exports = router;
