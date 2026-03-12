const { pool } = require("../db");

// GET /api/chat/:rideId/messages?since=ISO_TIMESTAMP
const getMessages = async (req, res) => {
  const userId = req.user.id;
  const { rideId } = req.params;
  const { since } = req.query;

  try {
    // Verify the user is a participant in this ride
    const rideCheck = await pool.query(
      `SELECT rider_id, driver_id FROM rides WHERE ride_id = $1`,
      [rideId]
    );

    if (rideCheck.rows.length === 0) {
      return res.status(404).json({ error: "Ride not found" });
    }

    const ride = rideCheck.rows[0];
    if (ride.rider_id !== userId && ride.driver_id !== userId) {
      return res.status(403).json({ error: "You are not a participant in this ride" });
    }

    let query, params;
    if (since) {
      query = `
        SELECT m.message_id, m.sender_id, m.content, m.created_at,
               u.first_name || ' ' || u.last_name AS sender_name
        FROM chat_messages m
        JOIN users u ON u.user_id = m.sender_id
        WHERE m.ride_id = $1 AND m.created_at > $2
        ORDER BY m.created_at ASC
      `;
      params = [rideId, since];
    } else {
      query = `
        SELECT m.message_id, m.sender_id, m.content, m.created_at,
               u.first_name || ' ' || u.last_name AS sender_name
        FROM chat_messages m
        JOIN users u ON u.user_id = m.sender_id
        WHERE m.ride_id = $1
        ORDER BY m.created_at ASC
      `;
      params = [rideId];
    }

    const result = await pool.query(query, params);
    res.json({ messages: result.rows });
  } catch (err) {
    console.error("getMessages error:", err);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
};

// POST /api/chat/:rideId/messages
const sendMessage = async (req, res) => {
  const userId = req.user.id;
  const { rideId } = req.params;
  const { content } = req.body;

  if (!content || !content.trim()) {
    return res.status(400).json({ error: "Message content is required" });
  }

  if (content.length > 500) {
    return res.status(400).json({ error: "Message must be 500 characters or less" });
  }

  const client = await pool.connect();
  try {
    // Verify ride participation and status
    const rideCheck = await client.query(
      `SELECT rider_id, driver_id, status FROM rides WHERE ride_id = $1`,
      [rideId]
    );

    if (rideCheck.rows.length === 0) {
      return res.status(404).json({ error: "Ride not found" });
    }

    const ride = rideCheck.rows[0];
    if (ride.rider_id !== userId && ride.driver_id !== userId) {
      return res.status(403).json({ error: "You are not a participant in this ride" });
    }

    if (!["driver_assigned", "started"].includes(ride.status)) {
      return res.status(400).json({ error: "Chat is only available during an active ride" });
    }

    await client.query("BEGIN");

    const result = await client.query(
      `INSERT INTO chat_messages (ride_id, sender_id, content)
       VALUES ($1, $2, $3)
       RETURNING message_id, sender_id, content, created_at`,
      [rideId, userId, content.trim()]
    );

    await client.query("COMMIT");

    const message = result.rows[0];
    message.sender_name = req.user.name;

    res.status(201).json({ message });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("sendMessage error:", err);
    res.status(500).json({ error: "Failed to send message" });
  } finally {
    client.release();
  }
};

module.exports = { getMessages, sendMessage };
