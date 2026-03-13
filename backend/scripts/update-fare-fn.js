require("dotenv").config();
const { pool } = require("../src/db");
(async () => {
  try {
    await pool.query(`DROP FUNCTION IF EXISTS estimate_fare(numeric)`);
    await pool.query(`
      CREATE OR REPLACE FUNCTION estimate_fare(distance_km numeric, multiplier numeric DEFAULT 1.0)
      RETURNS integer AS $fn$
        SELECT ROUND((50 + distance_km * 15) * multiplier)::integer;
      $fn$ LANGUAGE SQL IMMUTABLE
    `);
    const r = await pool.query('SELECT estimate_fare(10) AS base, estimate_fare(10, 1.5) AS suv');
    console.log('estimate_fare(10):', r.rows[0].base, '| estimate_fare(10, 1.5):', r.rows[0].suv);
    process.exit(0);
  } catch (err) {
    console.error('Failed:', err.message);
    process.exit(1);
  }
})();
