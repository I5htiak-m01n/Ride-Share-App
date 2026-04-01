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
          AND (expiry_date IS NULL OR expiry_date > NOW())) AS active_promos,
        (SELECT COUNT(*) FROM support_staff WHERE is_active = true) AS active_support_staff
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
    const statusFilter = status ? ` WHERE status = $1` : "";
    const params = status ? [status] : [];
    const query = `
      SELECT * FROM (
        SELECT dd.driver_id, dd.doc_type, dd.image_url, dd.expiry_date, dd.status,
               dd.vehicle_name, dd.vehicle_type, dd.plate_number,
               u.first_name, u.last_name, u.email
        FROM driver_documents dd
        JOIN users u ON u.user_id = dd.driver_id

        UNION ALL

        SELECT v.driver_id, vd.doc_type, vd.image_url, vd.expiry_date, vd.status,
               v.model AS vehicle_name, v.type AS vehicle_type, v.plate_number,
               u.first_name, u.last_name, u.email
        FROM vehicle_documents vd
        JOIN vehicles v ON v.vehicle_id = vd.vehicle_id
        JOIN users u ON u.user_id = v.driver_id
      ) AS all_docs${statusFilter}
      ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, driver_id, expiry_date ASC
    `;
    const result = await pool.query(query, params);
    res.json({ documents: result.rows });
  } catch (err) {
    console.error("getAllDocuments error:", err);
    res.status(500).json({ error: "Failed to get documents" });
  }
};

// PUT /api/admin/documents/:driverId/:docType
const verifyDocument = async (req, res) => {
  const client = await pool.connect();
  try {
    const { driverId, docType } = req.params;
    const { status } = req.body;
    if (!["valid", "rejected"].includes(status)) {
      return res.status(400).json({ error: "Status must be 'valid' or 'rejected'" });
    }

    await client.query("BEGIN");

    const isVehicleDoc = ["vehicle_registration", "insurance"].includes(docType);
    let result;

    if (isVehicleDoc) {
      // Update in vehicle_documents (lookup via vehicles table)
      result = await client.query(
        `UPDATE vehicle_documents SET status = $1
         FROM vehicles v
         WHERE vehicle_documents.vehicle_id = v.vehicle_id
           AND v.driver_id = $2
           AND vehicle_documents.doc_type = $3
         RETURNING vehicle_documents.*, v.model AS vehicle_name, v.type AS vehicle_type, v.plate_number`,
        [status, driverId, docType]
      );
    } else {
      // Update in driver_documents
      result = await client.query(
        `UPDATE driver_documents SET status = $1
         WHERE driver_id = $2 AND doc_type = $3
         RETURNING *`,
        [status, driverId, docType]
      );
    }

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Document not found" });
    }

    const doc = result.rows[0];

    await client.query("COMMIT");
    res.json({ message: `Document ${status}`, document: doc });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("verifyDocument error:", err);
    res.status(500).json({ error: "Failed to verify document" });
  } finally {
    client.release();
  }
};

// PUT /api/admin/onboarding/:driverId/approve
const approveOnboarding = async (req, res) => {
  const client = await pool.connect();
  try {
    const { driverId } = req.params;
    await client.query("BEGIN");

    // Approve all pending driver_documents
    await client.query(
      `UPDATE driver_documents SET status = 'valid' WHERE driver_id = $1 AND status = 'pending'`,
      [driverId]
    );

    // Approve pending vehicle(s) and get vehicle_id(s)
    const vResult = await client.query(
      `UPDATE vehicles SET approval_status = 'approved', rejection_reason = NULL
       WHERE driver_id = $1 AND approval_status = 'pending'
       RETURNING vehicle_id`,
      [driverId]
    );

    // Approve vehicle_documents for those vehicles
    for (const v of vResult.rows) {
      await client.query(
        `UPDATE vehicle_documents SET status = 'valid' WHERE vehicle_id = $1 AND status = 'pending'`,
        [v.vehicle_id]
      );
    }

    // Send notification
    await client.query(
      `INSERT INTO notifications (user_id, title, body)
       VALUES ($1, 'Documents Approved', 'Your documents have been approved! You can now go online and start driving.')`,
      [driverId]
    );

    await client.query("COMMIT");
    res.json({ message: "Onboarding approved" });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("approveOnboarding error:", err);
    res.status(500).json({ error: "Failed to approve onboarding" });
  } finally {
    client.release();
  }
};

