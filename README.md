# RideShare

A full-stack ride-hailing platform built with React, Express, and PostgreSQL. Connects riders with nearby drivers in real time, with features including fare estimation, in-ride chat, mutual cancellations, wallet payments, promo codes, ratings, and driver onboarding.

Built as a Database Management project (CSE216) at BUET, Bangladesh.

---

## Prerequisites

- **Node.js** (v16 or higher)
- **PostgreSQL** database with the following extensions enabled:
  - `pgcrypto` (UUID generation)
  - `PostGIS` (geospatial queries)
- **Google Maps API key** with Directions API and Places API enabled
- **SSLCommerz** sandbox credentials (for payment gateway — optional)

---

## Project Structure

```
Ride-Share-App/
├── backend/          # Express API server
│   ├── src/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── routes/
│   │   └── index.js       # Entry point
│   ├── scripts/
│   └── uploads/
├── frontend/         # React (Vite) client
│   └── src/
│       ├── components/
│       ├── context/
│       ├── pages/
│       └── api/
└── db/               # SQL schema, functions, triggers, procedures, views
```

---

## Setup

### 1. Clone the repository

```bash
git clone <repository-url>
cd Ride-Share-App
```

### 2. Install dependencies

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### 3. Configure environment variables

#### Backend

Copy the example and fill in your values:

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env`:

| Variable | Description | Example |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/dbname?sslmode=require` |
| `JWT_SECRET` | Secret for signing access tokens | Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `REFRESH_TOKEN_SECRET` | Secret for signing refresh tokens | Generate the same way (use a different value) |
| `ACCESS_TOKEN_EXPIRY` | Access token lifetime in seconds | `3600` (1 hour) |
| `REFRESH_TOKEN_EXPIRY` | Refresh token lifetime in seconds | `604800` (7 days) |
| `PORT` | Backend server port | `3001` |
| `FRONTEND_URL` | Frontend URL for CORS | `http://localhost:5173` |
| `GOOGLE_MAPS_API_KEY` | Google Maps API key (Directions API enabled) | Your API key |
| `SSLCOMMERZ_STORE_ID` | SSLCommerz store ID | Sandbox store ID |
| `SSLCOMMERZ_STORE_PASSWORD` | SSLCommerz store password | Sandbox password |
| `SSLCOMMERZ_IS_LIVE` | Payment environment | `false` for sandbox |

#### Frontend

```bash
cd frontend
cp .env.example .env
```

Edit `frontend/.env`:

| Variable | Description | Example |
|---|---|---|
| `VITE_API_URL` | Backend API base URL | `http://localhost:3001/api` |
| `VITE_GOOGLE_MAPS_API_KEY` | Google Maps API key (Places + Maps JS) | Your API key |

### 4. Set up the database

Make sure your PostgreSQL database has `pgcrypto` and `PostGIS` extensions available. Then from the `backend/` directory:

```bash
# First-time setup (creates all tables, functions, triggers, views, procedures)
# WARNING: This drops and recreates the public schema — do NOT run on an existing database with data
npm run apply-schema -- --init
```

To update only functions, views, triggers, and procedures (safe to re-run):

```bash
npm run apply-schema
```

#### Seed initial data

After schema setup, create an admin account and support staff:

```bash
node scripts/seed-admin.js
node scripts/seed-support-staff.js
```

### 5. Run the application

Open two terminals:

```bash
# Terminal 1 — Backend
cd backend
npm run dev
```

```bash
# Terminal 2 — Frontend
cd frontend
npm run dev
```

The app will be available at:
- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:3001
- **API health check:** http://localhost:3001/health/db

---

## Database Architecture

The SQL files in `db/` are applied in this order:

| File | Purpose |
|---|---|
| `schema.sql` | Tables, indexes, constraints, extensions |
| `functions.sql` | `estimate_fare()`, `apply_promo_discount()`, `auto_expire_ride_requests()` |
| `views.sql` | `v_ride_details`, `v_driver_earnings_summary` |
| `triggers.sql` | 5 triggers for ride status, user creation, login logging, payment notifications, rating averages |
| `procedures.sql` | `process_ride_payment()`, `process_mutual_cancellation()` |

---

## API Routes

All routes are prefixed with `/api`. Authentication is via JWT Bearer token.

| Route Group | Prefix | Description |
|---|---|---|
| Auth | `/api/auth` | Register, login, logout, refresh token, profile |
| Users | `/api/users` | User management, avatar upload |
| Rides | `/api/rides` | Ride requests, acceptance, status updates, history |
| Drivers | `/api/drivers` | Onboarding, documents, vehicles, location |
| Wallet | `/api/wallet` | Balance, top-up, withdraw, transactions, earnings |
| Payment | `/api/payment` | SSLCommerz payment initiation and callbacks |
| Ratings | `/api/ratings` | Submit and view ride ratings |
| Chat | `/api/chat` | In-ride messaging and mutual cancellation |
| Notifications | `/api/notifications` | User notifications |
| Complaints | `/api/complaints` | File and track complaints |
| Support | `/api/support` | Support tickets |
| Admin | `/api/admin` | Dashboard, user management, document verification |
| Analytics | `/api/analytics` | Top drivers, promo performance |
| Saved Places | `/api/saved-places` | Saved pickup/dropoff locations |

---

## Tech Stack

**Frontend:** React 19, Vite, React Router, Axios, Google Maps API, Tailwind CSS

**Backend:** Express 5, PostgreSQL (pg), JWT, bcrypt, Multer, SSLCommerz, node-cron

**Database:** PostgreSQL with PostGIS and pgcrypto extensions
