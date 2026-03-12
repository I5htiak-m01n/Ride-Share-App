const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../middleware/auth");
const { getMessages, sendMessage } = require("../controllers/chatController");

router.get("/:rideId/messages", authenticateToken, getMessages);
router.post("/:rideId/messages", authenticateToken, sendMessage);

module.exports = router;
