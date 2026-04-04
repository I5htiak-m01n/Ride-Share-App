-- ---------------------------------------------------------
-- 1. on_ride_status_change()
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
-- 2. on_user_created()
-- AFTER INSERT on users: automatically creates the
-- corresponding profile row (riders/drivers) and wallet.
-- Removes the need for the backend to manually INSERT
-- into riders/drivers/wallets during registration.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION on_user_created()
RETURNS TRIGGER AS $$
BEGIN
  -- Create role-specific profile
  IF NEW.role = 'rider' THEN
    INSERT INTO riders (rider_id) VALUES (NEW.user_id) ON CONFLICT DO NOTHING;
  ELSIF NEW.role = 'driver' THEN
    INSERT INTO drivers (driver_id, license_number, status)
    VALUES (NEW.user_id, 'PENDING_' || LEFT(NEW.user_id::text, 8), 'offline')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Create wallet
  INSERT INTO wallets (owner_id, balance, currency)
  VALUES (NEW.user_id, 0, 'BDT')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_created ON users;
CREATE TRIGGER trg_user_created
  AFTER INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION on_user_created();


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
  IF v_role IN ('rider') THEN
    UPDATE riders SET rating_avg = v_new_avg WHERE rider_id = NEW.ratee_user_id;
  END IF;

  IF v_role IN ('driver') THEN
    UPDATE drivers SET rating_avg = v_new_avg WHERE driver_id = NEW.ratee_user_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_rating_avg ON ratings;
CREATE TRIGGER trg_update_rating_avg
  AFTER INSERT ON ratings
  FOR EACH ROW EXECUTE FUNCTION update_rating_avg();
