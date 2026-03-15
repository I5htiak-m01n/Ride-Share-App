const { pool } = require("../db");

// POST /api/support — create a general support ticket
const createTicket = async (req, res) => {
  const userId = req.user.id;
  const { subject, description, ride_id } = req.body;

  if (!subject || !subject.trim()) {
    return res.status(400).json({ error: "Subject is required" });
  }
  if (!description || !description.trim()) {
    return res.status(400).json({ error: "Description is required" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO support_tickets
        (created_by_user_id, ride_id, type, description, status, priority)
       VALUES ($1, $2, 'support', $3, 'open', 1)
       RETURNING ticket_id, type, description, status, priority, created_at`,
      [userId, ride_id || null, `[${subject.trim()}] ${description.trim()}`]
    );

    res.status(201).json({ ticket: result.rows[0] });
  } catch (err) {
    console.error("createTicket error:", err);
    res.status(500).json({ error: "Failed to create support ticket" });
  }
};

// GET /api/support/mine — list current user's support tickets
const getMyTickets = async (req, res) => {
  const userId = req.user.id;

  try {
    const result = await pool.query(
      `SELECT st.ticket_id, st.type, st.description, st.status, st.priority,
              st.created_at, st.closed_at, st.ride_id,
              (SELECT COUNT(*) FROM ticket_responses tr WHERE tr.ticket_id = st.ticket_id)::int AS response_count,
              (SELECT tr.message FROM ticket_responses tr
               WHERE tr.ticket_id = st.ticket_id
               ORDER BY tr.created_at DESC LIMIT 1) AS latest_response
       FROM support_tickets st
       WHERE st.created_by_user_id = $1 AND st.type != 'complaint'
       ORDER BY st.created_at DESC`,
      [userId]
    );

    res.json({ tickets: result.rows });
  } catch (err) {
    console.error("getMyTickets error:", err);
    res.status(500).json({ error: "Failed to get tickets" });
  }
};

// GET /api/support/:ticketId — get ticket detail with responses (user must own ticket)
const getTicketDetail = async (req, res) => {
  const userId = req.user.id;
  const { ticketId } = req.params;

  try {
    const ticketResult = await pool.query(
      `SELECT st.ticket_id, st.type, st.description, st.status, st.priority,
              st.created_at, st.closed_at, st.ride_id
       FROM support_tickets st
       WHERE st.ticket_id = $1 AND st.created_by_user_id = $2`,
      [ticketId, userId]
    );

    if (ticketResult.rows.length === 0) {
      return res.status(404).json({ error: "Ticket not found" });
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
    console.error("getTicketDetail error:", err);
    res.status(500).json({ error: "Failed to get ticket detail" });
  }
};

module.exports = { createTicket, getMyTickets, getTicketDetail };
