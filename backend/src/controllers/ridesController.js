const { pool } = require("../db");

// GET /api/rides/nearby?lat=&lng=&radius=
// Driver: get all open ride requests within radius (meters, default 5km)
const getNearbyRequests = async (req, res) => {
  const driverId = req.user.id;
  const { lat, lng, radius = 5000 } = req.query;

  if (!lat || !lng) {
    return res.status(400).json({ error: "lat and lng query params are required" });
  }

  try {
    const result = await pool.query(
      `SELECT
        rr.request_id,
        rr.status,
        rr.pickup_addr,
        rr.dropoff_addr,
        rr.estimated_fare,
        rr.estimated_distance_km,
        rr.estimated_duration_min,
        rr.created_at,
        u.name AS rider_name,
        ST_Y(rr.pickup_location::geometry)  AS pickup_lat,
        ST_X(rr.pickup_location::geometry)  AS pickup_lng,
        ST_Y(rr.dropoff_location::geometry) AS dropoff_lat,
        ST_X(rr.dropoff_location::geometry) AS dropoff_lng,
        ROUND(ST_Distance(
          rr.pickup_location,
          ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
        )::numeric, 0) AS distance_meters
      FROM ride_requests rr
      JOIN riders r ON rr.rider_id = r.rider_id
      JOIN users u ON r.rider_id = u.user_id
      WHERE
        rr.status = 'open'
        AND ST_DWithin(
          rr.pickup_location,
          ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
          $3
        )
        AND rr.request_id NOT IN (
          SELECT request_id FROM driver_responses
          WHERE driver_id = $4
        )
      ORDER BY distance_meters ASC`,
      [parseFloat(lat), parseFloat(lng), parseFloat(radius), driverId]
    );

    res.json({ requests: result.rows });
  } catch (err) {
    console.error("getNearbyRequests error:", err);
    res.status(500).json({ error: "Failed to fetch nearby requests" });
  }
};

// PUT /api/rides/driver-location
// Driver: update their GPS position and set status to online
const updateDriverLocation = async (req, res) => {
  const driverId = req.user.id;
  const { lat, lng } = req.body;

  if (lat == null || lng == null) {
    return res.status(400).json({ error: "lat and lng are required" });
  }

  try {
    await pool.query(
      `UPDATE drivers
       SET current_location = ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
           status = 'online'
       WHERE driver_id = $3`,
      [parseFloat(lat), parseFloat(lng), driverId]
    );
    res.json({ message: "Location updated" });
  } catch (err) {
    console.error("updateDriverLocation error:", err);
    res.status(500).json({ error: "Failed to update location" });
  }
};

// POST /api/rides/request
// Rider: create a new ride request
const createRideRequest = async (req, res) => {
  const riderId = req.user.id;
  const { pickup_lat, pickup_lng, pickup_addr, dropoff_lat, dropoff_lng, dropoff_addr } = req.body;

  if (!pickup_lat || !pickup_lng || !pickup_addr || !dropoff_lat || !dropoff_lng || !dropoff_addr) {
    return res.status(400).json({ error: "pickup and dropoff location and address are required" });
  }

  try {
    // Calculate a simple estimated fare: base 50 BDT + 15 BDT per km
    const distResult = await pool.query(
      `SELECT ROUND((ST_Distance(
        ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
        ST_SetSRID(ST_MakePoint($4, $3), 4326)::geography
      ) / 1000)::numeric, 2) AS distance_km`,
      [parseFloat(pickup_lat), parseFloat(pickup_lng), parseFloat(dropoff_lat), parseFloat(dropoff_lng)]
    );

    const distanceKm = parseFloat(distResult.rows[0].distance_km);
    const estimatedFare = Math.round(50 + distanceKm * 15);
    const estimatedDuration = Math.round(distanceKm * 3); // ~3 min per km

    const result = await pool.query(
      `INSERT INTO ride_requests
        (rider_id, pickup_location, pickup_addr, dropoff_location, dropoff_addr,
         status, estimated_fare, estimated_distance_km, estimated_duration_min, expires_at)
       VALUES
        ($1,
         ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography, $4,
         ST_SetSRID(ST_MakePoint($6, $5), 4326)::geography, $7,
         'open', $8, $9, $10,
         NOW() + INTERVAL '5 minutes')
       RETURNING request_id, status, pickup_addr, dropoff_addr,
                 estimated_fare, estimated_distance_km, estimated_duration_min, created_at`,
      [
        riderId,
        parseFloat(pickup_lat), parseFloat(pickup_lng), pickup_addr,
        parseFloat(dropoff_lat), parseFloat(dropoff_lng), dropoff_addr,
        estimatedFare, distanceKm, estimatedDuration,
      ]
    );

    res.status(201).json({ request: result.rows[0] });
  } catch (err) {
    console.error("createRideRequest error:", err);
    res.status(500).json({ error: "Failed to create ride request" });
  }
};

