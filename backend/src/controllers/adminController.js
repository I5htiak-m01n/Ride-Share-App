const { pool } = require("../db");

// GET /api/admin/stats
const getDashboardStats = async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM users) AS total_users,
        (SELECT COUNT(*) FROM users WHERE role = 'driver') AS total_drivers,
        (SELECT COUNT(*) FROM users WHERE role = 'rider') AS total_riders,
        (SELECT COUNT(*) FROM rides) AS total_rides,
        (SELECT COUNT(*) FROM rides WHERE status = 'started') AS active_rides,
        (SELECT COUNT(*) FROM support_tickets WHERE status IN ('open','in_progress')) AS open_tickets,
        (SELECT COUNT(*) FROM driver_documents WHERE status = 'pending') AS pending_documents,
        (SELECT COUNT(*) FROM complaints WHERE status IN ('filed','under_review')) AS open_complaints,
        (SELECT COUNT(*) FROM users WHERE is_banned = true) AS banned_users,
        (SELECT COUNT(*) FROM promos WHERE is_active = true
          AND (expiry_date IS NULL OR expiry_date > NOW())) AS active_promos
    `);
    res.json({ stats: stats.rows[0] });
  } catch (err) {
    console.error("getDashboardStats error:", err);
    res.status(500).json({ error: "Failed to get dashboard stats" });
  }
};

// GET /api/admin/documents?status=pending
const getAllDocuments = async (req, res) => {
  try {
    const { status } = req.query;
    let query = `
      SELECT dd.driver_id, dd.doc_type, dd.image_url, dd.expiry_date, dd.status,
             u.first_name, u.last_name, u.email
      FROM driver_documents dd
      JOIN users u ON u.user_id = dd.driver_id
    `;
    const params = [];
    if (status) {
      query += ` WHERE dd.status = $1`;
      params.push(status);
    }
    query += ` ORDER BY CASE dd.status WHEN 'pending' THEN 0 ELSE 1 END, dd.expiry_date ASC`;
    const result = await pool.query(query, params);
    res.json({ documents: result.rows });
  } catch (err) {
    console.error("getAllDocuments error:", err);
    res.status(500).json({ error: "Failed to get documents" });
  }
};

// PUT /api/admin/documents/:driverId/:docType
const verifyDocument = async (req, res) => {
  try {
    const { driverId, docType } = req.params;
    const { status } = req.body;
    if (!["valid", "rejected"].includes(status)) {
      return res.status(400).json({ error: "Status must be 'valid' or 'rejected'" });
    }
    const result = await pool.query(
      `UPDATE driver_documents SET status = $1
       WHERE driver_id = $2 AND doc_type = $3
       RETURNING *`,
      [status, driverId, docType]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Document not found" });
    }
    res.json({ message: `Document ${status}`, document: result.rows[0] });
  } catch (err) {
    console.error("verifyDocument error:", err);
    res.status(500).json({ error: "Failed to verify document" });
  }
};

// GET /api/admin/tickets?status=open
const getAllTickets = async (req, res) => {
  try {
    const { status } = req.query;
    let query = `
      SELECT st.ticket_id, st.type, st.description, st.status, st.priority,
             st.created_at, st.closed_at, st.ride_id,
             u.first_name, u.last_name, u.email, u.user_id
      FROM support_tickets st
      JOIN users u ON u.user_id = st.created_by_user_id
    `;
    const params = [];
    if (status) {
      query += ` WHERE st.status = $1`;
      params.push(status);
    }
    query += ` ORDER BY st.created_at DESC`;
    const result = await pool.query(query, params);
    res.json({ tickets: result.rows });
  } catch (err) {
    console.error("getAllTickets error:", err);
    res.status(500).json({ error: "Failed to get tickets" });
  }
};

// GET /api/admin/tickets/:ticketId
const getTicketDetail = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const ticketResult = await pool.query(
      `SELECT st.*, u.first_name, u.last_name, u.email
       FROM support_tickets st
       JOIN users u ON u.user_id = st.created_by_user_id
       WHERE st.ticket_id = $1`,
      [ticketId]
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

// POST /api/admin/tickets/:ticketId/respond
const respondToTicket = async (req, res) => {
  const client = await pool.connect();
  try {
    const { ticketId } = req.params;
    const { message, status } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: "Message is required" });
    }

    await client.query("BEGIN");

    await client.query(
      `INSERT INTO ticket_responses (ticket_id, responder_id, message)
       VALUES ($1, $2, $3)`,
      [ticketId, req.user.id, message.trim()]
    );

    if (status && ["open", "in_progress", "resolved", "closed"].includes(status)) {
      if (status === "closed" || status === "resolved") {
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

    await client.query("COMMIT");
    res.json({ message: "Response added successfully" });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("respondToTicket error:", err);
    res.status(500).json({ error: "Failed to respond to ticket" });
  } finally {
    client.release();
  }
};

// GET /api/admin/complaints?status=filed
const getAllComplaints = async (req, res) => {
  try {
    const { status } = req.query;
    let query = `
      SELECT c.ticket_id, c.category, c.details, c.status AS complaint_status, c.filed_at,
             st.type, st.description AS ticket_description, st.status AS ticket_status,
             st.priority, st.ride_id,
             u.first_name, u.last_name, u.email, u.user_id
      FROM complaints c
      JOIN support_tickets st ON st.ticket_id = c.ticket_id
      JOIN users u ON u.user_id = st.created_by_user_id
    `;
    const params = [];
    if (status) {
      query += ` WHERE c.status = $1`;
      params.push(status);
    }
    query += ` ORDER BY c.filed_at DESC`;
    const result = await pool.query(query, params);
    res.json({ complaints: result.rows });
  } catch (err) {
    console.error("getAllComplaints error:", err);
    res.status(500).json({ error: "Failed to get complaints" });
  }
};

// PUT /api/admin/complaints/:ticketId
const resolveComplaint = async (req, res) => {
  const { ticketId } = req.params;
  const { status } = req.body;
  if (!["resolved", "rejected", "under_review"].includes(status)) {
    return res.status(400).json({ error: "Status must be 'resolved', 'rejected', or 'under_review'" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const result = await client.query(
      `UPDATE complaints SET status = $1 WHERE ticket_id = $2 RETURNING *`,
      [status, ticketId]
    );
    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Complaint not found" });
    }

    // Notify the user who filed the complaint on terminal statuses
    if (status === "resolved" || status === "rejected") {
      const ticketResult = await client.query(
        `SELECT created_by_user_id FROM support_tickets WHERE ticket_id = $1`,
        [ticketId]
      );
      if (ticketResult.rows.length > 0) {
        const body = status === "resolved"
          ? "Your complaint has been resolved. Thank you for your feedback."
          : "Your complaint has been reviewed and closed. Contact support if you have questions.";
        await client.query(
          `INSERT INTO notifications (user_id, title, body) VALUES ($1, $2, $3)`,
          [ticketResult.rows[0].created_by_user_id, "Complaint Update", body]
        );
      }
    }

    await client.query("COMMIT");
    res.json({ message: `Complaint ${status}`, complaint: result.rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("resolveComplaint error:", err);
    res.status(500).json({ error: "Failed to resolve complaint" });
  } finally {
    client.release();
  }
};

// GET /api/admin/users
const getAllUsers = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT user_id, first_name, last_name, email, role, phone_number,
              is_banned, created_at
       FROM users
       ORDER BY created_at DESC`
    );
    res.json({ users: result.rows });
  } catch (err) {
    console.error("getAllUsers error:", err);
    res.status(500).json({ error: "Failed to get users" });
  }
};

// PUT /api/admin/users/:userId/ban
const toggleBanUser = async (req, res) => {
  try {
    const { userId } = req.params;
    if (userId === req.user.id) {
      return res.status(400).json({ error: "Cannot ban your own account" });
    }
    const result = await pool.query(
      `UPDATE users SET is_banned = NOT is_banned
       WHERE user_id = $1
       RETURNING user_id, first_name, last_name, email, role, is_banned`,
      [userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    const user = result.rows[0];
    res.json({
      message: user.is_banned ? "User banned" : "User unbanned",
      user,
    });
  } catch (err) {
    console.error("toggleBanUser error:", err);
    res.status(500).json({ error: "Failed to toggle ban status" });
  }
};

module.exports = {
  getDashboardStats,
  getAllDocuments,
  verifyDocument,
  getAllTickets,
  getTicketDetail,
  respondToTicket,
  getAllComplaints,
  resolveComplaint,
  getAllUsers,
  toggleBanUser,
};
