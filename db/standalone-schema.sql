-- Enable required extensions
create extension if not exists pgcrypto;
create extension if not exists postgis; -- For Maps/Location

-- =========================================================
-- 2. CORE USERS
-- =========================================================
create table if not exists users (
  user_id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,
  first_name text not null,
  last_name text not null,
  phone_number text not null unique,
  role text not null check (role in ('rider','driver','admin','support','mixed')),
  profile_picture_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index users_email_idx on users(email);
create index users_phone_idx on users(phone_number);

-- =========================================================
-- 3. PROFILES (Rider, Driver, Admin, Staff)
-- =========================================================
create table if not exists riders (
  rider_id uuid primary key references users(user_id) on delete cascade,
  rating_avg numeric(3,2) default 5.0,
  total_rides int not null default 0
);

create table if not exists rider_common_pickups (
  rider_id uuid not null references riders(rider_id) on delete cascade,
  pickup_label text not null,
  location geography(Point, 4326),
  primary key (rider_id, pickup_label)
);

create table if not exists drivers (
  driver_id uuid primary key references users(user_id) on delete cascade,
  license_number text unique,
  is_available boolean not null default false,
  current_location geography(Point, 4326),
  rating_avg numeric(3,2) default 5.0,
  total_rides int not null default 0,
  status text not null default 'offline' check (status in ('offline','online','busy','suspended'))
);

-- Index for fast "drivers near me" queries
create index drivers_location_idx on drivers using GIST (current_location);

create table if not exists admins (
  admin_id uuid primary key references users(user_id) on delete cascade,
  admin_role text default 'admin'
);

create table if not exists support_staff (
  support_staff_id uuid primary key references users(user_id) on delete cascade,
  level int not null check (level between 1 and 5),
  is_active boolean not null default true
);

-- =========================================================
-- 4. WALLETS (Universal)
-- =========================================================
create table if not exists wallets (
  user_id uuid primary key references users(user_id) on delete cascade,
  balance numeric(12,2) not null default 0,
  currency text not null default 'BDT'
);

create table if not exists transactions (
  txn_id uuid primary key default gen_random_uuid(),
  wallet_user_id uuid references wallets(user_id) on delete set null,
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null default 'BDT',
  gateway_ref text,
  status text not null check (status in ('pending','succeeded','failed','reversed')),
  type text not null check (type in ('wallet_topup','ride_payment','refund_payout','platform_fee')),
  ts timestamptz not null default now(),
  invoice_id uuid
);

-- =========================================================
-- 5. VEHICLES & DOCUMENTS
-- =========================================================
create table if not exists vehicles (
  vehicle_id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references drivers(driver_id) on delete cascade,
  vehicle_type text not null check (vehicle_type in ('car','bike','auto','suv')),
  make text not null,
  model text not null,
  year int,
  license_plate text unique not null,
  color text,
  capacity int not null default 4
);

create table if not exists driver_documents (
  doc_id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references drivers(driver_id) on delete cascade,
  doc_type text not null check (doc_type in ('license','id_proof','insurance','background_check')),
  doc_url text not null,
  verified boolean not null default false,
  expiry_date date,
  uploaded_at timestamptz not null default now()
);

create table if not exists vehicle_documents (
  doc_id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles(vehicle_id) on delete cascade,
  doc_type text not null check (doc_type in ('registration','insurance','fitness_certificate')),
  doc_url text not null,
  verified boolean not null default false,
  expiry_date date,
  uploaded_at timestamptz not null default now()
);

-- =========================================================
-- 6. PRICING & ZONES
-- =========================================================
create table if not exists pricing_zones (
  zone_id uuid primary key default gen_random_uuid(),
  zone_name text not null,
  polygon geography(Polygon, 4326),
  base_fare numeric(8,2) not null,
  per_km_rate numeric(8,2) not null,
  per_minute_rate numeric(8,2) not null,
  surge_multiplier numeric(3,2) not null default 1.0
);

-- =========================================================
-- 7. RIDE REQUESTS & MATCHING
-- =========================================================
create table if not exists ride_requests (
  request_id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references riders(rider_id) on delete cascade,
  pickup_location geography(Point, 4326) not null,
  pickup_address text,
  dropoff_location geography(Point, 4326) not null,
  dropoff_address text,
  vehicle_type text not null,
  estimated_fare numeric(10,2),
  estimated_distance numeric(10,2),
  estimated_duration int,
  status text not null default 'open' check (status in ('open','matched','expired','cancelled')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '5 minutes')
);

create table if not exists driver_responses (
  response_id uuid primary key default gen_random_uuid(),
  request_id uuid not null references ride_requests(request_id) on delete cascade,
  driver_id uuid not null references drivers(driver_id) on delete cascade,
  response text not null check (response in ('accept','reject')),
  responded_at timestamptz not null default now()
);

-- =========================================================
-- 8. ACTIVE RIDES
-- =========================================================
create table if not exists rides (
  ride_id uuid primary key default gen_random_uuid(),
  request_id uuid references ride_requests(request_id),
  rider_id uuid not null references riders(rider_id) on delete cascade,
  driver_id uuid not null references drivers(driver_id) on delete cascade,
  vehicle_id uuid not null references vehicles(vehicle_id),

  pickup_location geography(Point, 4326) not null,
  pickup_address text,
  dropoff_location geography(Point, 4326) not null,
  dropoff_address text,

  status text not null default 'scheduled'
    check (status in ('scheduled','driver_arriving','in_progress','completed','cancelled')),

  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,

  distance_km numeric(10,2),
  duration_minutes int,
  total_fare numeric(10,2),
  platform_fee numeric(10,2),
  driver_earning numeric(10,2),

  created_at timestamptz not null default now()
);

create table if not exists ride_tracking_logs (
  log_id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references rides(ride_id) on delete cascade,
  location geography(Point, 4326) not null,
  ts timestamptz not null default now()
);

create table if not exists ride_cancellations (
  cancellation_id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references rides(ride_id) on delete cascade,
  cancelled_by uuid not null references users(user_id),
  reason text,
  cancellation_fee numeric(8,2) default 0,
  cancelled_at timestamptz not null default now()
);

-- =========================================================
-- 9. INVOICES & REFUNDS
-- =========================================================
create table if not exists invoices (
  invoice_id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references rides(ride_id) on delete cascade,
  rider_id uuid not null references riders(rider_id),
  total_amount numeric(10,2) not null,
  pdf_url text,
  issued_at timestamptz not null default now()
);

create table if not exists refunds (
  refund_id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references rides(ride_id) on delete cascade,
  rider_id uuid not null references riders(rider_id),
  amount numeric(10,2) not null,
  reason text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','completed')),
  requested_at timestamptz not null default now(),
  processed_at timestamptz
);

-- =========================================================
-- 10. PROMOS
-- =========================================================
create table if not exists promos (
  promo_id uuid primary key default gen_random_uuid(),
  code text unique not null,
  discount_type text not null check (discount_type in ('percentage','flat')),
  discount_value numeric(8,2) not null,
  max_usage_per_user int not null default 1,
  valid_from timestamptz not null,
  valid_until timestamptz not null
);

create table if not exists promo_redemptions (
  redemption_id uuid primary key default gen_random_uuid(),
  promo_id uuid not null references promos(promo_id),
  rider_id uuid not null references riders(rider_id),
  ride_id uuid references rides(ride_id),
  redeemed_at timestamptz not null default now()
);

-- =========================================================
-- 11. RATINGS & COMPLAINTS
-- =========================================================
create table if not exists ratings (
  rating_id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references rides(ride_id) on delete cascade,
  rated_by uuid not null references users(user_id),
  rated_user uuid not null references users(user_id),
  score int not null check (score between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

create table if not exists complaints (
  complaint_id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references rides(ride_id),
  filed_by uuid not null references users(user_id),
  against_user uuid references users(user_id),
  complaint_type text not null,
  description text,
  status text not null default 'filed' check (status in ('filed','under_review','resolved','dismissed')),
  filed_at timestamptz not null default now()
);

create table if not exists lost_item_reports (
  report_id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references rides(ride_id),
  reported_by uuid not null references users(user_id),
  item_description text not null,
  status text not null default 'open' check (status in ('open','found','closed')),
  reported_at timestamptz not null default now()
);

-- =========================================================
-- 12. SUPPORT & NOTIFICATIONS
-- =========================================================
create table if not exists support_tickets (
  ticket_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(user_id),
  subject text not null,
  message text not null,
  status text not null default 'open' check (status in ('open','in_progress','resolved','closed')),
  assigned_to uuid references support_staff(support_staff_id),
  created_at timestamptz not null default now()
);

create table if not exists notifications (
  notification_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(user_id),
  title text not null,
  body text not null,
  type text not null check (type in ('ride_update','payment','promo','system')),
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists login_logs (
  log_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(user_id),
  logged_in_at timestamptz not null default now()
);