// PUT /api/admin/onboarding/:driverId/reject
const rejectOnboarding = async (req, res) => {
  const client = await pool.connect();
  try {
    const { driverId } = req.params;
    const { reason } = req.body;

    if (!reason?.trim()) {
      return res.status(400).json({ error: "Rejection reason is required" });
    }

    await client.query("BEGIN");

    // Reject all pending driver_documents
    await client.query(
      `UPDATE driver_documents SET status = 'rejected' WHERE driver_id = $1 AND status = 'pending'`,
      [driverId]
    );

    // Reject pending vehicle(s) with reason
    const vResult = await client.query(
      `UPDATE vehicles SET approval_status = 'rejected', rejection_reason = $2
       WHERE driver_id = $1 AND approval_status = 'pending'
       RETURNING vehicle_id`,
      [driverId, reason.trim()]
    );

    // Reject vehicle_documents for those vehicles
    for (const v of vResult.rows) {
      await client.query(
        `UPDATE vehicle_documents SET status = 'rejected' WHERE vehicle_id = $1 AND status = 'pending'`,
        [v.vehicle_id]
      );
    }

    // Send notification with reason
    await client.query(
      `INSERT INTO notifications (user_id, title, body)
       VALUES ($1, 'Documents Rejected', $2)`,
      [driverId, `Your documents were rejected. Reason: ${reason.trim()}. Please resubmit your documents.`]
    );

    await client.query("COMMIT");
    res.json({ message: "Onboarding rejected" });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("rejectOnboarding error:", err);
    res.status(500).json({ error: "Failed to reject onboarding" });
  } finally {
    client.release();
  }
};

// GET /api/admin/tickets?status=open
const getAllTickets = async (req, res) => {
  try {
    const { status } = req.query;
    let query = `
      SELECT st.ticket_id, st.type, st.description, st.status, st.priority,
             st.created_at, st.closed_at, st.ride_id, st.assigned_staff_id,
             u.first_name, u.last_name, u.email, u.user_id,
             staff_u.first_name AS staff_first_name,
             staff_u.last_name AS staff_last_name,
             ss.level AS staff_level
      FROM support_tickets st
      JOIN users u ON u.user_id = st.created_by_user_id
      LEFT JOIN support_staff ss ON ss.support_staff_id = st.assigned_staff_id
      LEFT JOIN users staff_u ON staff_u.user_id = st.assigned_staff_id
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
      `SELECT st.*, u.first_name, u.last_name, u.email,
              c.category,
              CASE WHEN st.status IN ('resolved','closed') THEN 'resolved' ELSE c.status END AS complaint_status,
              c.details AS complaint_details, c.filed_at,
              r.pickup_addr, r.dropoff_addr, r.started_at, r.completed_at, r.total_fare, r.status AS ride_status
       FROM support_tickets st
       JOIN users u ON u.user_id = st.created_by_user_id
       LEFT JOIN complaints c ON c.ticket_id = st.ticket_id
       LEFT JOIN rides r ON r.ride_id = st.ride_id
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
      SELECT c.ticket_id, c.category, c.details,
             CASE WHEN st.status IN ('resolved','closed') THEN 'resolved' ELSE c.status END AS complaint_status,
             c.filed_at,
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
  const client = await pool.connect();
  try {
    const { userId } = req.params;
    if (userId === req.user.id) {
      return res.status(400).json({ error: "Cannot ban your own account" });
    }

    await client.query("BEGIN");

    const result = await client.query(
      `UPDATE users SET is_banned = NOT is_banned
       WHERE user_id = $1
       RETURNING user_id, first_name, last_name, email, role, is_banned`,
      [userId]
    );

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "User not found" });
    }

    await client.query("COMMIT");
    const user = result.rows[0];
    res.json({
      message: user.is_banned ? "User banned" : "User unbanned",
      user,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("toggleBanUser error:", err);
    res.status(500).json({ error: "Failed to toggle ban status" });
  } finally {
    client.release();
  }
};

