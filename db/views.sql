-- =========================================================
-- Reusable SQL Views for Ride-Share App
-- Run this file to create/update all views:
--   psql -f db/views.sql
-- =========================================================

-- ---------------------------------------------------------
-- v_ride_details
-- Consolidated view of ride data joined with request info,
-- driver/rider names, driver rating, and vehicle info.
-- Used by: ride history (rider & driver), active ride polling,
-- completed ride summary.
-- Eliminates 4+ duplicate JOIN patterns in the codebase.
-- ---------------------------------------------------------
CREATE OR REPLACE VIEW v_ride_details AS
SELECT
  r.ride_id,
  r.request_id,
  r.rider_id,
  r.driver_id,
  r.status,
  r.started_at,
  r.completed_at,
  r.total_fare    AS final_fare,
  r.driver_earning,
  r.platform_fee,
  rr.pickup_addr,
  rr.dropoff_addr,
  rr.estimated_fare,
  rr.estimated_distance_km,
  ud.first_name || ' ' || ud.last_name AS driver_name,
  ud.phone_number AS driver_phone,
  ur.first_name || ' ' || ur.last_name AS rider_name,
  d.rating_avg   AS driver_rating,
  v.model        AS vehicle_model,
  v.plate_number AS vehicle_plate
FROM rides r
JOIN ride_requests rr ON r.request_id = rr.request_id
JOIN users ud          ON r.driver_id  = ud.user_id
JOIN users ur          ON r.rider_id   = ur.user_id
LEFT JOIN drivers d    ON r.driver_id  = d.driver_id
LEFT JOIN vehicles v   ON r.vehicle_id = v.vehicle_id;

-- ---------------------------------------------------------
-- v_driver_earnings_summary
-- Aggregates driver earnings by day, with running totals.
-- Complex query: JOIN + GROUP BY + aggregate functions +
-- window function for cumulative running total.
-- ---------------------------------------------------------
CREATE OR REPLACE VIEW v_driver_earnings_summary AS
SELECT
  r.driver_id,
  DATE(r.completed_at) AS ride_date,
  COUNT(*) AS ride_count,
  SUM(r.total_fare) AS total_fares,
  SUM(r.driver_earning) AS total_earnings,
  SUM(r.platform_fee) AS total_platform_fees,
  ROUND(AVG(r.total_fare), 2) AS avg_fare,
  SUM(SUM(r.driver_earning)) OVER (
    PARTITION BY r.driver_id
    ORDER BY DATE(r.completed_at)
  ) AS cumulative_earnings
FROM rides r
WHERE r.status = 'completed' AND r.total_fare IS NOT NULL
GROUP BY r.driver_id, DATE(r.completed_at);

