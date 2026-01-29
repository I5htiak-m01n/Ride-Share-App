create table if not exists users (
  user_id bigserial primary key,
  first_name text not null,
  last_name text not null,
  role text not null check (role in ('rider', 'driver', 'admin', 'support_staff')),
  phone_number VARCHAR(20) not null,
  created_at timestamptz not null default now()
);

-- create table if not exists ride (
--   ride_id bigserial primary key,
--   rider_id bigint not null references users(user_id),
--   driver_id bigint references users(user_id),
--   status text not null check (status in ('requested','accepted','ongoing','completed','cancelled')),
--   requested_at timestamptz not null default now(),
--   completed_at timestamptz
-- );