// PUT /api/admin/tickets/:ticketId/priority
const setTicketPriority = async (req, res) => {
  const { ticketId } = req.params;
  const { priority } = req.body;
  const p = parseInt(priority);

  if (!p || p < 1 || p > 5) {
    return res.status(400).json({ error: "Priority must be between 1 and 5" });
  }

  try {
    const result = await pool.query(
      `UPDATE support_tickets SET priority = $1 WHERE ticket_id = $2 RETURNING ticket_id, priority`,
      [p, ticketId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Ticket not found" });
    }
    res.json({ message: "Priority updated", ticket: result.rows[0] });
  } catch (err) {
    console.error("setTicketPriority error:", err);
    res.status(500).json({ error: "Failed to set priority" });
  }
};

// PUT /api/admin/tickets/:ticketId/assign
const assignTicketToStaff = async (req, res) => {
  const { ticketId } = req.params;
  const { staff_id } = req.body;

  if (!staff_id) {
    return res.status(400).json({ error: "staff_id is required" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Get ticket priority
    const ticketResult = await client.query(
      `SELECT ticket_id, priority, created_by_user_id FROM support_tickets WHERE ticket_id = $1`,
      [ticketId]
    );
    if (ticketResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Ticket not found" });
    }
    const ticket = ticketResult.rows[0];

    // Get staff level
    const staffResult = await client.query(
      `SELECT ss.support_staff_id, ss.level, u.first_name, u.last_name
       FROM support_staff ss
       JOIN users u ON u.user_id = ss.support_staff_id
       WHERE ss.support_staff_id = $1 AND ss.is_active = true`,
      [staff_id]
    );
    if (staffResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Support staff not found or inactive" });
    }
    const staff = staffResult.rows[0];

    // Enforce level >= priority
    if (staff.level < ticket.priority) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: `Staff level ${staff.level} is below ticket priority ${ticket.priority}. Staff level must be >= priority.`,
      });
    }

    // Assign and set to in_progress
    await client.query(
      `UPDATE support_tickets SET assigned_staff_id = $1, status = 'in_progress' WHERE ticket_id = $2`,
      [staff_id, ticketId]
    );
    // Notify the staff member
    await client.query(
      `INSERT INTO notifications (user_id, title, body)
       VALUES ($1, 'Ticket Assigned', $2)`,
      [staff_id, `A support ticket (priority ${ticket.priority}) has been assigned to you.`]
    );

    await client.query("COMMIT");
    res.json({
      message: "Ticket assigned",
      assigned_to: `${staff.first_name} ${staff.last_name}`,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("assignTicketToStaff error:", err);
    res.status(500).json({ error: "Failed to assign ticket" });
  } finally {
    client.release();
  }
};

// GET /api/admin/staff
const getSupportStaff = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ss.support_staff_id, ss.level, ss.is_active,
              u.first_name, u.last_name, u.email, u.created_at,
              (SELECT COUNT(*) FROM support_tickets st
               WHERE st.assigned_staff_id = ss.support_staff_id
                 AND st.status IN ('open','in_progress'))::int AS active_tickets
       FROM support_staff ss
       JOIN users u ON u.user_id = ss.support_staff_id
       ORDER BY ss.level DESC, u.first_name ASC`
    );
    res.json({ staff: result.rows });
  } catch (err) {
    console.error("getSupportStaff error:", err);
    res.status(500).json({ error: "Failed to get support staff" });
  }
};

// PUT /api/admin/staff/:staffId/level
const updateStaffLevel = async (req, res) => {
  const { staffId } = req.params;
  const { level } = req.body;
  const lvl = parseInt(level);

  if (!lvl || lvl < 1 || lvl > 5) {
    return res.status(400).json({ error: "Level must be between 1 and 5" });
  }

  try {
    const result = await pool.query(
      `UPDATE support_staff SET level = $1
       WHERE support_staff_id = $2
       RETURNING support_staff_id, level`,
      [lvl, staffId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Support staff not found" });
    }
    res.json({ message: "Staff level updated", staff: result.rows[0] });
  } catch (err) {
    console.error("updateStaffLevel error:", err);
    res.status(500).json({ error: "Failed to update staff level" });
  }
};

// GET /api/admin/pricing
const getPricingStandards = async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM pricing_standards LIMIT 1`);
    res.json({ pricing: result.rows[0] || null });
  } catch (err) {
    console.error("getPricingStandards error:", err);
    res.status(500).json({ error: "Failed to get pricing standards" });
  }
};

