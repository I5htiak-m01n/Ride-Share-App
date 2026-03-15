require("dotenv").config();
const { pool } = require("../src/db");
(async () => {
  try {
    await pool.query(`DROP FUNCTION IF EXISTS estimate_fare(numeric)`);
    await pool.query(`DROP FUNCTION IF EXISTS estimate_fare(numeric, numeric)`);
    await pool.query(`
      CREATE OR REPLACE FUNCTION estimate_fare(distance_km numeric)
      RETURNS integer AS $fn$
      DECLARE
        ps RECORD;
        fare numeric;
      BEGIN
        SELECT base_fare, rate_first, first_km, rate_after INTO ps
        FROM pricing_standards LIMIT 1;

        IF NOT FOUND THEN
          RETURN ROUND(50 + distance_km * 15)::integer;
        END IF;

        IF distance_km <= ps.first_km THEN
          fare := ps.base_fare + (distance_km * ps.rate_first);
        ELSE
          fare := ps.base_fare + (ps.first_km * ps.rate_first) + ((distance_km - ps.first_km) * ps.rate_after);
        END IF;

        RETURN ROUND(fare)::integer;
      END;
      $fn$ LANGUAGE plpgsql STABLE
    `);
    const r = await pool.query('SELECT estimate_fare(3) AS short, estimate_fare(10) AS long');
    console.log('estimate_fare(3):', r.rows[0].short, '| estimate_fare(10):', r.rows[0].long);
    process.exit(0);
  } catch (err) {
    console.error('Failed:', err.message);
    process.exit(1);
  }
})();
