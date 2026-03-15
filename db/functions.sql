-- =========================================================
-- Reusable SQL Functions for Ride-Share App
-- Run this file to create/update all functions:
--   psql -f db/functions.sql
-- =========================================================

-- Drop old overloaded version if it exists
DROP FUNCTION IF EXISTS estimate_fare(numeric, numeric);

-- ---------------------------------------------------------
-- estimate_fare(distance_km)
-- Returns the estimated fare in BDT for a given distance.
-- Reads tiered rates from pricing_standards table.
-- Formula: base_fare + (rate_first × min(distance, first_km))
--          + (rate_after × remaining km)
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION estimate_fare(distance_km numeric)
RETURNS integer AS $$
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
$$ LANGUAGE plpgsql STABLE;

-- ---------------------------------------------------------
-- apply_promo_discount(p_fare, p_promo_code, p_rider_id)
-- Validates a promo code, checks usage limits per rider,
-- and returns the discounted fare.
-- Returns the original fare unchanged if the promo is
-- invalid, inactive, or usage limit reached.
-- ---------------------------------------------------------
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
  -- If no promo code provided, return original fare
  IF p_promo_code IS NULL OR TRIM(p_promo_code) = '' THEN
    RETURN QUERY SELECT p_fare, 0::numeric, NULL::uuid, false;
    RETURN;
  END IF;

  -- Look up the promo
  SELECT p.promo_id, p.discount_amount, p.is_active, p.usage_per_user,
         p.total_usage_limit, p.expiry_date
  INTO v_promo
  FROM promos p
  WHERE UPPER(p.promo_code) = UPPER(TRIM(p_promo_code));

  -- Promo not found or inactive
  IF NOT FOUND OR NOT v_promo.is_active THEN
    RETURN QUERY SELECT p_fare, 0::numeric, NULL::uuid, false;
    RETURN;
  END IF;

  -- Check expiry date
  IF v_promo.expiry_date IS NOT NULL AND v_promo.expiry_date < NOW() THEN
    RETURN QUERY SELECT p_fare, 0::numeric, NULL::uuid, false;
    RETURN;
  END IF;

  -- Check global usage limit
  IF v_promo.total_usage_limit IS NOT NULL THEN
    SELECT COUNT(*) INTO v_total_usage
    FROM promo_redemptions pr
    WHERE pr.promo_id = v_promo.promo_id;

    IF v_total_usage >= v_promo.total_usage_limit THEN
      RETURN QUERY SELECT p_fare, 0::numeric, NULL::uuid, false;
      RETURN;
    END IF;
  END IF;

  -- Check usage limit for this rider
  SELECT COUNT(*) INTO v_usage_count
  FROM promo_redemptions pr
  WHERE pr.promo_id = v_promo.promo_id AND pr.rider_id = p_rider_id;

  IF v_usage_count >= v_promo.usage_per_user THEN
    RETURN QUERY SELECT p_fare, 0::numeric, NULL::uuid, false;
    RETURN;
  END IF;

  -- Apply discount (floor at 0)
  RETURN QUERY SELECT
    GREATEST(p_fare - v_promo.discount_amount, 0::numeric),
    LEAST(v_promo.discount_amount, p_fare),
    v_promo.promo_id,
    true;
END;
$$ LANGUAGE plpgsql;
