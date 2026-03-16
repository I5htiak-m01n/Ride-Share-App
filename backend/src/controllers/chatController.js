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
        SELECT m.message_id, m.sender_id, m.content, m.message_type, m.created_at,
               u.first_name || ' ' || u.last_name AS sender_name
        FROM chat_messages m
        JOIN users u ON u.user_id = m.sender_id
        WHERE m.ride_id = $1 AND m.created_at > $2
        ORDER BY m.created_at ASC
      `;
      params = [rideId, since];
    } else {
      query = `
        SELECT m.message_id, m.sender_id, m.content, m.message_type, m.created_at,
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
       RETURNING message_id, sender_id, content, message_type, created_at`,
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

// POST /api/chat/:rideId/cancel-request
// Send a mutual cancellation request via chat
const sendCancelRequest = async (req, res) => {
  const userId = req.user.id;
  const { rideId } = req.params;

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
      return res.status(400).json({ error: "Ride is not in an active state" });
    }

    // Check for existing pending cancel request
    const pendingCheck = await client.query(
      `SELECT m.message_id FROM chat_messages m
       WHERE m.ride_id = $1 AND m.message_type = 'cancel_request'
       AND NOT EXISTS (
         SELECT 1 FROM chat_messages m2
         WHERE m2.ride_id = $1
         AND m2.message_type IN ('cancel_accepted', 'cancel_declined')
         AND m2.created_at > m.created_at
       )`,
      [rideId]
    );

    if (pendingCheck.rows.length > 0) {
      return res.status(409).json({ error: "A cancellation request is already pending" });
    }

    await client.query("BEGIN");

    const result = await client.query(
      `INSERT INTO chat_messages (ride_id, sender_id, content, message_type)
       VALUES ($1, $2, 'Requested mutual cancellation', 'cancel_request')
       RETURNING message_id, sender_id, content, message_type, created_at`,
      [rideId, userId]
    );

    await client.query("COMMIT");

    const message = result.rows[0];
    message.sender_name = req.user.name;

    res.status(201).json({ message });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("sendCancelRequest error:", err);
    res.status(500).json({ error: "Failed to send cancellation request" });
  } finally {
    client.release();
  }
};

// POST /api/chat/:rideId/cancel-respond
// Accept or decline a mutual cancellation request
const respondToCancelRequest = async (req, res) => {
  const userId = req.user.id;
  const { rideId } = req.params;
  const { accept } = req.body;

  if (typeof accept !== "boolean") {
    return res.status(400).json({ error: "accept must be a boolean" });
  }

  const client = await pool.connect();
  try {
    // Verify ride participation
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
      return res.status(400).json({ error: "Ride is not in an active state" });
    }

    // Find the latest pending cancel_request
    const cancelReqResult = await client.query(
      `SELECT m.message_id, m.sender_id FROM chat_messages m
       WHERE m.ride_id = $1 AND m.message_type = 'cancel_request'
       AND NOT EXISTS (
         SELECT 1 FROM chat_messages m2
         WHERE m2.ride_id = $1
         AND m2.message_type IN ('cancel_accepted', 'cancel_declined')
         AND m2.created_at > m.created_at
       )
       ORDER BY m.created_at DESC LIMIT 1`,
      [rideId]
    );

    if (cancelReqResult.rows.length === 0) {
      return res.status(400).json({ error: "No pending cancellation request found" });
    }

    const cancelReq = cancelReqResult.rows[0];

    // Responder must NOT be the one who sent the request
    if (cancelReq.sender_id === userId) {
      return res.status(403).json({ error: "You cannot respond to your own cancellation request" });
    }

    await client.query("BEGIN");

    if (accept) {
      // Insert cancel_accepted message
      const msgResult = await client.query(
        `INSERT INTO chat_messages (ride_id, sender_id, content, message_type)
         VALUES ($1, $2, 'Accepted mutual cancellation', 'cancel_accepted')
         RETURNING message_id, sender_id, content, message_type, created_at`,
        [rideId, userId]
      );

      // Insert ride_cancellations — no fee for mutual
      await client.query(
        `INSERT INTO ride_cancellations (ride_id, cancelled_by_user_id, reason, cancellation_fee, cancellation_type)
         VALUES ($1, $2, 'Mutual cancellation', 0, 'mutual')`,
        [rideId, cancelReq.sender_id]
      );

      // Update ride status — trigger handles driver→online
      await client.query(
        `UPDATE rides SET status = 'cancelled' WHERE ride_id = $1`,
        [rideId]
      );

      // Notifications
      await client.query(
        `INSERT INTO notifications (user_id, title, body) VALUES ($1, $2, $3)`,
        [ride.rider_id, "Ride Cancelled", "The ride was cancelled by mutual agreement. No fee was charged."]
      );
      await client.query(
        `INSERT INTO notifications (user_id, title, body) VALUES ($1, $2, $3)`,
        [ride.driver_id, "Ride Cancelled", "The ride was cancelled by mutual agreement. No fee was charged."]
      );

      await client.query("COMMIT");

      const message = msgResult.rows[0];
      message.sender_name = req.user.name;

      res.status(201).json({ message, cancelled: true });
    } else {
      // Insert cancel_declined message
      const msgResult = await client.query(
        `INSERT INTO chat_messages (ride_id, sender_id, content, message_type)
         VALUES ($1, $2, 'Declined cancellation request', 'cancel_declined')
         RETURNING message_id, sender_id, content, message_type, created_at`,
        [rideId, userId]
      );

      await client.query("COMMIT");

      const message = msgResult.rows[0];
      message.sender_name = req.user.name;

      res.status(201).json({ message, cancelled: false });
    }
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("respondToCancelRequest error:", err);
    res.status(500).json({ error: "Failed to respond to cancellation request" });
  } finally {
    client.release();
  }
};

// POST /api/chat/:rideId/cancel-retract
// Retract (undo) your own pending cancellation request
const retractCancelRequest = async (req, res) => {
  const userId = req.user.id;
  const { rideId } = req.params;

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
      return res.status(400).json({ error: "Ride is not in an active state" });
    }

    // Find the latest pending cancel_request
    const cancelReqResult = await client.query(
      `SELECT m.message_id, m.sender_id FROM chat_messages m
       WHERE m.ride_id = $1 AND m.message_type = 'cancel_request'
       AND NOT EXISTS (
         SELECT 1 FROM chat_messages m2
         WHERE m2.ride_id = $1
         AND m2.message_type IN ('cancel_accepted', 'cancel_declined')
         AND m2.created_at > m.created_at
       )
       ORDER BY m.created_at DESC LIMIT 1`,
      [rideId]
    );

    if (cancelReqResult.rows.length === 0) {
      return res.status(400).json({ error: "No pending cancellation request found" });
    }

    const cancelReq = cancelReqResult.rows[0];

    // Only the original requester can retract
    if (cancelReq.sender_id !== userId) {
      return res.status(403).json({ error: "You can only retract your own cancellation request" });
    }

    await client.query("BEGIN");

    const msgResult = await client.query(
      `INSERT INTO chat_messages (ride_id, sender_id, content, message_type)
       VALUES ($1, $2, 'Retracted cancellation request', 'cancel_declined')
       RETURNING message_id, sender_id, content, message_type, created_at`,
      [rideId, userId]
    );

    await client.query("COMMIT");

    const message = msgResult.rows[0];
    message.sender_name = req.user.name;

    res.status(201).json({ message });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("retractCancelRequest error:", err);
    res.status(500).json({ error: "Failed to retract cancellation request" });
  } finally {
    client.release();
  }
};

module.exports = { getMessages, sendMessage, sendCancelRequest, respondToCancelRequest, retractCancelRequest };