// POST /api/rides/requests/:id/accept
// Driver: accept a ride request (handles race condition via transaction + FOR UPDATE)
const acceptRequest = async (req, res) => {
  const driverId = req.user.id;
  const { id: requestId } = req.params;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Lock the row — if another driver already accepted, status won't be 'open'
    const lockResult = await client.query(
      `SELECT rr.*, u.name AS rider_name
       FROM ride_requests rr
       JOIN riders r ON rr.rider_id = r.rider_id
       JOIN users u ON r.rider_id = u.user_id
       WHERE rr.request_id = $1 AND rr.status = 'open'
       FOR UPDATE`,
      [requestId]
    );

    if (lockResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Ride request is no longer available" });
    }

    const request = lockResult.rows[0];

    // Record driver response
    await client.query(
      `INSERT INTO driver_responses (request_id, driver_id, response_status)
       VALUES ($1, $2, 'accepted')
       ON CONFLICT (request_id, driver_id) DO UPDATE SET response_status = 'accepted', response_time = NOW()`,
      [requestId, driverId]
    );

    // Update request status to matched
    await client.query(
      `UPDATE ride_requests SET status = 'matched' WHERE request_id = $1`,
      [requestId]
    );

    // Create the ride
    const rideResult = await client.query(
      `INSERT INTO rides
        (request_id, rider_id, driver_id, pickup_location, pickup_addr,
         dropoff_location, dropoff_addr, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'driver_assigned')
       RETURNING ride_id, status, pickup_addr, dropoff_addr`,
      [
        requestId, request.rider_id, driverId,
        request.pickup_location, request.pickup_addr,
        request.dropoff_location, request.dropoff_addr,
      ]
    );

    // Set driver to busy
    await client.query(
      `UPDATE drivers SET status = 'busy' WHERE driver_id = $1`,
      [driverId]
    );

    await client.query("COMMIT");

    res.json({
      message: "Ride accepted",
      ride: rideResult.rows[0],
      rider_name: request.rider_name,
      estimated_fare: request.estimated_fare,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("acceptRequest error:", err);
    res.status(500).json({ error: "Failed to accept ride request" });
  } finally {
    client.release();
  }
};

// POST /api/rides/requests/:id/reject
// Driver: reject a ride request
const rejectRequest = async (req, res) => {
  const driverId = req.user.id;
  const { id: requestId } = req.params;

  try {
    await pool.query(
      `INSERT INTO driver_responses (request_id, driver_id, response_status)
       VALUES ($1, $2, 'rejected')
       ON CONFLICT (request_id, driver_id) DO UPDATE SET response_status = 'rejected', response_time = NOW()`,
      [requestId, driverId]
    );
    res.json({ message: "Ride request rejected" });
  } catch (err) {
    console.error("rejectRequest error:", err);
    res.status(500).json({ error: "Failed to reject ride request" });
  }
};

// PUT /api/rides/:id/status
// Driver: update ride status (started / completed)
const updateRideStatus = async (req, res) => {
  const driverId = req.user.id;
  const { id: rideId } = req.params;
  const { status } = req.body;

  const allowed = ["started", "completed", "cancelled"];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: `Status must be one of: ${allowed.join(", ")}` });
  }

  try {
    const result = await pool.query(
      `UPDATE rides
       SET
         status = $1,
         started_at   = CASE WHEN $1 = 'started'   THEN NOW() ELSE started_at   END,
         completed_at = CASE WHEN $1 = 'completed'  THEN NOW() ELSE completed_at END
       WHERE ride_id = $2 AND driver_id = $3
       RETURNING *`,
      [status, rideId, driverId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Ride not found or not yours" });
    }

    // If completed, free the driver back to online
    if (status === "completed" || status === "cancelled") {
      await pool.query(
        `UPDATE drivers SET status = 'online' WHERE driver_id = $1`,
        [driverId]
      );
    }

    res.json({ ride: result.rows[0] });
  } catch (err) {
    console.error("updateRideStatus error:", err);
    res.status(500).json({ error: "Failed to update ride status" });
  }
};

// GET /api/rides/fare-estimate?pickup_lat=&pickup_lng=&dropoff_lat=&dropoff_lng=
// Rider: preview fare without creating a request
const getFareEstimate = async (req, res) => {
  const { pickup_lat, pickup_lng, dropoff_lat, dropoff_lng } = req.query;

  if (!pickup_lat || !pickup_lng || !dropoff_lat || !dropoff_lng) {
    return res.status(400).json({ error: "pickup and dropoff lat/lng are required" });
  }

  try {
    const distResult = await pool.query(
      `SELECT ROUND((ST_Distance(
        ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
        ST_SetSRID(ST_MakePoint($4, $3), 4326)::geography
      ) / 1000)::numeric, 2) AS distance_km`,
      [parseFloat(pickup_lat), parseFloat(pickup_lng),
       parseFloat(dropoff_lat), parseFloat(dropoff_lng)]
    );

    const distanceKm = parseFloat(distResult.rows[0].distance_km);
    const estimatedFare = Math.round(50 + distanceKm * 15);
    const estimatedDuration = Math.round(distanceKm * 3);

    res.json({
      distance_km: distanceKm,
      estimated_fare: estimatedFare,
      estimated_duration_min: estimatedDuration,
    });
  } catch (err) {
    console.error("getFareEstimate error:", err);
    res.status(500).json({ error: "Failed to calculate fare estimate" });
  }
};

