-- =========================================================
-- Triggers for Ride-Share App
-- Run this file to create/update all triggers:
--   psql -f db/triggers.sql
-- =========================================================

-- ---------------------------------------------------------
-- 1. handle_new_user()
-- Auto-creates a public.users row when a user signs up
-- via Supabase Auth. Copies name, role, phone from metadata.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (user_id, email, name, role, phone_number)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', 'New User'),
    COALESCE(NEW.raw_user_meta_data->>'role', 'rider'),
    COALESCE(NEW.raw_user_meta_data->>'phone_number', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Only create if auth.users exists (Supabase environment)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'auth' AND table_name = 'users'
  ) THEN
    DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
  END IF;
END $$;

-- ---------------------------------------------------------
-- 2. on_ride_status_change()
-- When a ride status changes to 'completed' or 'cancelled',
-- automatically set the driver back to 'online'.
-- This removes the need for the backend to run a separate
-- UPDATE drivers query after completing/cancelling a ride.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION on_ride_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('completed', 'cancelled')
     AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    UPDATE drivers SET status = 'online' WHERE driver_id = NEW.driver_id;
  END IF;

  -- Set timestamps automatically
  IF NEW.status = 'started' AND OLD.status != 'started' THEN
    NEW.started_at := NOW();
  END IF;

  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    NEW.completed_at := NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ride_status_change ON rides;
CREATE TRIGGER trg_ride_status_change
  BEFORE UPDATE OF status ON rides
  FOR EACH ROW EXECUTE FUNCTION on_ride_status_change();


-- ---------------------------------------------------------
-- 3. log_login_activity()
-- AFTER INSERT on refresh_tokens: logs a login event
-- into login_logs whenever a new refresh token is created.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_login_activity()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.login_logs (user_id, login_at)
  VALUES (NEW.user_id, NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_log_login ON public.refresh_tokens;
CREATE TRIGGER trg_log_login
  AFTER INSERT ON public.refresh_tokens
  FOR EACH ROW EXECUTE FUNCTION public.log_login_activity();


-- ---------------------------------------------------------
-- 4. log_payment_completed()
-- AFTER UPDATE trigger on rides: when invoice_id changes
-- from NULL to a value (payment processed), insert
-- notification records for both rider and driver.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION log_payment_completed()
RETURNS TRIGGER AS $$
BEGIN
  -- Only fire when invoice_id is newly set (payment just processed)
  IF OLD.invoice_id IS NULL AND NEW.invoice_id IS NOT NULL THEN
    -- Notify rider
    INSERT INTO notifications (user_id, title, body)
    VALUES (
      NEW.rider_id,
      'Payment Processed',
      'Your ride payment of ' || NEW.total_fare || ' BDT has been processed.'
    );

    -- Notify driver
    INSERT INTO notifications (user_id, title, body)
    VALUES (
      NEW.driver_id,
      'Earnings Received',
      'You earned ' || NEW.driver_earning || ' BDT from your completed ride.'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payment_completed ON rides;
CREATE TRIGGER trg_payment_completed
  AFTER UPDATE OF invoice_id ON rides
  FOR EACH ROW
  WHEN (OLD.invoice_id IS NULL AND NEW.invoice_id IS NOT NULL)
  EXECUTE FUNCTION log_payment_completed();

-- ---------------------------------------------------------
-- 5. update_rating_avg()
-- AFTER INSERT on ratings: recalculate the ratee's
-- rating_avg in the riders or drivers profile table.
-- Uses NULL when no ratings exist (instead of default 5.0).
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION update_rating_avg()
RETURNS TRIGGER AS $$
DECLARE
  v_new_avg NUMERIC(3,2);
  v_role TEXT;
BEGIN
  -- Calculate the new average for the ratee
  SELECT ROUND(AVG(score)::numeric, 2) INTO v_new_avg
  FROM ratings
  WHERE ratee_user_id = NEW.ratee_user_id;

  -- Determine the ratee's role
  SELECT role INTO v_role FROM users WHERE user_id = NEW.ratee_user_id;

  -- Update the appropriate profile table
  IF v_role IN ('rider', 'mixed') THEN
    UPDATE riders SET rating_avg = v_new_avg WHERE rider_id = NEW.ratee_user_id;
  END IF;

  IF v_role IN ('driver', 'mixed') THEN
    UPDATE drivers SET rating_avg = v_new_avg WHERE driver_id = NEW.ratee_user_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_rating_avg ON ratings;
CREATE TRIGGER trg_update_rating_avg
  AFTER INSERT ON ratings
  FOR EACH ROW EXECUTE FUNCTION update_rating_avg();
