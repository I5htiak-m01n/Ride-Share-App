# CSE216 Project Checklist — Ride-Share App Coverage

---

## 1. User Authentication

**Status: Fulfilled**

Authentication is fully custom — no third-party auth services.

- **Middleware:** `authenticateToken` in [auth.js](backend/src/middleware/auth.js) verifies JWT signature, checks expiration, validates user exists in DB, and checks ban status.
- **Tokens:** Access token (1 hour) + Refresh token (7 days) with rotation on refresh.
- **Password:** Hashed with bcrypt (10 salt rounds) — never stored in plaintext.
- **Role-based access:** `authorizeRoles()` middleware restricts endpoints by role (rider, driver, admin, support).

**Key files:**
- [authController.js](backend/src/controllers/authController.js) — register, login, logout, refreshToken
- [auth.js middleware](backend/src/middleware/auth.js) — authenticateToken, authorizeRoles

---

## 2. Authentication Validation on Every Page

**Status: Fulfilled**

Every route file applies `authenticateToken` middleware. Only intentionally public endpoints are exempt:

| Route File | Auth Coverage |
|---|---|
| [auth.js](backend/src/routes/auth.js) | Partial — register/login/refresh are public; profile/logout protected |
| [rides.js](backend/src/routes/rides.js) | All protected except `/vehicle-types` (public reference data) |
| [payment.js](backend/src/routes/payment.js) | Init protected; SSLCommerz callback URLs are public (server-to-server) |
| All other 12 route files | **Fully protected** — every route uses `authenticateToken` |

**Frontend:** React app stores JWT in memory, attaches `Authorization: Bearer <token>` to every API call via Axios interceptor in [AuthContext.jsx](frontend/src/context/AuthContext.jsx). Expired tokens trigger automatic refresh.

---

## 3. Explicit Transaction Control

**Status: Fulfilled**

Every DML operation uses explicit `BEGIN` / `COMMIT` / `ROLLBACK` with proper error handling. **34 functions across 13 controllers** use transactions.

| Controller | Functions with Transactions |
|---|---|
| [authController.js](backend/src/controllers/authController.js) | register, login, logout, refreshToken |
| [ridesController.js](backend/src/controllers/ridesController.js) | updateDriverLocation, createRideRequest, acceptRequest, updateRideStatus, cancelRide |
| [paymentController.js](backend/src/controllers/paymentController.js) | initPayment, paymentSuccess, paymentIPN |
| [walletController.js](backend/src/controllers/walletController.js) | topUp, withdraw |
| [driversController.js](backend/src/controllers/driversController.js) | addDocument, deleteDocument, submitOnboarding, addVehicle |
| [chatController.js](backend/src/controllers/chatController.js) | sendMessage, sendCancelRequest, respondToCancelRequest, retractCancelRequest |
| [ratingsController.js](backend/src/controllers/ratingsController.js) | submitRating |
| [adminController.js](backend/src/controllers/adminController.js) | verifyDocument, approveOnboarding, rejectOnboarding, respondToTicket, setTicketPriority, assignTicketToStaff |
| [promoController.js](backend/src/controllers/promoController.js) | createPromo |
| [complaintController.js](backend/src/controllers/complaintController.js) | fileComplaint |
| [notificationController.js](backend/src/controllers/notificationController.js) | markAsRead, markAllRead |
| [supportStaffController.js](backend/src/controllers/supportStaffController.js) | respondToTicket |
| [vehicleController.js](backend/src/controllers/vehicleController.js) | setActiveVehicle |

**Pattern used:**
```js
const client = await pool.connect();
try {
  await client.query("BEGIN");
  // ... DML operations ...
  await client.query("COMMIT");
} catch (err) {
  await client.query("ROLLBACK");
  // error response
} finally {
  client.release();
}
```

---

## 4. Use of Triggers

**Status: Fulfilled — 5 triggers**

All triggers are in [triggers.sql](db/triggers.sql).

