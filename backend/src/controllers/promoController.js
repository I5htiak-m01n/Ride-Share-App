const { pool } = require("../db");

// GET /api/admin/promos — list all promos with redemption counts
const getPromos = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*,
        (SELECT COUNT(*) FROM promo_redemptions pr WHERE pr.promo_id = p.promo_id) AS total_redemptions
      FROM promos p
      ORDER BY p.created_at DESC
    `);
    res.json({ promos: result.rows });
  } catch (err) {
    console.error("getPromos error:", err);
    res.status(500).json({ error: "Failed to get promos" });
  }
};

// GET /api/admin/promos/stats — counts for dashboard overview
const getPromoStats = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM promos WHERE is_active = true
          AND (expiry_date IS NULL OR expiry_date > NOW())) AS active_promos,
        (SELECT COUNT(*) FROM promos) AS total_promos,
        (SELECT COUNT(*) FROM promo_redemptions) AS total_redemptions
    `);
    res.json({ stats: result.rows[0] });
  } catch (err) {
    console.error("getPromoStats error:", err);
    res.status(500).json({ error: "Failed to get promo stats" });
  }
};

// POST /api/admin/promos — create a new promo
const createPromo = async (req, res) => {
  try {
    const { promo_code, discount_amount, usage_per_user, total_usage_limit, expiry_date } = req.body;

    if (!promo_code || !promo_code.trim()) {
      return res.status(400).json({ error: "Promo code is required" });
    }
    if (!discount_amount || parseFloat(discount_amount) <= 0) {
      return res.status(400).json({ error: "Discount amount must be greater than 0" });
    }

    const result = await pool.query(
      `INSERT INTO promos (promo_code, discount_amount, usage_per_user, total_usage_limit, expiry_date, is_active)
       VALUES (UPPER(TRIM($1)), $2, $3, $4, $5, true)
       RETURNING *`,
      [
        promo_code,
        parseFloat(discount_amount),
        parseInt(usage_per_user) || 1,
        total_usage_limit ? parseInt(total_usage_limit) : null,
        expiry_date || null,
      ]
    );

    res.status(201).json({ message: "Promo created", promo: result.rows[0] });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "A promo with this code already exists" });
    }
    console.error("createPromo error:", err);
    res.status(500).json({ error: "Failed to create promo" });
  }
};

// PUT /api/admin/promos/:promoId — update an existing promo
const updatePromo = async (req, res) => {
  try {
    const { promoId } = req.params;
    const { promo_code, discount_amount, usage_per_user, total_usage_limit, expiry_date, is_active } = req.body;

    const result = await pool.query(
      `UPDATE promos SET
        promo_code = COALESCE(UPPER(TRIM($1)), promo_code),
        discount_amount = COALESCE($2, discount_amount),
        usage_per_user = COALESCE($3, usage_per_user),
        total_usage_limit = $4,
        expiry_date = $5,
        is_active = COALESCE($6, is_active)
       WHERE promo_id = $7
       RETURNING *`,
      [
        promo_code || null,
        discount_amount ? parseFloat(discount_amount) : null,
        usage_per_user ? parseInt(usage_per_user) : null,
        total_usage_limit != null && total_usage_limit !== '' ? parseInt(total_usage_limit) : null,
        expiry_date || null,
        is_active != null ? is_active : null,
        promoId,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Promo not found" });
    }

    res.json({ message: "Promo updated", promo: result.rows[0] });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "A promo with this code already exists" });
    }
    console.error("updatePromo error:", err);
    res.status(500).json({ error: "Failed to update promo" });
  }
};

// DELETE /api/admin/promos/:promoId — soft-delete (deactivate) a promo
const deletePromo = async (req, res) => {
  try {
    const { promoId } = req.params;

    const result = await pool.query(
      `UPDATE promos SET is_active = false WHERE promo_id = $1 RETURNING *`,
      [promoId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Promo not found" });
    }

    res.json({ message: "Promo deactivated", promo: result.rows[0] });
  } catch (err) {
    console.error("deletePromo error:", err);
    res.status(500).json({ error: "Failed to delete promo" });
  }
};

// GET /api/rider/promos/available — promos available for a rider
const getAvailablePromos = async (req, res) => {
  const riderId = req.user.id;
  try {
    const result = await pool.query(`
      SELECT
        p.promo_id, p.promo_code, p.discount_amount,
        p.usage_per_user, p.total_usage_limit, p.expiry_date,
        COALESCE(user_usage.cnt, 0)::int AS user_redemptions,
        (p.usage_per_user - COALESCE(user_usage.cnt, 0))::int AS remaining_uses
      FROM promos p
      LEFT JOIN (
        SELECT promo_id, COUNT(*) AS cnt
        FROM promo_redemptions
        WHERE rider_id = $1
        GROUP BY promo_id
      ) user_usage ON user_usage.promo_id = p.promo_id
      LEFT JOIN (
        SELECT promo_id, COUNT(*) AS cnt
        FROM promo_redemptions
        GROUP BY promo_id
      ) total_usage ON total_usage.promo_id = p.promo_id
      WHERE p.is_active = true
        AND (p.expiry_date IS NULL OR p.expiry_date > NOW())
        AND (p.total_usage_limit IS NULL OR COALESCE(total_usage.cnt, 0) < p.total_usage_limit)
        AND COALESCE(user_usage.cnt, 0) < p.usage_per_user
      ORDER BY p.discount_amount DESC
    `, [riderId]);

    res.json({ promos: result.rows });
  } catch (err) {
    console.error("getAvailablePromos error:", err);
    res.status(500).json({ error: "Failed to get available promos" });
  }
};

module.exports = {
  getPromos,
  getPromoStats,
  createPromo,
  updatePromo,
  deletePromo,
  getAvailablePromos,
};
