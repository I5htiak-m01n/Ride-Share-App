const { pool } = require("../db");

// GET /api/wallet/balance
const getBalance = async (req, res) => {
  const userId = req.user.id;
  try {
    const result = await pool.query(
      "SELECT balance, currency FROM wallets WHERE owner_id = $1",
      [userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Wallet not found" });
    }
    res.json({ wallet: result.rows[0] });
  } catch (err) {
    console.error("getBalance error:", err);
    res.status(500).json({ error: "Failed to get wallet balance" });
  }
};

// GET /api/wallet/transactions
const getTransactions = async (req, res) => {
  const userId = req.user.id;
  const { limit = 20, offset = 0 } = req.query;
  try {
    const result = await pool.query(
      `SELECT txn_id, amount, currency, status, type, ts, invoice_id
       FROM transactions
       WHERE wallet_owner_id = $1
       ORDER BY ts DESC
       LIMIT $2 OFFSET $3`,
      [userId, parseInt(limit), parseInt(offset)]
    );
    res.json({ transactions: result.rows });
  } catch (err) {
    console.error("getTransactions error:", err);
    res.status(500).json({ error: "Failed to get transactions" });
  }
};

// POST /api/wallet/topup
const topUp = async (req, res) => {
  const userId = req.user.id;
  const { amount } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: "Amount must be positive" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Update wallet balance
    const walletResult = await client.query(
      `UPDATE wallets SET balance = balance + $1
       WHERE owner_id = $2
       RETURNING balance, currency`,
      [parseFloat(amount), userId]
    );

    if (walletResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Wallet not found" });
    }

    // Record transaction
    await client.query(
      `INSERT INTO transactions (wallet_owner_id, amount, currency, status, type)
       VALUES ($1, $2, 'BDT', 'succeeded', 'wallet_topup')`,
      [userId, parseFloat(amount)]
    );

    await client.query("COMMIT");

    res.json({
      message: "Top up successful",
      wallet: walletResult.rows[0],
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("topUp error:", err);
    res.status(500).json({ error: "Failed to top up wallet" });
  } finally {
    client.release();
  }
};

// POST /api/wallet/validate-promo
const validatePromo = async (req, res) => {
  const userId = req.user.id;
  const { promo_code, estimated_fare } = req.body;

  if (!promo_code) {
    return res.status(400).json({ error: "promo_code is required" });
  }

  try {
    const result = await pool.query(
      `SELECT * FROM apply_promo_discount($1, $2, $3)`,
      [parseFloat(estimated_fare || 0), promo_code, userId]
    );
    const promo = result.rows[0];
    res.json({
      valid: promo.promo_valid,
      discount_amount: parseFloat(promo.discount_applied),
      discounted_fare: parseFloat(promo.discounted_fare),
    });
  } catch (err) {
    console.error("validatePromo error:", err);
    res.status(500).json({ error: "Failed to validate promo code" });
  }
};

// GET /api/wallet/earnings-summary (driver)
const getEarningsSummary = async (req, res) => {
  const driverId = req.user.id;
  try {
    const result = await pool.query(
      `SELECT ride_date, ride_count, total_fares, total_earnings,
              total_platform_fees, avg_fare, cumulative_earnings
       FROM v_driver_earnings_summary
       WHERE driver_id = $1
       ORDER BY ride_date DESC
       LIMIT 30`,
      [driverId]
    );

    // All-time totals using complex aggregation query
    const totals = await pool.query(
      `SELECT COUNT(*) AS total_rides,
              COALESCE(SUM(driver_earning), 0) AS total_earned,
              COALESCE(ROUND(AVG(total_fare), 2), 0) AS avg_fare
       FROM rides
       WHERE driver_id = $1 AND status = 'completed' AND total_fare IS NOT NULL`,
      [driverId]
    );

    res.json({
      daily: result.rows,
      totals: totals.rows[0],
    });
  } catch (err) {
    console.error("getEarningsSummary error:", err);
    res.status(500).json({ error: "Failed to get earnings summary" });
  }
};

module.exports = {
  getBalance,
  getTransactions,
  topUp,
  validatePromo,
  getEarningsSummary,
};
