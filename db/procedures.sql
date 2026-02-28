-- =========================================================
-- Stored Procedures for Ride-Share App
-- Run this file to create/update all procedures:
--   psql -f db/procedures.sql
-- =========================================================

-- ---------------------------------------------------------
-- 1. accept_ride_request(p_request_id, p_driver_id)
-- Full transaction to accept a ride request:
--   1. Lock the request row (FOR UPDATE)
--   2. Record driver response
--   3. Update request status to 'matched'
--   4. Create the ride row
--   5. Set driver status to 'busy'
-- Raises an exception if the request is no longer open.
-- ---------------------------------------------------------
CREATE OR REPLACE PROCEDURE accept_ride_request(
  p_request_id UUID,
  p_driver_id  UUID,
  OUT p_ride_id UUID,
  OUT p_rider_id UUID,
  OUT p_rider_name TEXT,
  OUT p_pickup_addr TEXT,
  OUT p_dropoff_addr TEXT,
  OUT p_estimated_fare NUMERIC,
  OUT p_pickup_location GEOGRAPHY,
  OUT p_dropoff_location GEOGRAPHY
)
LANGUAGE plpgsql AS $$
DECLARE
  v_request RECORD;
BEGIN
  -- Lock the request row
  SELECT rr.*, u.name AS rider_name
  INTO v_request
  FROM ride_requests rr
  JOIN riders r ON rr.rider_id = r.rider_id
  JOIN users u ON r.rider_id = u.user_id
  WHERE rr.request_id = p_request_id AND rr.status = 'open'
  FOR UPDATE OF rr;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ride request is no longer available';
  END IF;

  -- Record driver response
  INSERT INTO driver_responses (request_id, driver_id, response_status)
  VALUES (p_request_id, p_driver_id, 'accepted')
  ON CONFLICT (request_id, driver_id)
  DO UPDATE SET response_status = 'accepted', response_time = NOW();

  -- Update request status
  UPDATE ride_requests SET status = 'matched'
  WHERE request_id = p_request_id;

  -- Create the ride
  INSERT INTO rides (request_id, rider_id, driver_id,
                     pickup_location, dropoff_location, status)
  VALUES (p_request_id, v_request.rider_id, p_driver_id,
          v_request.pickup_location, v_request.dropoff_location, 'driver_assigned')
  RETURNING ride_id INTO p_ride_id;

  -- Set driver to busy
  UPDATE drivers SET status = 'busy' WHERE driver_id = p_driver_id;

  -- Set OUT parameters
  p_rider_id := v_request.rider_id;
  p_rider_name := v_request.rider_name;
  p_pickup_addr := v_request.pickup_addr;
  p_dropoff_addr := v_request.dropoff_addr;
  p_estimated_fare := v_request.estimated_fare;
  p_pickup_location := v_request.pickup_location;
  p_dropoff_location := v_request.dropoff_location;
END;
$$;

-- ---------------------------------------------------------
-- 2. complete_ride(p_ride_id, p_driver_id)
-- Updates ride status to 'completed', sets completed_at,
-- and frees the driver (set to 'online').
-- Note: The trg_ride_status_change trigger handles setting
-- completed_at and driver status automatically, but this
-- procedure provides a single entry point.
-- ---------------------------------------------------------
CREATE OR REPLACE PROCEDURE complete_ride(
  p_ride_id   UUID,
  p_driver_id UUID,
  OUT p_success BOOLEAN
)
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE rides
  SET status = 'completed',
      completed_at = NOW()
  WHERE ride_id = p_ride_id AND driver_id = p_driver_id;

  IF NOT FOUND THEN
    p_success := FALSE;
    RETURN;
  END IF;

  -- Driver status is set to 'online' by trg_ride_status_change trigger
  p_success := TRUE;
END;
$$;

-- ---------------------------------------------------------
-- 3. create_ride_request(...)
-- Creates a new ride request with fare estimation using
-- the calculate_distance_km() and estimate_fare() functions.
-- ---------------------------------------------------------
CREATE OR REPLACE PROCEDURE create_ride_request(
  p_rider_id    UUID,
  p_pickup_lat  NUMERIC,
  p_pickup_lng  NUMERIC,
  p_pickup_addr TEXT,
  p_dropoff_lat NUMERIC,
  p_dropoff_lng NUMERIC,
  p_dropoff_addr TEXT,
  OUT p_request_id UUID,
  OUT p_estimated_fare INTEGER,
  OUT p_distance_km NUMERIC,
  OUT p_duration_min INTEGER
)
LANGUAGE plpgsql AS $$
BEGIN
  -- Ensure rider profile exists
  INSERT INTO riders (rider_id) VALUES (p_rider_id)
  ON CONFLICT DO NOTHING;

  -- Calculate distance using the reusable function
  p_distance_km := calculate_distance_km(
    p_pickup_lat, p_pickup_lng, p_dropoff_lat, p_dropoff_lng
  );

  -- Calculate fare and duration using reusable functions
  p_estimated_fare := estimate_fare(p_distance_km);
  p_duration_min := estimate_duration_min(p_distance_km);

  -- Insert the ride request
  INSERT INTO ride_requests (
    rider_id, pickup_location, pickup_addr,
    dropoff_location, dropoff_addr,
    status, estimated_fare, estimated_distance_km, expires_at
  ) VALUES (
    p_rider_id,
    ST_SetSRID(ST_MakePoint(p_pickup_lng, p_pickup_lat), 4326)::geography,
    p_pickup_addr,
    ST_SetSRID(ST_MakePoint(p_dropoff_lng, p_dropoff_lat), 4326)::geography,
    p_dropoff_addr,
    'open', p_estimated_fare, p_distance_km,
    NOW() + INTERVAL '5 minutes'
  ) RETURNING request_id INTO p_request_id;
END;
$$;
