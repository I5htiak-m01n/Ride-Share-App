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
-- 3. auto_expire_ride_requests()
-- Utility function (can be called by pg_cron or manually)
-- to bulk-expire all open ride requests past their expiry.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION auto_expire_ride_requests()
RETURNS integer AS $$
DECLARE
  expired_count integer;
BEGIN
  UPDATE ride_requests
  SET status = 'expired'
  WHERE status = 'open' AND expires_at < NOW();

  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$ LANGUAGE plpgsql;
