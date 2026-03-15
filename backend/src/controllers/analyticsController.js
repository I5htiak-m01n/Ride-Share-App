const { pool } = require("../db");

// GET /api/analytics/top-drivers
// Complex Query 1: Top drivers by total earnings, joined across drivers, users,
// rides, and transactions — with aggregation (SUM, COUNT, AVG)
const getTopDrivers = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        d.driver_id,
        u.first_name || ' ' || u.last_name AS driver_name,
        u.email,
        d.rating_avg,
        COUNT(r.ride_id)::int                        AS total_rides,
        COALESCE(SUM(r.driver_earning), 0)::numeric  AS total_earnings,
        COALESCE(ROUND(AVG(r.total_fare), 2), 0)     AS avg_fare
      FROM drivers d
      JOIN users u ON u.user_id = d.driver_id
      LEFT JOIN rides r
        ON r.driver_id = d.driver_id
        AND r.status = 'completed'
        AND r.driver_earning IS NOT NULL
      GROUP BY d.driver_id, u.first_name, u.last_name, u.email, d.rating_avg
      ORDER BY total_earnings DESC
      LIMIT 20
    `);
    res.json({ top_drivers: result.rows });
  } catch (err) {
    console.error("getTopDrivers error:", err);
    res.status(500).json({ error: "Failed to get top drivers analytics" });
  }
};

// GET /api/analytics/promo-performance
// Complex Query 3: Promo code performance, joined across promos,
// promo_redemptions, rides, and transactions — with aggregation (COUNT, SUM, AVG)
const getPromoPerformance = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        p.promo_id,
        p.promo_code AS code,
        p.discount_amount,
        p.total_usage_limit AS max_uses,
        p.usage_per_user,
        p.is_active,
        p.expiry_date,
        COUNT(pr.redemption_id)::int                                              AS times_used,
        COALESCE(COUNT(pr.redemption_id) * p.discount_amount, 0)::numeric        AS total_discount_given,
        COALESCE(p.discount_amount, 0)                                            AS avg_discount_per_use,
        COALESCE(SUM(r.total_fare), 0)::numeric                                   AS total_revenue_from_promo_rides
      FROM promos p
      LEFT JOIN promo_redemptions pr ON pr.promo_id = p.promo_id
      LEFT JOIN rides r
        ON r.ride_id = pr.ride_id
        AND r.status = 'completed'
      GROUP BY p.promo_id, p.promo_code, p.discount_amount, p.total_usage_limit,
               p.usage_per_user, p.is_active, p.expiry_date
      ORDER BY times_used DESC
    `);
    res.json({ promo_performance: result.rows });
  } catch (err) {
    console.error("getPromoPerformance error:", err);
    res.status(500).json({ error: "Failed to get promo performance analytics" });
  }
};

module.exports = {
  getTopDrivers,
  getPromoPerformance,
};
