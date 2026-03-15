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
-- 3. process_ride_payment(p_ride_id, p_promo_code)
-- Full transactional payment processing:
--   1. Locks ride and wallet rows (FOR UPDATE)
--   2. Gets estimated_fare from ride_request
--   3. Applies promo discount via apply_promo_discount()
--   4. Computes platform_fee (15%) and driver_earning (85%)
--   5. Checks rider wallet has sufficient balance
--   6. Creates invoice (status = 'paid')
--   7. Debits rider wallet, credits driver wallet
--   8. Creates transaction records for both parties
--   9. Records promo redemption if applicable
--  10. Updates ride with financial data
-- Raises exception if insufficient balance.
-- ---------------------------------------------------------
CREATE OR REPLACE PROCEDURE process_ride_payment(
  p_ride_id    UUID,
  p_promo_code TEXT,
  OUT p_total_fare      NUMERIC,
  OUT p_discount        NUMERIC,
  OUT p_platform_fee    NUMERIC,
  OUT p_driver_earning  NUMERIC,
  OUT p_invoice_id      UUID,
  OUT p_rider_balance   NUMERIC
)
LANGUAGE plpgsql AS $$
DECLARE
  v_ride RECORD;
  v_promo_result RECORD;
  v_base_fare NUMERIC;
  v_rider_balance NUMERIC;
  v_final_promo_code TEXT;
  v_fee_pct NUMERIC;
BEGIN
  -- 1. Lock and fetch the ride with its request data
  SELECT r.ride_id, r.rider_id, r.driver_id, r.invoice_id,
         rr.estimated_fare, rr.promo_code AS req_promo_code
  INTO v_ride
  FROM rides r
  JOIN ride_requests rr ON r.request_id = rr.request_id
  WHERE r.ride_id = p_ride_id
  FOR UPDATE OF r;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ride not found: %', p_ride_id;
  END IF;

  -- Already processed?
  IF v_ride.invoice_id IS NOT NULL THEN
    RAISE EXCEPTION 'Payment already processed for ride: %', p_ride_id;
  END IF;

  -- 2. Base fare from estimated_fare
  v_base_fare := COALESCE(v_ride.estimated_fare, 0);

  -- Use promo code from parameter, falling back to one stored on request
  v_final_promo_code := COALESCE(p_promo_code, v_ride.req_promo_code);

  -- 3. Apply promo discount using the reusable function
  SELECT * INTO v_promo_result
  FROM apply_promo_discount(v_base_fare, v_final_promo_code, v_ride.rider_id);

  p_total_fare := v_promo_result.discounted_fare;
  p_discount := v_promo_result.discount_applied;

  -- 4. Calculate splits using platform fee % from pricing_standards
  SELECT platform_fee_pct INTO v_fee_pct FROM pricing_standards LIMIT 1;
  v_fee_pct := COALESCE(v_fee_pct, 15.00);
  p_platform_fee := ROUND(p_total_fare * (v_fee_pct / 100), 2);
  p_driver_earning := p_total_fare - p_platform_fee;

  -- 5. Check rider wallet balance
  SELECT balance INTO v_rider_balance
  FROM wallets
  WHERE owner_id = v_ride.rider_id
  FOR UPDATE;

  IF v_rider_balance IS NULL THEN
    RAISE EXCEPTION 'Rider wallet not found';
  END IF;

  IF v_rider_balance < p_total_fare THEN
    RAISE EXCEPTION 'Insufficient wallet balance. Required: %, Available: %',
      p_total_fare, v_rider_balance;
  END IF;

  -- 6. Create invoice
  INSERT INTO invoices (base_fare, tax, total_amount, status)
  VALUES (v_base_fare, 0, p_total_fare, 'paid')
  RETURNING invoice_id INTO p_invoice_id;

  -- 7. Debit rider wallet
  UPDATE wallets
  SET balance = balance - p_total_fare
  WHERE owner_id = v_ride.rider_id;

  -- 8. Credit driver wallet
  UPDATE wallets
  SET balance = balance + p_driver_earning
  WHERE owner_id = v_ride.driver_id;

  -- 9. Create transaction records
  -- Rider payment
  INSERT INTO transactions (wallet_owner_id, amount, currency, status, type, invoice_id)
  VALUES (v_ride.rider_id, p_total_fare, 'BDT', 'succeeded', 'ride_payment', p_invoice_id);

  -- Driver earning
  INSERT INTO transactions (wallet_owner_id, amount, currency, status, type, invoice_id)
  VALUES (v_ride.driver_id, p_driver_earning, 'BDT', 'succeeded', 'ride_payment', p_invoice_id);

  -- Platform fee record
  INSERT INTO transactions (wallet_owner_id, amount, currency, status, type, invoice_id)
  VALUES (v_ride.driver_id, p_platform_fee, 'BDT', 'succeeded', 'platform_fee', p_invoice_id);

  -- 10. Record promo redemption if promo was applied
  IF v_promo_result.promo_valid AND v_promo_result.promo_id IS NOT NULL THEN
    INSERT INTO promo_redemptions (promo_id, rider_id, ride_id)
    VALUES (v_promo_result.promo_id, v_ride.rider_id, p_ride_id);
  END IF;

  -- 11. Update ride with financial data
  UPDATE rides
  SET total_fare = p_total_fare,
      platform_fee = p_platform_fee,
      driver_earning = p_driver_earning,
      invoice_id = p_invoice_id
  WHERE ride_id = p_ride_id;

  -- Return updated rider balance
  SELECT balance INTO p_rider_balance
  FROM wallets WHERE owner_id = v_ride.rider_id;
END;
$$;
