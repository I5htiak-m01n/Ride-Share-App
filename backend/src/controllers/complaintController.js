const { pool } = require("../db");

// POST /api/complaints
const fileComplaint = async (req, res) => {
  const client = await pool.connect();
  try {
    const { ride_id, category, details } = req.body;
    const userId = req.user.id;

    if (!ride_id || !category || !details || !details.trim()) {
      return res.status(400).json({ error: "ride_id, category, and details are required" });
    }

    // Verify ride exists and user is a participant
    const rideCheck = await client.query(
      `SELECT rider_id, driver_id FROM rides WHERE ride_id = $1`,
      [ride_id]
    );

    if (rideCheck.rows.length === 0) {
      return res.status(404).json({ error: "Ride not found" });
    }

    const ride = rideCheck.rows[0];
    if (ride.rider_id !== userId && ride.driver_id !== userId) {
      return res.status(403).json({ error: "You are not a participant in this ride" });
    }

    await client.query("BEGIN");

    // Create support ticket
    const ticketResult = await client.query(
      `INSERT INTO support_tickets (created_by_user_id, ride_id, type, description, status, priority)
       VALUES ($1, $2, 'complaint', $3, 'open', 1)
       RETURNING ticket_id, created_at`,
      [userId, ride_id, details.trim()]
    );

    const ticketId = ticketResult.rows[0].ticket_id;

    // Create complaint linked to support ticket
    await client.query(
      `INSERT INTO complaints (ticket_id, category, details, status)
       VALUES ($1, $2, $3, 'filed')`,
      [ticketId, category, details.trim()]
    );

    await client.query("COMMIT");

    res.status(201).json({
      message: "Complaint filed successfully",
      ticket_id: ticketId,
      created_at: ticketResult.rows[0].created_at,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("fileComplaint error:", err);
    res.status(500).json({ error: "Failed to file complaint" });
  } finally {
    client.release();
  }
};

// GET /api/complaints/mine
const getMyComplaints = async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      `SELECT c.ticket_id, c.category, c.details, c.status AS complaint_status, c.filed_at,
              st.status AS ticket_status, st.ride_id,
              r.pickup_addr, r.dropoff_addr
       FROM complaints c
       JOIN support_tickets st ON st.ticket_id = c.ticket_id
       LEFT JOIN rides r ON r.ride_id = st.ride_id
       WHERE st.created_by_user_id = $1
       ORDER BY c.filed_at DESC`,
      [userId]
    );
    res.json({ complaints: result.rows });
  } catch (err) {
    console.error("getMyComplaints error:", err);
    res.status(500).json({ error: "Failed to get complaints" });
  }
};

// GET /api/complaints/:ticketId — get complaint detail with staff responses
const getComplaintDetail = async (req, res) => {
  const userId = req.user.id;
  const { ticketId } = req.params;

  try {
    const complaintResult = await pool.query(
      `SELECT c.ticket_id, c.category, c.details, c.status AS complaint_status, c.filed_at,
              st.status AS ticket_status, st.ride_id,
              r.pickup_addr, r.dropoff_addr, r.started_at, r.completed_at
       FROM complaints c
       JOIN support_tickets st ON st.ticket_id = c.ticket_id
       LEFT JOIN rides r ON r.ride_id = st.ride_id
       WHERE c.ticket_id = $1 AND st.created_by_user_id = $2`,
      [ticketId, userId]
    );

    if (complaintResult.rows.length === 0) {
      return res.status(404).json({ error: "Complaint not found" });
    }

    const responsesResult = await pool.query(
      `SELECT tr.response_id, tr.message, tr.created_at,
              u.first_name, u.last_name, u.role
       FROM ticket_responses tr
       JOIN users u ON u.user_id = tr.responder_id
       WHERE tr.ticket_id = $1
       ORDER BY tr.created_at ASC`,
      [ticketId]
    );

    res.json({
      complaint: complaintResult.rows[0],
      responses: responsesResult.rows,
    });
  } catch (err) {
    console.error("getComplaintDetail error:", err);
    res.status(500).json({ error: "Failed to get complaint detail" });
  }
};

module.exports = { fileComplaint, getMyComplaints, getComplaintDetail };