| # | Trigger | Event | Purpose |
|---|---|---|---|
| 1 | `trg_ride_status_change` | BEFORE UPDATE of `status` on `rides` | When ride becomes `completed` or `cancelled`, sets driver status to `online`. Also auto-sets `started_at` and `completed_at` timestamps. |
| 2 | `trg_user_created` | AFTER INSERT on `users` | Auto-creates rider/driver profile row and wallet on registration. Eliminates manual INSERTs in backend. |
| 3 | `trg_log_login` | AFTER INSERT on `refresh_tokens` | Logs a login event into `login_logs` whenever a new session is created. |
| 4 | `trg_payment_completed` | AFTER UPDATE of `invoice_id` on `rides` | When payment is processed (invoice_id set), sends notifications to both rider and driver. |
| 5 | `trg_update_rating_avg` | AFTER INSERT on `ratings` | Recalculates the ratee's `rating_avg` in the appropriate profile table (riders or drivers). |

**Why each trigger is appropriate:**
- **#1** — Prevents driver status from going stale if backend crashes after ride completion.
- **#2** — Guarantees profile + wallet exist for every user; impossible to forget in new registration flows.
- **#3** — Audit logging that can't be bypassed by application code.
- **#4** — Notification side-effect decoupled from payment procedure, fires automatically.
- **#5** — Rating average stays consistent regardless of which code path inserts a rating.

---

## 5. Use of Functions

**Status: Fulfilled — 3 functions**

All functions are in [functions.sql](db/functions.sql).

| Function | Returns | Purpose |
|---|---|---|
| `estimate_fare(distance_km)` | `integer` | Calculates estimated fare in BDT using tiered pricing from `pricing_standards` table. Used when rider creates a ride request. |
| `apply_promo_discount(fare, promo_code, rider_id)` | `TABLE(discounted_fare, discount_applied, promo_id, promo_valid)` | Validates promo code (expiry, usage limits, per-rider limits), calculates discount, returns adjusted fare. Called by `process_ride_payment` procedure. |
| `auto_expire_ride_requests()` | `integer` | Bulk-expires all open ride requests past their expiry timestamp. Called by backend scheduler ([scheduler.js](backend/src/scheduler.js)) on a timed interval. Returns count of expired requests. |

**Why functions (not procedures):** Each returns a computed value — fare estimate, discount calculation, expiry count — which is the correct use case for SQL functions.

---

## 6. Use of Procedures

**Status: Fulfilled — 2 procedures**

All procedures are in [procedures.sql](db/procedures.sql).

### Procedure 1: `process_ride_payment`
**Called from:** [paymentController.js](backend/src/controllers/paymentController.js)

Multi-step payment workflow that modifies 5 tables in one operation:
1. Locks ride and wallet rows (`FOR UPDATE`)
2. Gets estimated fare from ride request
3. Applies promo discount via `apply_promo_discount()`
4. Computes platform fee (15%) and driver earning (85%)
5. Checks rider wallet has sufficient balance
6. Creates invoice (`status = 'paid'`)
7. Debits rider wallet, credits driver wallet
8. Creates transaction records for both parties
9. Records promo redemption if applicable
10. Updates ride with financial data

### Procedure 2: `process_mutual_cancellation`
**Called from:** [chatController.js](backend/src/controllers/chatController.js) — `respondToCancelRequest()`

Multi-step cancellation that modifies 3 tables:
1. Records cancellation in `ride_cancellations` (no fee for mutual)
2. Updates ride status to `cancelled` (trigger auto-frees driver)
3. Inserts notifications for both rider and driver

**Why procedures (not functions):** Both perform multi-table DML with no meaningful return value. This matches the procedure use case of multi-step workflows modifying several tables.

---

## 7. Use of Complex Queries

**Status: Fulfilled — 20+ complex queries**

A complex query joins multiple tables and/or uses aggregation functions.

### Query 1: Top Drivers Analytics
**File:** [analyticsController.js](backend/src/controllers/analyticsController.js) — `getTopDrivers()`
```sql
SELECT d.driver_id, u.first_name || ' ' || u.last_name AS name,
       COUNT(*) AS total_rides, SUM(r.driver_earning) AS total_earnings,
       AVG(r.total_fare) AS avg_fare
FROM rides r
JOIN drivers d ON r.driver_id = d.driver_id
JOIN users u ON d.driver_id = u.user_id
WHERE r.status = 'completed'
GROUP BY d.driver_id, u.first_name, u.last_name
ORDER BY total_earnings DESC LIMIT 20
```
**Complexity:** 3-table JOIN + GROUP BY + 3 aggregation functions (COUNT, SUM, AVG)