// PUT /api/admin/pricing
const updatePricingStandards = async (req, res) => {
  const { base_fare, rate_first, first_km, rate_after, platform_fee_pct, surge_factor, surge_range_km, surge_density_threshold, cancellation_pct } = req.body;
  try {
    const existing = await pool.query(`SELECT id FROM pricing_standards LIMIT 1`);
    let result;
    if (existing.rows.length > 0) {
      result = await pool.query(
        `UPDATE pricing_standards SET base_fare=$1, rate_first=$2, first_km=$3, rate_after=$4,
         platform_fee_pct=$5, surge_factor=$6, surge_range_km=$7, surge_density_threshold=$8,
         cancellation_pct=$10
         WHERE id=$9 RETURNING *`,
        [base_fare, rate_first, first_km, rate_after, platform_fee_pct, surge_factor, surge_range_km, surge_density_threshold, existing.rows[0].id, cancellation_pct || 10.0]
      );
    } else {
      result = await pool.query(
        `INSERT INTO pricing_standards (base_fare, rate_first, first_km, rate_after, platform_fee_pct, surge_factor, surge_range_km, surge_density_threshold, cancellation_pct)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [base_fare, rate_first, first_km, rate_after, platform_fee_pct, surge_factor, surge_range_km, surge_density_threshold, cancellation_pct || 10.0]
      );
    }
    res.json({ pricing: result.rows[0] });
  } catch (err) {
    console.error("updatePricingStandards error:", err);
    res.status(500).json({ error: "Failed to update pricing standards" });
  }
};

// GET /api/admin/rides?status=active|completed|cancelled
const getAllRides = async (req, res) => {
  try {
    const { status } = req.query;
    let query = `
      SELECT r.ride_id, r.status, r.pickup_addr, r.dropoff_addr,
             r.total_fare, r.started_at, r.completed_at, r.created_at,
             r.cancelled_at, r.cancel_reason,
             rider.first_name AS rider_first_name, rider.last_name AS rider_last_name,
             rider.email AS rider_email,
             driver.first_name AS driver_first_name, driver.last_name AS driver_last_name,
             driver.email AS driver_email
      FROM rides r
      JOIN users rider ON rider.user_id = r.rider_id
      LEFT JOIN users driver ON driver.user_id = r.driver_id
    `;
    const params = [];
    if (status) {
      // Map filter values to actual DB statuses
      if (status === 'active') {
        query += ` WHERE r.status IN ('started', 'driver_assigned')`;
      } else if (status === 'completed') {
        query += ` WHERE r.status = $1`;
        params.push('completed');
      } else if (status === 'cancelled') {
        query += ` WHERE r.status = $1`;
        params.push('cancelled');
      }
    }
    query += ` ORDER BY r.created_at DESC`;
    const result = await pool.query(query, params);
    res.json({ rides: result.rows });
  } catch (err) {
    console.error("getAllRides error:", err);
    res.status(500).json({ error: "Failed to get rides" });
  }
};

module.exports = {
  getDashboardStats,
  getAllDocuments,
  verifyDocument,
  approveOnboarding,
  rejectOnboarding,
  getAllTickets,
  getTicketDetail,
  respondToTicket,
  getAllComplaints,
  resolveComplaint,
  getAllUsers,
  toggleBanUser,
  setTicketPriority,
  assignTicketToStaff,
  getSupportStaff,
  updateStaffLevel,
  getPricingStandards,
  updatePricingStandards,
  getAllRides,
};
