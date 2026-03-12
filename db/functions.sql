-- =========================================================
-- Reusable SQL Functions for Ride-Share App
-- Run this file to create/update all functions:
--   psql -f db/functions.sql
-- =========================================================

-- ---------------------------------------------------------
-- calculate_distance_km(lat1, lng1, lat2, lng2)
-- Returns the distance in km between two lat/lng points.
-- Uses PostGIS ST_Distance on geography (meters), converts to km.
-- Replaces duplicate inline ST_Distance queries in the codebase.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION calculate_distance_km(
  lat1 numeric, lng1 numeric,
  lat2 numeric, lng2 numeric
) RETURNS numeric AS $$
  SELECT ROUND((ST_Distance(
    ST_SetSRID(ST_MakePoint(lng1, lat1), 4326)::geography,
    ST_SetSRID(ST_MakePoint(lng2, lat2), 4326)::geography
  ) / 1000)::numeric, 2);
$$ LANGUAGE SQL IMMUTABLE;

-- ---------------------------------------------------------
-- estimate_fare(distance_km)
-- Returns the estimated fare in BDT for a given distance.
-- Formula: base 50 BDT + 15 BDT per km.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION estimate_fare(distance_km numeric)
RETURNS integer AS $$
  SELECT ROUND(50 + distance_km * 15)::integer;
$$ LANGUAGE SQL IMMUTABLE;

-- ---------------------------------------------------------
-- estimate_duration_min(distance_km)
-- Returns the estimated ride duration in minutes.
-- Formula: ~3 minutes per km.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION estimate_duration_min(distance_km numeric)
RETURNS integer AS $$
  SELECT ROUND(distance_km * 3)::integer;
$$ LANGUAGE SQL IMMUTABLE;

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
