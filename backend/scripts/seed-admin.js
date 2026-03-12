require("dotenv").config();
const bcrypt = require("bcrypt");
const { pool } = require("../src/db");

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@rideshare.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123456";
const ADMIN_FIRST_NAME = "System";
const ADMIN_LAST_NAME = "Admin";
const ADMIN_PHONE = "+8801700000000";

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

    const userResult = await client.query(
      `INSERT INTO users (email, first_name, last_name, password_hash, phone_number, role)
       VALUES ($1, $2, $3, $4, $5, 'admin')
       ON CONFLICT (email) DO NOTHING
       RETURNING user_id`,
      [ADMIN_EMAIL, ADMIN_FIRST_NAME, ADMIN_LAST_NAME, passwordHash, ADMIN_PHONE]
    );

    if (userResult.rows.length > 0) {
      const adminId = userResult.rows[0].user_id;

      await client.query(
        `INSERT INTO admins (admin_id, role) VALUES ($1, 'super_admin')
         ON CONFLICT DO NOTHING`,
        [adminId]
      );

      await client.query(
        `INSERT INTO wallets (owner_id, balance, currency)
         VALUES ($1, 0, 'BDT') ON CONFLICT DO NOTHING`,
        [adminId]
      );

      console.log("Admin user created:", ADMIN_EMAIL);
    } else {
      console.log("Admin user already exists:", ADMIN_EMAIL);
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Failed to seed admin:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
