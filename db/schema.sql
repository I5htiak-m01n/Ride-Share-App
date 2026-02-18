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
  user_id uuid primary key, -- references auth.users(id) on delete cascade,
  name text not null,
  email text unique not null,
  phone_number text not null unique,
  role text not null check (role in ('rider','driver','admin','support','mixed')),
  avatar_url text,
  created_at timestamptz not null default now()
);

-- TRIGGER: Sync Supabase Auth -> public.users
-- This trigger automatically creates a user profile when a new auth user is registered
create or replace function public.handle_new_user() 
returns trigger as $$
begin
  insert into public.users (user_id, email, name, role, phone_number)
  values (
    new.id, 
    new.email, 
    coalesce(new.raw_user_meta_data->>'name', 'New User'),
    coalesce(new.raw_user_meta_data->>'role', 'rider'),
    coalesce(new.raw_user_meta_data->>'phone_number', '')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =========================================================
-- 3. PROFILES (Rider, Driver, Admin, Staff)
-- =========================================================
create table public.riders (
  rider_id uuid primary key references public.users(user_id) on delete cascade,
  rating_avg numeric(3,2) default 5.0
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
  type text not null check (type in ('wallet_topup','ride_payment','refund_payout','platform_fee')),
  ts timestamptz not null default now(),
  
  -- Linkages
  invoice_id uuid -- FK added later after invoices table created
);

-- =========================================================
-- 5. VEHICLES & ZONES
-- =========================================================
create table public.vehicles (
  vehicle_id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(driver_id) on delete restrict,
  plate_number text unique not null,
  model text,
  type text not null,
  is_active boolean default true
);

create table public.driver_documents (
  driver_id uuid not null references public.drivers(driver_id) on delete cascade,
  doc_type text not null,
  image_url text,
  expiry_date date,
  status text not null default 'pending' check (status in ('valid','expired','rejected','pending')),
  unique (driver_id, doc_type),
  primary key (driver_id, doc_type)
);

create table public.vehicle_documents (
  vehicle_id uuid not null references public.vehicles(vehicle_id) on delete cascade,
  doc_type text not null,
  image_url text,
  expiry_date date,
  unique (vehicle_id, doc_type),
  primary key (vehicle_id, doc_type)
);

create table public.pricing_zones (
  zone_id uuid primary key default gen_random_uuid(),
  name text unique not null,
  base_rate numeric(12,2) not null default 0,
  area_polygon geography(Polygon, 4326) -- IMPROVED: PostGIS Polygon for zone shape
);
create index pricing_zones_idx on public.pricing_zones using GIST (area_polygon);

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
  estimated_duration_min int
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
  zone_id uuid references public.pricing_zones(zone_id) on delete set null,

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

create table public.ride_cancellations (
  ride_id uuid unique primary key references public.rides(ride_id) on delete cascade,
  cancelled_by_user_id uuid not null references public.users(user_id) on delete restrict,
  reason text,
  cancelled_at timestamptz not null default now(),
  cancellation_fee numeric(12,2) not null default 0
);

-- =========================================================
-- 8. FINANCE (Promos, Invoices, Refunds)
-- =========================================================
create table public.promos (
  promo_id uuid primary key default gen_random_uuid(),
  promo_code text unique not null,
  discount_amount numeric(12,2) not null default 0,
  is_active boolean not null default true,
  usage_per_user int not null default 1
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
  priority text not null default 'normal',
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

create table public.lost_item_reports (
  ticket_id uuid primary key references public.support_tickets(ticket_id) on delete cascade,
  -- reported_by_user_id uuid not null references public.users(user_id) on delete cascade,
  -- ride_id uuid references public.rides(ride_id) on delete set null,
  status text not null check (status in ('reported','searching','found','returned','closed')),
  description text,
  reported_at timestamptz not null default now()
);

create table public.notifications (
  notif_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(user_id) on delete cascade,
  title text not null,
  body text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

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