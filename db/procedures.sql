-- =========================================================
-- Stored Procedures for Ride-Share App
-- Run this file to create/update all procedures:
--   psql -f db/procedures.sql
-- =========================================================

-- ---------------------------------------------------------
-- 1. process_ride_payment(p_ride_id, p_promo_code)
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

-- ---------------------------------------------------------
-- 2. process_mutual_cancellation(p_ride_id, p_requester_id, p_rider_id, p_driver_id)
-- Handles the database side-effects of accepting a mutual
-- cancellation: records the cancellation (no fee), updates
-- ride status to 'cancelled' (trigger frees the driver),
-- and notifies both rider and driver.
-- ---------------------------------------------------------
CREATE OR REPLACE PROCEDURE process_mutual_cancellation(
  p_ride_id      UUID,
  p_requester_id UUID,
  p_rider_id     UUID,
  p_driver_id    UUID
)
LANGUAGE plpgsql AS $$
BEGIN
  -- Record cancellation (no fee for mutual)
  INSERT INTO ride_cancellations (ride_id, cancelled_by_user_id, reason, cancellation_fee, cancellation_type)
  VALUES (p_ride_id, p_requester_id, 'Mutual cancellation', 0, 'mutual');

  -- Cancel the ride — trg_ride_status_change sets driver back to 'online'
  UPDATE rides SET status = 'cancelled' WHERE ride_id = p_ride_id;

  -- Notify both participants
  INSERT INTO notifications (user_id, title, body) VALUES
    (p_rider_id, 'Ride Cancelled', 'The ride was cancelled by mutual agreement. No fee was charged.'),
    (p_driver_id, 'Ride Cancelled', 'The ride was cancelled by mutual agreement. No fee was charged.');
END;
$$;