// GET /api/rides/rider/active
// Rider: poll for current ride request / ride status
const getRiderActiveRide = async (req, res) => {
  const riderId = req.user.id;

  try {
    // 1. Find the latest open or matched request for this rider
    const reqResult = await pool.query(
      `SELECT
        rr.request_id, rr.status, rr.pickup_addr, rr.dropoff_addr,
        rr.estimated_fare, rr.estimated_distance_km, rr.estimated_duration_min,
        rr.created_at, rr.expires_at,
        ST_Y(rr.pickup_location::geometry) AS pickup_lat,
        ST_X(rr.pickup_location::geometry) AS pickup_lng,
        ST_Y(rr.dropoff_location::geometry) AS dropoff_lat,
        ST_X(rr.dropoff_location::geometry) AS dropoff_lng
      FROM ride_requests rr
      WHERE rr.rider_id = $1 AND rr.status IN ('open', 'matched')
      ORDER BY rr.created_at DESC
      LIMIT 1`,
      [riderId]
    );

    // No active request — check for recently completed ride (for fare summary)
    if (reqResult.rows.length === 0) {
      const completedResult = await pool.query(
        `SELECT r.ride_id, r.status, r.pickup_addr, r.dropoff_addr,
                r.started_at, r.completed_at, r.total_fare,
                u.name AS driver_name,
                rr.estimated_fare, rr.estimated_distance_km, rr.estimated_duration_min
        FROM rides r
        JOIN users u ON r.driver_id = u.user_id
        JOIN ride_requests rr ON r.request_id = rr.request_id
        WHERE r.rider_id = $1 AND r.status = 'completed'
          AND r.completed_at > NOW() - INTERVAL '2 minutes'
        ORDER BY r.completed_at DESC
        LIMIT 1`,
        [riderId]
      );

      if (completedResult.rows.length > 0) {
        return res.json({ phase: "completed", ride: completedResult.rows[0] });
      }
      return res.json({ phase: "idle" });
    }

    const request = reqResult.rows[0];

    // 2. If open but expired, auto-expire it
    if (request.status === "open" && new Date(request.expires_at) < new Date()) {
      await pool.query(
        `UPDATE ride_requests SET status = 'expired' WHERE request_id = $1`,
        [request.request_id]
      );
      return res.json({ phase: "idle", message: "Your ride request expired. No drivers found." });
    }

    // 3. If open and not expired -> still searching
    if (request.status === "open") {
      return res.json({ phase: "searching", request });
    }

    // 4. If matched -> get the ride row + driver info
    const rideResult = await pool.query(
      `SELECT r.ride_id, r.status, r.started_at, r.completed_at,
              r.pickup_addr, r.dropoff_addr,
              u.name AS driver_name, u.phone_number AS driver_phone,
              d.rating_avg AS driver_rating,
              v.model AS vehicle_model, v.plate_number AS vehicle_plate,
              rr.estimated_fare, rr.estimated_distance_km, rr.estimated_duration_min
      FROM rides r
      JOIN users u ON r.driver_id = u.user_id
      JOIN drivers d ON r.driver_id = d.driver_id
      LEFT JOIN vehicles v ON r.vehicle_id = v.vehicle_id
      JOIN ride_requests rr ON r.request_id = rr.request_id
      WHERE r.request_id = $1`,
      [request.request_id]
    );

    if (rideResult.rows.length === 0) {
      return res.json({ phase: "searching", request });
    }

    const ride = rideResult.rows[0];

    if (ride.status === "completed") {
      return res.json({ phase: "completed", ride, request });
    }
    if (ride.status === "cancelled") {
      return res.json({ phase: "idle", message: "Ride was cancelled" });
    }

    const phase = ride.status === "started" ? "in_progress" : "matched";
    return res.json({ phase, ride, request });
  } catch (err) {
    console.error("getRiderActiveRide error:", err);
    res.status(500).json({ error: "Failed to get active ride status" });
  }
};

// POST /api/rides/requests/:id/cancel
// Rider: cancel their own pending ride request
const cancelRideRequest = async (req, res) => {
  const riderId = req.user.id;
  const { id: requestId } = req.params;

  try {
    const result = await pool.query(
      `UPDATE ride_requests
       SET status = 'cancelled'
       WHERE request_id = $1 AND rider_id = $2 AND status = 'open'
       RETURNING request_id, status`,
      [requestId, riderId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Request not found, not yours, or no longer open",
      });
    }

    res.json({ message: "Ride request cancelled", request: result.rows[0] });
  } catch (err) {
    console.error("cancelRideRequest error:", err);
    res.status(500).json({ error: "Failed to cancel ride request" });
  }
};

module.exports = {
  getNearbyRequests,
  updateDriverLocation,
  createRideRequest,
  acceptRequest,
  rejectRequest,
  updateRideStatus,
  getFareEstimate,
  getRiderActiveRide,
  cancelRideRequest,
};
