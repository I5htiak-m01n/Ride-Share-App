const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../middleware/auth");
const { getMessages, sendMessage, sendCancelRequest, respondToCancelRequest, retractCancelRequest } = require("../controllers/chatController");

router.get("/:rideId/messages", authenticateToken, getMessages);
router.post("/:rideId/messages", authenticateToken, sendMessage);
router.post("/:rideId/cancel-request", authenticateToken, sendCancelRequest);
router.post("/:rideId/cancel-respond", authenticateToken, respondToCancelRequest);
router.post("/:rideId/cancel-retract", authenticateToken, retractCancelRequest);

module.exports = router;
