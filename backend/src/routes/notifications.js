const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../middleware/auth");
const {
  getMyNotifications,
  getUnreadCount,
  markAsRead,
  markAllRead,
} = require("../controllers/notificationController");

router.get("/", authenticateToken, getMyNotifications);
router.get("/unread-count", authenticateToken, getUnreadCount);
router.put("/read-all", authenticateToken, markAllRead);
router.put("/:notifId/read", authenticateToken, markAsRead);

module.exports = router;
