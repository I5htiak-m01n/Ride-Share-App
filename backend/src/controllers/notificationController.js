const { pool } = require("../db");

// GET /api/notifications
const getMyNotifications = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [req.user.id]
    );
    res.json({ notifications: result.rows });
  } catch (err) {
    console.error("getMyNotifications error:", err);
    res.status(500).json({ error: "Failed to get notifications" });
  }
};

// GET /api/notifications/unread-count
const getUnreadCount = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM notifications
       WHERE user_id = $1 AND is_read = false`,
      [req.user.id]
    );
    res.json({ count: result.rows[0].count });
  } catch (err) {
    console.error("getUnreadCount error:", err);
    res.status(500).json({ error: "Failed to get unread count" });
  }
};

// PUT /api/notifications/:notifId/read
const markAsRead = async (req, res) => {
  const client = await pool.connect();
  try {
    const { notifId } = req.params;

    await client.query("BEGIN");

    const result = await client.query(
      `UPDATE notifications SET is_read = true
       WHERE notif_id = $1 AND user_id = $2
       RETURNING *`,
      [notifId, req.user.id]
    );

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Notification not found" });
    }

    await client.query("COMMIT");
    res.json({ message: "Notification marked as read", notification: result.rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("markAsRead error:", err);
    res.status(500).json({ error: "Failed to mark notification as read" });
  } finally {
    client.release();
  }
};

// PUT /api/notifications/read-all
const markAllRead = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `UPDATE notifications SET is_read = true
       WHERE user_id = $1 AND is_read = false`,
      [req.user.id]
    );

    await client.query("COMMIT");
    res.json({ message: "All notifications marked as read" });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("markAllRead error:", err);
    res.status(500).json({ error: "Failed to mark all as read" });
  } finally {
    client.release();
  }
};

module.exports = {
  getMyNotifications,
  getUnreadCount,
  markAsRead,
  markAllRead,
};
