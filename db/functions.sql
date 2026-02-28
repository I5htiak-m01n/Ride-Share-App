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
