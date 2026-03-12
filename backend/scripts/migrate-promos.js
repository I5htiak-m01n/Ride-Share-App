/**
 * Migration: Add expiry_date, total_usage_limit, created_at to promos table
 * Run: node backend/scripts/migrate-promos.js
 */
require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Add expiry_date column if not exists
    await client.query(`
      ALTER TABLE promos
      ADD COLUMN IF NOT EXISTS expiry_date timestamptz
    `);

    // Add total_usage_limit column if not exists
    await client.query(`
      ALTER TABLE promos
      ADD COLUMN IF NOT EXISTS total_usage_limit int
    `);

    // Add created_at column if not exists
    await client.query(`
      ALTER TABLE promos
      ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now()
    `);

    // Update the apply_promo_discount function to check new fields
    await client.query(`
      CREATE OR REPLACE FUNCTION apply_promo_discount(
        p_fare numeric,
        p_promo_code text,
        p_rider_id uuid
      ) RETURNS TABLE(
        discounted_fare numeric,
        discount_applied numeric,
        promo_id uuid,
        promo_valid boolean
      ) AS $$
      DECLARE
        v_promo RECORD;
        v_usage_count int;
        v_total_usage int;
      BEGIN
        IF p_promo_code IS NULL OR TRIM(p_promo_code) = '' THEN
          RETURN QUERY SELECT p_fare, 0::numeric, NULL::uuid, false;
          RETURN;
        END IF;

        SELECT p.promo_id, p.discount_amount, p.is_active, p.usage_per_user,
               p.total_usage_limit, p.expiry_date
        INTO v_promo
        FROM promos p
        WHERE UPPER(p.promo_code) = UPPER(TRIM(p_promo_code));

        IF NOT FOUND OR NOT v_promo.is_active THEN
          RETURN QUERY SELECT p_fare, 0::numeric, NULL::uuid, false;
          RETURN;
        END IF;

        IF v_promo.expiry_date IS NOT NULL AND v_promo.expiry_date < NOW() THEN
          RETURN QUERY SELECT p_fare, 0::numeric, NULL::uuid, false;
          RETURN;
        END IF;

        IF v_promo.total_usage_limit IS NOT NULL THEN
          SELECT COUNT(*) INTO v_total_usage
          FROM promo_redemptions pr
          WHERE pr.promo_id = v_promo.promo_id;

          IF v_total_usage >= v_promo.total_usage_limit THEN
            RETURN QUERY SELECT p_fare, 0::numeric, NULL::uuid, false;
            RETURN;
          END IF;
        END IF;

        SELECT COUNT(*) INTO v_usage_count
        FROM promo_redemptions pr
        WHERE pr.promo_id = v_promo.promo_id AND pr.rider_id = p_rider_id;

        IF v_usage_count >= v_promo.usage_per_user THEN
          RETURN QUERY SELECT p_fare, 0::numeric, NULL::uuid, false;
          RETURN;
        END IF;

        RETURN QUERY SELECT
          GREATEST(p_fare - v_promo.discount_amount, 0::numeric),
          LEAST(v_promo.discount_amount, p_fare),
          v_promo.promo_id,
          true;
      END;
      $$ LANGUAGE plpgsql
    `);

    await client.query("COMMIT");
    console.log("✅ Migration complete: promos table updated with expiry_date, total_usage_limit, created_at");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Migration failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
