-- =========================================================
-- 1. CLEANUP & EXTENSIONS
-- =========================================================
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;

GRANT ALL ON SCHEMA public TO postgres;
-- GRANT ALL ON SCHEMA public TO anon;
-- GRANT ALL ON SCHEMA public TO authenticated;
-- GRANT ALL ON SCHEMA public TO service_role;

create extension if not exists pgcrypto;
create extension if not exists postgis; -- For Maps/Location

-- =========================================================
-- 2. CORE USERS (With Auth Sync)
-- =========================================================
create table public.users (
  user_id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  email text unique not null,
  password_hash text not null,
  phone_number text not null unique,
  role text not null check (role in ('rider','driver','admin','support','mixed')),
  avatar_url text,
  is_banned boolean not null default false,
  created_at timestamptz not null default now()
);

-- TRIGGER: Log sensitive actions to login_logs shadow table
-- This trigger automatically logs every login by inserting into login_logs
create or replace function public.log_login_activity()
returns trigger as $$
begin
  insert into public.login_logs (user_id, login_at)
  values (new.user_id, now());
  return new;
end;
$$ language plpgsql security definer;

-- Refresh tokens table for JWT token management
create table public.refresh_tokens (
  token_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(user_id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_refresh_tokens_user on public.refresh_tokens(user_id);
create index idx_refresh_tokens_token on public.refresh_tokens(token);

-- =========================================================
-- 3. PROFILES (Rider, Driver, Admin, Staff)
-- =========================================================
create table public.riders (
  rider_id uuid primary key references public.users(user_id) on delete cascade,
  rating_avg numeric(3,2) default 5.0,
  current_location geography(Point, 4326)
);

create table public.rider_common_pickups (
  rider_id uuid not null references public.riders(rider_id) on delete cascade,
  pickup_label text not null,
  location geography(Point, 4326), -- IMPROVED: PostGIS Point
  primary key (rider_id, pickup_label)
);

create table public.drivers (
  driver_id uuid primary key references public.users(user_id) on delete cascade,
  license_number text not null unique,
  status text not null default 'offline' check (status in ('offline','online','busy','suspended')),
  current_location geography(Point, 4326), -- IMPROVED: PostGIS Point
  rating_avg numeric(3,2) default 5.0
);
-- Index for fast "drivers near me" queries
create index drivers_location_idx on public.drivers using GIST (current_location);

create table public.admins (
  admin_id uuid primary key references public.users(user_id) on delete cascade,
  role text -- e.g., 'super_admin', 'manager'
);

create table public.support_staff (
  support_staff_id uuid primary key references public.users(user_id) on delete cascade,
  level int not null check (level between 1 and 5),
  is_active boolean not null default true
);

-- =========================================================
-- 4. WALLETS (Universal)
-- =========================================================
create table public.wallets (
  -- IMPROVED: Changed from references riders(rider_id) to users(user_id)
  -- This allows Drivers to have wallets too.
  owner_id uuid primary key references public.users(user_id) on delete cascade,
  balance numeric(12,2) not null default 0,
  currency text not null default 'BDT'
);

create table public.transactions (
  txn_id uuid primary key default gen_random_uuid(),
  wallet_owner_id uuid references public.wallets(owner_id) on delete set null,
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null default 'BDT',
  gateway_ref text,
  status text not null check (status in ('pending','succeeded','failed','reversed')),
  type text not null check (type in ('wallet_topup','ride_payment','refund_payout','platform_fee','cancellation_fee')),
  ts timestamptz not null default now(),
  
  -- Linkages
  invoice_id uuid -- FK added later after invoices table created
);

-- =========================================================
-- 5. VEHICLE TYPES, VEHICLES & ZONES
-- =========================================================
create table public.vehicle_types (
  type_key text primary key,
  label text not null,
  description text,
  fare_multiplier numeric(4,2) not null default 1.00,
  capacity int not null default 4,
  sort_order int not null default 0
);

insert into public.vehicle_types (type_key, label, description, fare_multiplier, capacity, sort_order) values
  ('economy',  'Economy',  'Affordable everyday rides',  1.00, 4, 1),
  ('sedan',    'Sedan',    'Comfortable sedans',         1.20, 4, 2),
  ('suv',      'SUV',      'Spacious SUVs for groups',   1.50, 6, 3),
  ('premium',  'Premium',  'High-end luxury vehicles',   2.00, 4, 4);

create table public.vehicles (
  vehicle_id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(driver_id) on delete restrict,
  plate_number text unique not null,
  model text,
  type text not null references public.vehicle_types(type_key),
  is_active boolean default true,
  approval_status text not null default 'approved' check (approval_status in ('pending','approved','rejected')),
  rejection_reason text
);

create table public.driver_documents (
  driver_id uuid not null references public.drivers(driver_id) on delete cascade,
  doc_type text not null,
  image_url text,
  expiry_date date,
  status text not null default 'pending' check (status in ('valid','expired','rejected','pending')),
  vehicle_name text,
  vehicle_type text references public.vehicle_types(type_key),
  plate_number text,
  unique (driver_id, doc_type),
  primary key (driver_id, doc_type)
);

-- Chat messages between rider and driver during an active ride
CREATE TABLE IF NOT EXISTS public.chat_messages (
  message_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id uuid NOT NULL REFERENCES public.rides(ride_id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  content text NOT NULL CHECK (char_length(content) > 0 AND char_length(content) <= 500),
  message_type text NOT NULL DEFAULT 'text'
    CHECK (message_type IN ('text', 'cancel_request', 'cancel_accepted', 'cancel_declined')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_ride_created ON public.chat_messages(ride_id, created_at);


create table public.vehicle_documents (
  vehicle_id uuid not null references public.vehicles(vehicle_id) on delete cascade,
  doc_type text not null,
  image_url text,
  expiry_date date,
  status text not null default 'pending' check (status in ('pending','valid','expired','rejected')),
  unique (vehicle_id, doc_type),
  primary key (vehicle_id, doc_type)
);

create table public.pricing_standards (
  id uuid primary key default gen_random_uuid(),
  base_fare numeric(12,2) not null default 0,     -- starting price for any ride
  rate_first numeric(12,2) not null,         -- BDT per km for first `first_km` km
  first_km numeric(8,2) not null,            -- threshold km
  rate_after numeric(12,2) not null,         -- BDT per km after threshold
  platform_fee_pct numeric(5,2) not null,    -- platform fee as percentage (e.g. 15.00 = 15%)
  surge_factor numeric(4,2) not null default 1.0,  -- multiplier applied when density is high
  surge_range_km numeric(8,2) not null default 3.0, -- radius in km to check request density
  surge_density_threshold int not null default 50,   -- requests per sq km to trigger surge
  cancellation_pct numeric(5,2) not null default 10.00  -- % of estimated fare charged on cancellation
);

-- =========================================================
-- 6. RIDE REQUESTS & SCHEDULING
-- =========================================================
-- create table public.scheduled_rides (
--  schedule_id uuid primary key not null references public.ride_reqests(request_id),  
--  status text not null check (status in ('scheduled','cancelled','converted'))
-- );

create table public.ride_requests (
  request_id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.riders(rider_id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  scheduled_time timestamptz,
  status text not null check (status in ('open','expired','cancelled','matched','scheduled')),
  pickup_addr text not null,
  pickup_location geography(Point, 4326), -- IMPROVED
  dropoff_addr text not null,
  dropoff_location geography(Point, 4326), -- IMPROVED
  estimated_fare numeric(12,2),
  estimated_distance_km numeric(10,2),
  estimated_duration_min int,
  promo_code text,
  vehicle_type text not null default 'economy' references public.vehicle_types(type_key)
);

create table public.driver_responses (
  response_id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.ride_requests(request_id) on delete cascade,
  driver_id uuid not null references public.drivers(driver_id) on delete cascade,
  response_status text not null check (response_status in ('offered','accepted','rejected','expired')),
  response_time timestamptz not null default now(),
  unique (request_id, driver_id)
);

-- =========================================================
-- 7. RIDES & TRACKING
-- =========================================================
create table public.rides (
  ride_id uuid primary key default gen_random_uuid(),
  request_id uuid unique references public.ride_requests(request_id) on delete set null,
  rider_id uuid not null references public.riders(rider_id) on delete restrict,
  driver_id uuid not null references public.drivers(driver_id) on delete restrict,
  vehicle_id uuid references public.vehicles(vehicle_id) on delete set null,

  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,

  -- IMPROVED: PostGIS locations
  pickup_location geography(Point, 4326),
  pickup_addr text,
  dropoff_location geography(Point, 4326),
  dropoff_addr text,

  status text not null default 'requested'
    check (status in ('requested','driver_assigned','started','completed','cancelled')),
    
  -- IMPROVED: Financial Splits
  total_fare numeric(12,2),
  platform_fee numeric(12,2),
  driver_earning numeric(12,2),

  --Linkages
  invoice_id uuid
);

-- NEW TABLE: Missing from original but necessary for "Uber-like" apps
create table public.ride_tracking_logs (
  log_id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.rides(ride_id) on delete cascade,
  driver_id uuid not null references public.drivers(driver_id) on delete cascade,
  location geography(Point, 4326) not null,
  recorded_at timestamptz not null default now()
);

-- Route data for rides: stores Google Directions polyline + metadata
create table public.ride_routes (
  route_id uuid primary key default gen_random_uuid(),
  ride_id uuid references public.rides(ride_id) on delete cascade,
  request_id uuid references public.ride_requests(request_id) on delete cascade,
  overview_polyline text not null,                          -- encoded polyline string from Google Directions
  distance_meters integer not null,
  distance_text text not null,                              -- e.g. "12.3 km"
  duration_seconds integer not null,
  duration_text text not null,                              -- e.g. "18 mins"
  start_location_lat numeric(10,7),
  start_location_lng numeric(10,7),
  end_location_lat numeric(10,7),
  end_location_lng numeric(10,7),
  bounds_ne_lat numeric(10,7),
  bounds_ne_lng numeric(10,7),
  bounds_sw_lat numeric(10,7),
  bounds_sw_lng numeric(10,7),
  travel_mode text not null default 'DRIVING',
  is_reroute boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_ride_routes_ride on public.ride_routes(ride_id);
create index idx_ride_routes_request on public.ride_routes(request_id);

create table public.ride_cancellations (
  ride_id uuid unique primary key references public.rides(ride_id) on delete cascade,
  cancelled_by_user_id uuid not null references public.users(user_id) on delete restrict,
  reason text,
  cancelled_at timestamptz not null default now(),
  cancellation_fee numeric(12,2) not null default 0,
  cancellation_type text not null default 'unilateral'
    check (cancellation_type in ('unilateral', 'mutual')),
  invoice_id uuid references public.invoices(invoice_id) on delete set null
);

-- =========================================================
-- 8. FINANCE (Promos, Invoices, Refunds)
-- =========================================================
create table public.promos (
  promo_id uuid primary key default gen_random_uuid(),
  promo_code text unique not null,
  discount_amount numeric(12,2) not null default 0,
  is_active boolean not null default true,
  usage_per_user int not null default 1,
  total_usage_limit int,                          -- NULL = unlimited
  expiry_date timestamptz,                        -- NULL = no expiry
  created_at timestamptz not null default now()
);

create table public.promo_redemptions (
  redemption_id uuid primary key default gen_random_uuid(),
  promo_id uuid not null references public.promos(promo_id) on delete cascade,
  rider_id uuid not null references public.riders(rider_id) on delete cascade,
  ride_id uuid references public.rides(ride_id) on delete set null,
  redeemed_at timestamptz not null default now()
);

create table public.invoices (
  invoice_id uuid primary key default gen_random_uuid(),
  -- ride_id uuid unique not null references public.rides(ride_id) on delete cascade,
  issued_at timestamptz not null default now(),
  base_fare numeric(12,2) not null default 0,
  tax numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  status text not null check (status in ('unpaid','paid','void','refunded'))
);

-- Now we can link transactions to invoices
alter table public.transactions
  add constraint fk_txn_invoice foreign key (invoice_id) references public.invoices(invoice_id) on delete set null;

-- And link invoice for rides, cause invoice can be for rides and refunds both
alter table public.rides
  add constraint fk_rides_invoice foreign key (invoice_id) references public.invoices(invoice_id) on delete set null;

create table public.refunds (
  refund_id uuid primary key default gen_random_uuid(),
  invoice_id uuid unique not null references public.invoices(invoice_id) on delete cascade,
  amount numeric(12,2) not null check (amount >= 0),
  status text not null check (status in ('requested','approved','rejected','processed')),
  requested_at timestamptz not null default now(),
  processed_at timestamptz
);

-- =========================================================
-- 9. RATINGS, SUPPORT & LOGS
-- =========================================================
create table public.ratings (
  rating_id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.rides(ride_id) on delete cascade,
  rater_user_id uuid not null references public.users(user_id) on delete cascade,
  ratee_user_id uuid not null references public.users(user_id) on delete cascade,
  score int not null check (score between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  unique (ride_id, rater_user_id, ratee_user_id)
);

create table public.support_tickets (
  ticket_id uuid primary key default gen_random_uuid(),
  created_by_user_id uuid not null references public.users(user_id) on delete cascade,
  assigned_staff_id uuid references public.support_staff(support_staff_id) on delete set null,
  ride_id uuid references public.rides(ride_id) on delete set null,
  type text not null,
  description text,
  status text not null check (status in ('open','in_progress','resolved','closed')),
  priority int not null default 1 check (priority between 1 and 5),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table public.complaints (
  ticket_id uuid primary key references public.support_tickets(ticket_id) on delete cascade,
  -- filed_by_user_id uuid not null references public.users(user_id) on delete cascade,
  -- ride_id uuid references public.rides(ride_id) on delete set null,
  category text not null,
  details text,
  status text not null check (status in ('filed','under_review','resolved','rejected')),
  filed_at timestamptz not null default now()
);


create table public.ticket_responses (
  response_id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(ticket_id) on delete cascade,
  responder_id uuid not null references public.users(user_id) on delete cascade,
  message text not null check (char_length(message) > 0),
  created_at timestamptz not null default now()
);
create index idx_ticket_responses_ticket on public.ticket_responses(ticket_id, created_at);

create table public.notifications (
  notif_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(user_id) on delete cascade,
  title text not null,
  body text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_notifications_user_read on public.notifications (user_id, is_read, created_at desc);

create table public.login_logs (
  log_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(user_id) on delete cascade,
  login_at timestamptz not null default now(),
  ip_address text
);

-- =========================================================
-- 10. ROW LEVEL SECURITY (RLS)
-- =========================================================
-- alter table public.users enable row level security;
-- alter table public.riders enable row level security;
-- alter table public.drivers enable row level security;
-- alter table public.rides enable row level security;
-- alter table public.wallets enable row level security;
-- alter table public.transactions enable row level security;

-- -- Basic Policies
-- create policy "Users can view own profile" on public.users 
--   for select using (auth.uid() = user_id);

-- create policy "Riders view own rides" on public.rides 
--   for select using (auth.uid() = rider_id);

-- create policy "Drivers view assigned rides" on public.rides 
--   for select using (auth.uid() = driver_id);