const SSLCommerzPayment = require("sslcommerz-lts");
const { pool } = require("../db");

const store_id = process.env.SSLCOMMERZ_STORE_ID;
const store_passwd = process.env.SSLCOMMERZ_STORE_PASSWORD;
const is_live = process.env.SSLCOMMERZ_IS_LIVE === "true";

const BACKEND_URL = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3001}`;
const FRONTEND_URL = (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");

// POST /api/payment/init — start SSLCommerz session for wallet top-up
const initPayment = async (req, res) => {
  const userId = req.user.id;
  const { amount } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: "Amount must be positive" });
  }

  if (!store_id || !store_passwd || store_id.includes("your_")) {
    return res.status(500).json({
      error: "SSLCommerz credentials not configured. Update SSLCOMMERZ_STORE_ID and SSLCOMMERZ_STORE_PASSWORD in backend/.env"
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Create a pending transaction record
    const txnResult = await client.query(
      `INSERT INTO transactions (wallet_owner_id, amount, currency, status, type)
       VALUES ($1, $2, 'BDT', 'pending', 'wallet_topup')
       RETURNING txn_id`,
      [userId, parseFloat(amount)]
    );
    const txnId = txnResult.rows[0].txn_id;

    // Get user details for SSLCommerz
    const userResult = await client.query(
      `SELECT first_name, last_name, email, phone FROM users WHERE user_id = $1`,
      [userId]
    );
    const user = userResult.rows[0];

    await client.query("COMMIT");

    const data = {
      total_amount: parseFloat(amount),
      currency: "BDT",
      tran_id: txnId,
      success_url: `${BACKEND_URL}/api/payment/success`,
      fail_url: `${BACKEND_URL}/api/payment/fail`,
      cancel_url: `${BACKEND_URL}/api/payment/cancel`,
      ipn_url: `${BACKEND_URL}/api/payment/ipn`,
      shipping_method: "NO",
      product_name: "Wallet Top-Up",
      product_category: "Digital",
      product_profile: "general",
      cus_name: `${user.first_name || ""} ${user.last_name || ""}`.trim() || "User",
      cus_email: user.email || "customer@example.com",
      cus_add1: "Dhaka",
      cus_city: "Dhaka",
      cus_state: "Dhaka",
      cus_postcode: "1000",
      cus_country: "Bangladesh",
      cus_phone: user.phone || "01700000000",
    };

    const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live);
    const apiResponse = await sslcz.init(data);

    if (apiResponse?.GatewayPageURL) {
      // Store the session key for later validation
      await pool.query(
        `UPDATE transactions SET gateway_ref = $1 WHERE txn_id = $2`,
        [apiResponse.sessionkey, txnId]
      );
      res.json({ url: apiResponse.GatewayPageURL, txn_id: txnId });
    } else {
      console.error("SSLCommerz init response:", JSON.stringify(apiResponse));
      // Mark transaction as failed
      await pool.query(
        `UPDATE transactions SET status = 'failed' WHERE txn_id = $1`,
        [txnId]
      );
      const reason = apiResponse?.failedreason || apiResponse?.status || "Unknown error";
      res.status(500).json({ error: `Payment gateway error: ${reason}` });
    }
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("initPayment error:", err);
    res.status(500).json({ error: "Failed to initialize payment" });
  } finally {
    client.release();
  }
};

// POST /api/payment/success — SSLCommerz redirects here on success
const paymentSuccess = async (req, res) => {
  const { tran_id, val_id } = req.body;

  if (!tran_id) {
    return res.redirect(`${FRONTEND_URL}/wallet?status=fail`);
  }

  const client = await pool.connect();
  try {
    // Validate with SSLCommerz
    const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live);
    const validation = await sslcz.validate({ val_id });

    if (validation.status !== "VALID" && validation.status !== "VALIDATED") {
      await pool.query(
        `UPDATE transactions SET status = 'failed' WHERE txn_id = $1`,
        [tran_id]
      );
      return res.redirect(`${FRONTEND_URL}/wallet?status=fail`);
    }

    await client.query("BEGIN");

    // Check if this transaction was already processed
    const txnCheck = await client.query(
      `SELECT status, wallet_owner_id, amount FROM transactions WHERE txn_id = $1 FOR UPDATE`,
      [tran_id]
    );

    if (txnCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.redirect(`${FRONTEND_URL}/wallet?status=fail`);
    }

    const txn = txnCheck.rows[0];
    if (txn.status === "succeeded") {
      // Already processed — just redirect
      await client.query("ROLLBACK");
      return res.redirect(`${FRONTEND_URL}/wallet?status=success`);
    }

    // Update transaction to succeeded
    await client.query(
      `UPDATE transactions SET status = 'succeeded', gateway_ref = $1 WHERE txn_id = $2`,
      [val_id, tran_id]
    );

    // Credit wallet
    await client.query(
      `UPDATE wallets SET balance = balance + $1 WHERE owner_id = $2`,
      [txn.amount, txn.wallet_owner_id]
    );

    await client.query("COMMIT");
    res.redirect(`${FRONTEND_URL}/wallet?status=success`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("paymentSuccess error:", err);
    res.redirect(`${FRONTEND_URL}/wallet?status=fail`);
  } finally {
    client.release();
  }
};

// POST /api/payment/fail
const paymentFail = async (req, res) => {
  const { tran_id } = req.body;
  if (tran_id) {
    await pool.query(
      `UPDATE transactions SET status = 'failed' WHERE txn_id = $1 AND status = 'pending'`,
      [tran_id]
    ).catch((err) => console.error("paymentFail update error:", err));
  }
  res.redirect(`${FRONTEND_URL}/wallet?status=fail`);
};

// POST /api/payment/cancel
const paymentCancel = async (req, res) => {
  const { tran_id } = req.body;
  if (tran_id) {
    await pool.query(
      `UPDATE transactions SET status = 'failed' WHERE txn_id = $1 AND status = 'pending'`,
      [tran_id]
    ).catch((err) => console.error("paymentCancel update error:", err));
  }
  res.redirect(`${FRONTEND_URL}/wallet?status=cancel`);
};

// POST /api/payment/ipn — Instant Payment Notification (server-to-server)
const paymentIPN = async (req, res) => {
  const { tran_id, val_id, status } = req.body;

  if (!tran_id || status !== "VALID") {
    return res.status(200).json({ message: "ignored" });
  }

  const client = await pool.connect();
  try {
    const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live);
    const validation = await sslcz.validate({ val_id });

    if (validation.status !== "VALID" && validation.status !== "VALIDATED") {
      return res.status(200).json({ message: "invalid" });
    }

    await client.query("BEGIN");

    const txnCheck = await client.query(
      `SELECT status, wallet_owner_id, amount FROM transactions WHERE txn_id = $1 FOR UPDATE`,
      [tran_id]
    );

    if (txnCheck.rows.length === 0 || txnCheck.rows[0].status === "succeeded") {
      await client.query("ROLLBACK");
      return res.status(200).json({ message: "already processed" });
    }

    const txn = txnCheck.rows[0];

    await client.query(
      `UPDATE transactions SET status = 'succeeded', gateway_ref = $1 WHERE txn_id = $2`,
      [val_id, tran_id]
    );

    await client.query(
      `UPDATE wallets SET balance = balance + $1 WHERE owner_id = $2`,
      [txn.amount, txn.wallet_owner_id]
    );

    await client.query("COMMIT");
    res.status(200).json({ message: "success" });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("paymentIPN error:", err);
    res.status(200).json({ message: "error" });
  } finally {
    client.release();
  }
};

module.exports = {
  initPayment,
  paymentSuccess,
  paymentFail,
  paymentCancel,
  paymentIPN,
};