### Query 2: Promo Performance Analytics
**File:** [analyticsController.js](backend/src/controllers/analyticsController.js) — `getPromoPerformance()`
```sql
SELECT p.*, COUNT(pr.redemption_id) AS times_used,
       SUM(r.total_fare) AS total_revenue
FROM promos p
LEFT JOIN promo_redemptions pr ON p.promo_id = pr.promo_id
LEFT JOIN rides r ON pr.ride_id = r.ride_id
GROUP BY p.promo_id
ORDER BY times_used DESC
```
**Complexity:** 3-table LEFT JOIN + GROUP BY + 2 aggregation functions (COUNT, SUM)

### Query 3: Driver Earnings Summary (View)
**File:** [views.sql](db/views.sql) — `v_driver_earnings_summary`
```sql
SELECT driver_id, DATE(completed_at) AS ride_date,
       COUNT(*), SUM(total_fare), SUM(driver_earning), SUM(platform_fee),
       ROUND(AVG(total_fare), 2) AS avg_fare,
       SUM(SUM(driver_earning)) OVER (
         PARTITION BY driver_id ORDER BY DATE(completed_at)
       ) AS cumulative_earnings
FROM rides WHERE status = 'completed'
GROUP BY driver_id, DATE(completed_at)
```
**Complexity:** GROUP BY + 5 aggregation functions + window function (cumulative running total)

### Query 4: Consolidated Ride View
**File:** [views.sql](db/views.sql) — `v_ride_details`

6-table JOIN (rides, ride_requests, users x2, drivers, vehicles) providing a reusable consolidated view used by ride history, active ride polling, and completed ride summary.

### Query 5: Dashboard Statistics
**File:** [adminController.js](backend/src/controllers/adminController.js) — `getDashboardStats()`

11 COUNT subqueries across users, rides, support_tickets, driver_documents, complaints, promos — aggregation over the entire system state.

### Additional complex queries:
- **getNearbyRequests** — geospatial JOIN with `ST_DWithin()` + vehicle type filtering
- **getEarningsSummary** — COUNT + SUM + AVG over completed rides
- **getRideDetail** — 7+ table JOIN with aggregation subqueries
- **getAssignedTickets** — JOIN + COUNT subquery for response counts
- **getMyRating** — AVG(score) + COUNT(*) aggregation

---

## 8. Appropriate Use of Database Features

All database features serve genuine needs — no unnecessary triggers, procedures, or functions:

| Feature | Justification |
|---|---|
| **Triggers** | Automate side-effects that must happen regardless of code path (driver status reset, profile creation, login logging, payment notifications, rating averages). |
| **Functions** | Each returns a computed value (fare estimate, promo discount, expiry count) — correct use of functions. |
| **Procedures** | Both encapsulate multi-table DML workflows (payment, cancellation) — correct use of procedures. |
| **Views** | Eliminate duplicated JOIN patterns; earnings view uses window functions that would be error-prone to repeat. |
| **Transactions** | Every state-changing operation is wrapped in BEGIN/COMMIT/ROLLBACK. |

Dead code (unused procedures, views) was identified and removed during development.

---

## Summary

| Checklist Item | Status | Details |
|---|---|---|
| 1. User Authentication | **Fulfilled** | Custom JWT + bcrypt |
| 2. Auth on Every Page | **Fulfilled** | 15/15 route files protected |
| 3. Explicit Transactions | **Fulfilled** | 34 functions across 13 controllers |
| 4. Triggers | **Fulfilled** | 5 triggers |
| 5. Functions | **Fulfilled** | 3 functions |
| 6. Procedures | **Fulfilled** | 2 procedures |
| 7. Complex Queries | **Fulfilled** | 20+ queries with JOINs + aggregation |
| 8. Appropriate Use | **Fulfilled** | No unnecessary features |
| 9. Code Understanding | **N/A** | Evaluation-time requirement |
