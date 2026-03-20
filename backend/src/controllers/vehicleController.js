const { pool } = require("../db");

// GET /api/drivers/vehicles
const getMyVehicles = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT v.vehicle_id, v.plate_number, v.model, v.type, v.is_active,
              v.approval_status, v.rejection_reason,
              vt.label AS type_label, vt.fare_multiplier
       FROM vehicles v
       LEFT JOIN vehicle_types vt ON v.type = vt.type_key
       WHERE v.driver_id = $1
       ORDER BY v.is_active DESC, v.model ASC`,
      [req.user.id]
    );
    res.json({ vehicles: result.rows });
  } catch (err) {
    console.error("getMyVehicles error:", err);
    res.status(500).json({ error: "Failed to get vehicles" });
  }
};

// PUT /api/drivers/vehicles/:vehicleId/activate
const setActiveVehicle = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const check = await client.query(
      `SELECT vehicle_id, approval_status FROM vehicles WHERE vehicle_id = $1 AND driver_id = $2`,
      [req.params.vehicleId, req.user.id]
    );
    if (check.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Vehicle not found" });
    }
    if (check.rows[0].approval_status !== "approved") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Only approved vehicles can be activated" });
    }

    // Deactivate all, then activate the chosen one
    await client.query(
      `UPDATE vehicles SET is_active = false WHERE driver_id = $1`,
      [req.user.id]
    );
    const result = await client.query(
      `UPDATE vehicles SET is_active = true
       WHERE vehicle_id = $1 AND driver_id = $2
       RETURNING *`,
      [req.params.vehicleId, req.user.id]
    );

    await client.query("COMMIT");
    res.json({ message: "Vehicle activated", vehicle: result.rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("setActiveVehicle error:", err);
    res.status(500).json({ error: "Failed to activate vehicle" });
  } finally {
    client.release();
  }
};

// PUT /api/drivers/vehicles/:vehicleId/deactivate
const deactivateVehicle = async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE vehicles SET is_active = false
       WHERE vehicle_id = $1 AND driver_id = $2
       RETURNING *`,
      [req.params.vehicleId, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Vehicle not found" });
    }
    res.json({ message: "Vehicle deactivated", vehicle: result.rows[0] });
  } catch (err) {
    console.error("deactivateVehicle error:", err);
    res.status(500).json({ error: "Failed to deactivate vehicle" });
  }
};

module.exports = { getMyVehicles, setActiveVehicle, deactivateVehicle };
