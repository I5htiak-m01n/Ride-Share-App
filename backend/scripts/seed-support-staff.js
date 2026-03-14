const bcrypt = require("bcrypt");
const { pool } = require("../src/db");
require("dotenv").config();

const STAFF = [
  { first: 'Sarah',   last: 'Ahmed',   email: 'support1@rideshare.com', phone: '01700000001', level: 1 },
  { first: 'Karim',   last: 'Hassan',  email: 'support2@rideshare.com', phone: '01700000002', level: 2 },
  { first: 'Fatima',  last: 'Khan',    email: 'support3@rideshare.com', phone: '01700000003', level: 3 },
  { first: 'Tanvir',  last: 'Rahman',  email: 'support4@rideshare.com', phone: '01700000004', level: 4 },
  { first: 'Nadia',   last: 'Islam',   email: 'support5@rideshare.com', phone: '01700000005', level: 5 },
];

const PASSWORD = 'Support123!';

async function seed() {
  const client = await pool.connect();
  try {
    const hash = await bcrypt.hash(PASSWORD, 10);

    for (const s of STAFF) {
      await client.query('BEGIN');

      // Check if email already exists
      const existing = await client.query('SELECT user_id FROM users WHERE email = $1', [s.email]);
      if (existing.rows.length > 0) {
        console.log(`  Skipped ${s.email} (already exists)`);
        await client.query('ROLLBACK');
        continue;
      }

      // Create user
      const userRes = await client.query(
        `INSERT INTO users (first_name, last_name, email, password_hash, phone_number, role)
         VALUES ($1, $2, $3, $4, $5, 'support')
         RETURNING user_id`,
        [s.first, s.last, s.email, hash, s.phone]
      );
      const userId = userRes.rows[0].user_id;

      // Create support_staff entry
      await client.query(
        `INSERT INTO support_staff (support_staff_id, level, is_active)
         VALUES ($1, $2, true)`,
        [userId, s.level]
      );

      // Create wallet
      await client.query(
        `INSERT INTO wallets (owner_id, balance, currency) VALUES ($1, 0, 'BDT')`,
        [userId]
      );

      await client.query('COMMIT');
      console.log(`  Created Level ${s.level} staff: ${s.first} ${s.last} (${s.email})`);
    }

    console.log('\nAll support staff seeded.');
    console.log(`Password for all: ${PASSWORD}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
