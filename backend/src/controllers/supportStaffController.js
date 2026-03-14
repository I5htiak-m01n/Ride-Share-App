const { pool } = require("../db");

// GET /api/support-staff/tickets — tickets assigned to this staff member
const getAssignedTickets = async (req, res) => {
  const staffId = req.user.id;

  try {
    const result = await pool.query(
      `SELECT st.ticket_id, st.type, st.description, st.status, st.priority,
              st.created_at, st.closed_at, st.ride_id,
              u.first_name, u.last_name, u.email,
              (SELECT COUNT(*) FROM ticket_responses tr WHERE tr.ticket_id = st.ticket_id)::int AS response_count
       FROM support_tickets st
       JOIN users u ON u.user_id = st.created_by_user_id
       WHERE st.assigned_staff_id = $1
       ORDER BY
         CASE st.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
         st.priority DESC,
         st.created_at ASC`,
      [staffId]
    );

    res.json({ tickets: result.rows });
  } catch (err) {
    console.error("getAssignedTickets error:", err);
    res.status(500).json({ error: "Failed to get assigned tickets" });
  }
};

// GET /api/support-staff/tickets/:ticketId — ticket detail with responses
const getTicketDetail = async (req, res) => {
  const staffId = req.user.id;
  const { ticketId } = req.params;

  try {
    const ticketResult = await pool.query(
      `SELECT st.ticket_id, st.type, st.description, st.status, st.priority,
              st.created_at, st.closed_at, st.ride_id,
              u.first_name, u.last_name, u.email,
              r.pickup_addr, r.dropoff_addr, r.started_at, r.completed_at,
              r.total_fare, r.status AS ride_status,
              d.user_id AS driver_id, d.first_name AS driver_first_name,
              d.last_name AS driver_last_name, d.email AS driver_email, d.phone_number AS driver_phone
       FROM support_tickets st
       JOIN users u ON u.user_id = st.created_by_user_id
       LEFT JOIN rides r ON r.ride_id = st.ride_id
       LEFT JOIN users d ON d.user_id = r.driver_id
       WHERE st.ticket_id = $1 AND st.assigned_staff_id = $2`,
      [ticketId, staffId]
    );

    if (ticketResult.rows.length === 0) {
      return res.status(404).json({ error: "Ticket not found or not assigned to you" });
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
      ticket: ticketResult.rows[0],
      responses: responsesResult.rows,
    });
  } catch (err) {
    console.error("getTicketDetail (staff) error:", err);
    res.status(500).json({ error: "Failed to get ticket detail" });
  }
};

// POST /api/support-staff/tickets/:ticketId/respond
const respondToTicket = async (req, res) => {
  const staffId = req.user.id;
  const { ticketId } = req.params;
  const { message, status } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({ error: "Message is required" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Verify ticket is assigned to this staff
    const check = await client.query(
      `SELECT ticket_id, created_by_user_id FROM support_tickets
       WHERE ticket_id = $1 AND assigned_staff_id = $2`,
      [ticketId, staffId]
    );
    if (check.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Ticket not found or not assigned to you" });
    }

    // Insert response
    await client.query(
      `INSERT INTO ticket_responses (ticket_id, responder_id, message)
       VALUES ($1, $2, $3)`,
      [ticketId, staffId, message.trim()]
    );

    // Optionally update status
    const allowedStatuses = ["in_progress", "resolved", "closed"];
    if (status && allowedStatuses.includes(status)) {
      if (status === "resolved" || status === "closed") {
        await client.query(
          `UPDATE support_tickets SET status = $1, closed_at = NOW() WHERE ticket_id = $2`,
          [status, ticketId]
        );
      } else {
        await client.query(
          `UPDATE support_tickets SET status = $1 WHERE ticket_id = $2`,
          [status, ticketId]
        );
      }
    }

    // Notify the ticket creator
    await client.query(
      `INSERT INTO notifications (user_id, title, body)
       VALUES ($1, 'Support Ticket Update', 'Your support ticket has received a new response.')`,
      [check.rows[0].created_by_user_id]
    );

    await client.query("COMMIT");
    res.json({ message: "Response added successfully" });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("respondToTicket (staff) error:", err);
    res.status(500).json({ error: "Failed to respond to ticket" });
  } finally {
    client.release();
  }
};

module.exports = { getAssignedTickets, getTicketDetail, respondToTicket };
