const { pool } = require("../db");
const { fetchGoogleDirections, storeRoute } = require("./directionsController");

// Haversine straight-line distance in km (fallback when Google API fails)
function haversineDistanceKm(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 100) / 100;
}

// Estimated duration in minutes (~3 min/km)
function estimateDurationMin(distanceKm) {
  return Math.round(distanceKm * 3);
}

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
        rr.created_at,
        rr.vehicle_type,
        u.first_name || ' ' || u.last_name AS rider_name,
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
        AND (
          rr.vehicle_type IS NULL
          OR rr.vehicle_type IN (
            SELECT v.type FROM vehicles v
            WHERE v.driver_id = $4 AND v.is_active = true
          )
        )
      ORDER BY distance_meters ASC`,
      [parseFloat(lat), parseFloat(lng), parseFloat(radius), driverId]
    );

    res.json({ requests: result.rows });
  } catch (err) {
    console.error("getNearbyRequests error:", err);
    res.status(500).json({ error: "Failed to fetch nearby requests", details: err.message });
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
           status = CASE WHEN status = 'offline' THEN 'online' ELSE status END
       WHERE driver_id = $3`,
      [parseFloat(lat), parseFloat(lng), driverId]
    );

    // Log location during active rides for tracking
    await pool.query(
      `INSERT INTO ride_tracking_logs (ride_id, driver_id, location)
       SELECT ride_id, $1, ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography
       FROM rides WHERE driver_id = $1 AND status IN ('driver_assigned', 'started') LIMIT 1`,
      [driverId, parseFloat(lat), parseFloat(lng)]
    );

    res.json({ message: "Location updated" });
  } catch (err) {
    console.error("updateDriverLocation error:", err);
    res.status(500).json({ error: "Failed to update location", details: err.message });
  }
};

// POST /api/rides/request
// Rider: create a new ride request
const createRideRequest = async (req, res) => {
  const riderId = req.user.id;
  const { pickup_lat, pickup_lng, pickup_addr, dropoff_lat, dropoff_lng, dropoff_addr, promo_code, vehicle_type, scheduled_time } = req.body;

  if (!pickup_lat || !pickup_lng || !pickup_addr || !dropoff_lat || !dropoff_lng || !dropoff_addr) {
    return res.status(400).json({ error: "pickup and dropoff location and address are required" });
  }

  // Validate scheduled_time if provided
  const isScheduled = !!scheduled_time;
  let scheduledDate = null;
  if (isScheduled) {
    scheduledDate = new Date(scheduled_time);
    if (isNaN(scheduledDate.getTime())) {
      return res.status(400).json({ error: "Invalid scheduled_time format" });
    }
    const now = new Date();
    const minTime = new Date(now.getTime() + 30 * 60 * 1000); // 30 min from now
    const maxTime = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000); // 15 days from now
    if (scheduledDate < minTime) {
      return res.status(400).json({ error: "Scheduled time must be at least 30 minutes from now" });
    }
    if (scheduledDate > maxTime) {
      return res.status(400).json({ error: "Scheduled time cannot be more than 15 days in advance" });
    }
  }

  try {
    // Ensure rider profile exists (may be missing if user registered
    // before rider profile creation was added to the registration flow)
    await pool.query(
      "INSERT INTO riders (rider_id) VALUES ($1) ON CONFLICT DO NOTHING",
      [riderId]
    );

    // Check scheduled ride limit (max 3 concurrent scheduled rides)
    if (isScheduled) {
      const scheduledCount = await pool.query(
        `SELECT COUNT(*)::int AS cnt FROM ride_requests
         WHERE rider_id = $1 AND status = 'scheduled'`,
        [riderId]
      );
      if (scheduledCount.rows[0].cnt >= 3) {
        return res.status(400).json({ error: "You can have at most 3 scheduled rides at a time" });
      }
    }

    // Get actual route distance from Google Directions API
    const route = await fetchGoogleDirections({
      origin_lat: pickup_lat, origin_lng: pickup_lng,
      dest_lat: dropoff_lat, dest_lng: dropoff_lng,
    });

    let distanceKm;
    if (route) {
      distanceKm = parseFloat((route.distance_meters / 1000).toFixed(2));
    } else {
      // Fallback to straight-line if Google API fails
      distanceKm = haversineDistanceKm(
        parseFloat(pickup_lat), parseFloat(pickup_lng),
        parseFloat(dropoff_lat), parseFloat(dropoff_lng)
      );
    }

    const fareResult = await pool.query(
      `SELECT estimate_fare($1::numeric) AS estimated_fare`,
      [distanceKm]
    );

    let estimatedFare = parseFloat(fareResult.rows[0].estimated_fare);
    const estimatedDuration = estimateDurationMin(distanceKm);

    // Apply vehicle type fare multiplier
    const vType = vehicle_type || 'economy';
    const multiplierResult = await pool.query(
      `SELECT fare_multiplier FROM vehicle_types WHERE type_key = $1`,
      [vType]
    );
    const fareMultiplier = multiplierResult.rows.length > 0
      ? parseFloat(multiplierResult.rows[0].fare_multiplier)
      : 1.0;
    estimatedFare = Math.round(estimatedFare * fareMultiplier * 100) / 100;

    // Surge pricing check
    const surgeResult = await pool.query(
      `SELECT surge_factor, surge_range_km, surge_density_threshold FROM pricing_standards LIMIT 1`
    );
    if (surgeResult.rows.length > 0) {
      const { surge_factor, surge_range_km, surge_density_threshold } = surgeResult.rows[0];
      const densityResult = await pool.query(
        `SELECT COUNT(*)::int AS nearby_requests
         FROM ride_requests
         WHERE status = 'open'
           AND created_at > NOW() - INTERVAL '15 minutes'
           AND ST_DWithin(
             pickup_location,
             ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
             $3 * 1000
           )`,
        [parseFloat(pickup_lat), parseFloat(pickup_lng), parseFloat(surge_range_km)]
      );
      const nearbyRequests = densityResult.rows[0].nearby_requests;
      const area = Math.PI * Math.pow(parseFloat(surge_range_km), 2);
      const density = nearbyRequests / area;
      if (density >= parseFloat(surge_density_threshold)) {
        estimatedFare = Math.round(estimatedFare * parseFloat(surge_factor) * 100) / 100;
      }
    }

    const reqStatus = isScheduled ? 'scheduled' : 'open';
    const expiresAt = isScheduled ? null : new Date(Date.now() + 5 * 60 * 1000);

    const result = await pool.query(
      `INSERT INTO ride_requests
        (rider_id, pickup_location, pickup_addr, dropoff_location, dropoff_addr,
         status, estimated_fare, estimated_distance_km, expires_at, scheduled_time, promo_code, vehicle_type)
       VALUES
        ($1,
         ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography, $4,
         ST_SetSRID(ST_MakePoint($6, $5), 4326)::geography, $7,
         $8, $9, $10, $11, $12, $13, $14)
       RETURNING request_id, status, pickup_addr, dropoff_addr,
                 estimated_fare, estimated_distance_km, created_at, vehicle_type, scheduled_time`,
      [
        riderId,
        parseFloat(pickup_lat), parseFloat(pickup_lng), pickup_addr,
        parseFloat(dropoff_lat), parseFloat(dropoff_lng), dropoff_addr,
        reqStatus, estimatedFare, distanceKm, expiresAt, scheduledDate,
        promo_code || null, vType,
      ]
    );

    res.status(201).json({
      request: { ...result.rows[0], estimated_duration_min: estimatedDuration },
    });
  } catch (err) {
    console.error("createRideRequest error:", err);
    res.status(500).json({
      error: "Failed to create ride request",
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
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
      `SELECT rr.*, u.first_name || ' ' || u.last_name AS rider_name
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

    // Enforce vehicle type match — driver must have an active vehicle of the requested type
    const requestedType = request.vehicle_type || null;
    const vehicleQuery = requestedType
      ? `SELECT vehicle_id FROM vehicles WHERE driver_id = $1 AND is_active = true AND type = $2 LIMIT 1`
      : `SELECT vehicle_id FROM vehicles WHERE driver_id = $1 AND is_active = true LIMIT 1`;
    const vehicleParams = requestedType ? [driverId, requestedType] : [driverId];
    const vehicleResult = await client.query(vehicleQuery, vehicleParams);

    if (vehicleResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: requestedType
          ? `This ride requires a ${requestedType} vehicle. Your active vehicle does not match.`
          : "You must have an active vehicle to accept rides.",
      });
    }

    const vehicleId = vehicleResult.rows[0].vehicle_id;

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
        (request_id, rider_id, driver_id, vehicle_id, pickup_location,
         pickup_addr, dropoff_location, dropoff_addr, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'driver_assigned')
       RETURNING ride_id, status, rider_id,
         ST_Y(pickup_location::geometry) AS pickup_lat, ST_X(pickup_location::geometry) AS pickup_lng,
         ST_Y(dropoff_location::geometry) AS dropoff_lat, ST_X(dropoff_location::geometry) AS dropoff_lng`,
      [
        requestId, request.rider_id, driverId, vehicleId,
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

    // Compute and store route directions (non-blocking — don't fail ride acceptance)
    // Route: driver's current location → pickup → dropoff (multi-leg)
    let routeData = null;
    try {
      // Get driver's current location and ride coordinates
      const coordResult = await pool.query(
        `SELECT
          ST_Y(d.current_location::geometry) AS driver_lat,
          ST_X(d.current_location::geometry) AS driver_lng,
          ST_Y(rr.pickup_location::geometry) AS pickup_lat,
          ST_X(rr.pickup_location::geometry) AS pickup_lng,
          ST_Y(rr.dropoff_location::geometry) AS dropoff_lat,
          ST_X(rr.dropoff_location::geometry) AS dropoff_lng
        FROM ride_requests rr, drivers d
        WHERE rr.request_id = $1 AND d.driver_id = $2`,
        [requestId, driverId]
      );
      if (coordResult.rows.length > 0) {
        const coords = coordResult.rows[0];
        const directions = await fetchGoogleDirections({
          origin_lat: parseFloat(coords.driver_lat),
          origin_lng: parseFloat(coords.driver_lng),
          dest_lat: parseFloat(coords.dropoff_lat),
          dest_lng: parseFloat(coords.dropoff_lng),
          waypoints: [{ lat: parseFloat(coords.pickup_lat), lng: parseFloat(coords.pickup_lng) }],
          travel_mode: "driving",
        });
        if (directions) {
          routeData = await storeRoute({
            ride_id: rideResult.rows[0].ride_id,
            request_id: requestId,
            directions,
            travel_mode: "DRIVING",
          });
        }
      }
    } catch (routeErr) {
      console.error("Non-critical: failed to store route on accept:", routeErr.message);
    }

    res.json({
      message: "Ride accepted",
      ride: {
        ...rideResult.rows[0],
        pickup_addr: request.pickup_addr,
        dropoff_addr: request.dropoff_addr,
      },
      rider_name: request.rider_name,
      estimated_fare: request.estimated_fare,
      route: routeData,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("acceptRequest error:", err);
    res.status(500).json({ error: "Failed to accept ride request", details: err.message });
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
    res.status(500).json({ error: "Failed to reject ride request", details: err.message });
  }
};

// PUT /api/rides/:id/status
// Driver: update ride status (started / completed)
// When completed, calls process_ride_payment stored procedure
const updateRideStatus = async (req, res) => {
  const driverId = req.user.id;
  const { id: rideId } = req.params;
  const { status } = req.body;

  const allowed = ["started", "completed"];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: `Status must be one of: ${allowed.join(", ")}` });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Proximity enforcement for starting a ride (must be within 50m of pickup)
    if (status === "started") {
      const proxResult = await client.query(
        `SELECT ST_Distance(d.current_location, r.pickup_location) AS distance_meters
         FROM drivers d, rides r
         WHERE d.driver_id = $1 AND r.ride_id = $2`,
        [driverId, rideId]
      );
      if (proxResult.rows.length > 0 && proxResult.rows[0].distance_meters > 50) {
        await client.query("ROLLBACK");
        return res.status(403).json({
          error: `You must be within 50 meters of the pickup location to start the ride. Current distance: ${Math.round(proxResult.rows[0].distance_meters)}m`,
        });
      }
    }

    // Proximity enforcement for completing a ride (both driver and rider must be within 50m of dropoff)
    if (status === "completed") {
      const proxResult = await client.query(
        `SELECT
           ST_Distance(d.current_location, r.dropoff_location) AS driver_distance,
           CASE WHEN ri.current_location IS NOT NULL
             THEN ST_Distance(ri.current_location, r.dropoff_location)
             ELSE NULL END AS rider_distance
         FROM rides r
         JOIN drivers d ON d.driver_id = r.driver_id
         JOIN riders ri ON ri.rider_id = r.rider_id
         WHERE r.ride_id = $1`,
        [rideId]
      );
      if (proxResult.rows.length > 0) {
        const { driver_distance, rider_distance } = proxResult.rows[0];
        if (driver_distance > 50) {
          await client.query("ROLLBACK");
          return res.status(403).json({
            error: `You must be within 50 meters of the dropoff location to complete the ride. Current distance: ${Math.round(driver_distance)}m`,
          });
        }
        if (rider_distance !== null && rider_distance > 50) {
          await client.query("ROLLBACK");
          return res.status(403).json({
            error: `The rider must be within 50 meters of the dropoff location to complete the ride. Rider distance: ${Math.round(rider_distance)}m`,
          });
        }
      }
    }

    // Update ride status (trigger handles timestamps and driver status)
    const result = await client.query(
      `UPDATE rides
       SET status = $1
       WHERE ride_id = $2 AND driver_id = $3
       RETURNING *`,
      [status, rideId, driverId]
    );

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Ride not found or not yours" });
    }

    let paymentDetails = null;

    // Process payment when ride is completed
    if (status === "completed") {
      // Get the promo code from the ride request
      const promoResult = await client.query(
        `SELECT rr.promo_code FROM ride_requests rr
         JOIN rides r ON r.request_id = rr.request_id
         WHERE r.ride_id = $1`,
        [rideId]
      );
      const promoCode = promoResult.rows[0]?.promo_code || null;

      // Call the stored procedure for payment processing
      const payResult = await client.query(
        `CALL process_ride_payment($1, $2, NULL, NULL, NULL, NULL, NULL, NULL)`,
        [rideId, promoCode]
      );

      paymentDetails = {
        total_fare: payResult.rows[0].p_total_fare,
        discount: payResult.rows[0].p_discount,
        platform_fee: payResult.rows[0].p_platform_fee,
        driver_earning: payResult.rows[0].p_driver_earning,
        invoice_id: payResult.rows[0].p_invoice_id,
        rider_balance_after: payResult.rows[0].p_rider_balance,
      };
    }

    await client.query("COMMIT");

    // Re-fetch the updated ride to include financial columns
    const updatedRide = await pool.query(
      `SELECT * FROM rides WHERE ride_id = $1`,
      [rideId]
    );

    res.json({
      ride: updatedRide.rows[0],
      payment: paymentDetails,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("updateRideStatus error:", err);

    // Surface insufficient balance errors clearly
    if (err.message?.includes("Insufficient wallet balance")) {
      return res.status(402).json({
        error: "Insufficient wallet balance",
        details: err.message,
      });
    }

    res.status(500).json({ error: "Failed to update ride status", details: err.message });
  } finally {
    client.release();
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
    // Get actual route distance from Google Directions API
    const route = await fetchGoogleDirections({
      origin_lat: pickup_lat, origin_lng: pickup_lng,
      dest_lat: dropoff_lat, dest_lng: dropoff_lng,
    });

    let distanceKm;
    if (route) {
      distanceKm = parseFloat((route.distance_meters / 1000).toFixed(2));
    } else {
      // Fallback to straight-line if Google API fails
      distanceKm = haversineDistanceKm(
        parseFloat(pickup_lat), parseFloat(pickup_lng),
        parseFloat(dropoff_lat), parseFloat(dropoff_lng)
      );
    }

    const fareResult = await pool.query(
      `SELECT estimate_fare($1::numeric) AS estimated_fare`,
      [distanceKm]
    );

    res.json({
      distance_km: distanceKm,
      estimated_fare: fareResult.rows[0].estimated_fare,
      estimated_duration_min: estimateDurationMin(distanceKm),
      route_distance_text: route?.distance_text || null,
      route_duration_text: route?.duration_text || null,
    });
  } catch (err) {
    console.error("getFareEstimate error:", err);
    res.status(500).json({ error: "Failed to calculate fare estimate", details: err.message });
  }
};

// GET /api/rides/rider/active
// Rider: poll for current ride request / ride status
const getRiderActiveRide = async (req, res) => {
  const riderId = req.user.id;

  try {
    // 1. Find the latest open, matched, or scheduled request for this rider
    const reqResult = await pool.query(
      `SELECT
        rr.request_id, rr.status, rr.pickup_addr, rr.dropoff_addr,
        rr.estimated_fare, rr.estimated_distance_km,
        rr.created_at, rr.expires_at, rr.scheduled_time,
        ST_Y(rr.pickup_location::geometry) AS pickup_lat,
        ST_X(rr.pickup_location::geometry) AS pickup_lng,
        ST_Y(rr.dropoff_location::geometry) AS dropoff_lat,
        ST_X(rr.dropoff_location::geometry) AS dropoff_lng
      FROM ride_requests rr
      WHERE rr.rider_id = $1 AND rr.status IN ('open', 'matched', 'scheduled')
      ORDER BY rr.created_at DESC
      LIMIT 1`,
      [riderId]
    );

    // No active request — check for recently completed ride (for fare summary)
    if (reqResult.rows.length === 0) {
      const completedResult = await pool.query(
        `SELECT ride_id, status, pickup_addr, dropoff_addr,
                started_at, completed_at, final_fare,
                driver_earning, platform_fee,
                driver_id, driver_name, estimated_fare, estimated_distance_km
         FROM v_ride_details
         WHERE rider_id = $1 AND status = 'completed'
           AND completed_at > NOW() - INTERVAL '2 minutes'
         ORDER BY completed_at DESC
         LIMIT 1`,
        [riderId]
      );

      if (completedResult.rows.length > 0) {
        // Fetch rider wallet balance
        const walletResult = await pool.query(
          "SELECT balance FROM wallets WHERE owner_id = $1",
          [riderId]
        );
        return res.json({
          phase: "completed",
          ride: completedResult.rows[0],
          wallet_balance: walletResult.rows[0]?.balance || 0,
        });
      }
      return res.json({ phase: "idle" });
    }

    const request = reqResult.rows[0];

    // 2. If scheduled — rider is free to browse, just acknowledge it
    if (request.status === "scheduled") {
      return res.json({ phase: "scheduled", request });
    }

    // 3. If open but expired, auto-expire it
    if (request.status === "open" && new Date(request.expires_at) < new Date()) {
      await pool.query(
        `UPDATE ride_requests SET status = 'expired' WHERE request_id = $1`,
        [request.request_id]
      );
      return res.json({ phase: "idle", message: "Your ride request expired. No drivers found." });
    }

    // 4. If open and not expired -> still searching
    if (request.status === "open") {
      return res.json({ phase: "searching", request });
    }

    // 4. If matched -> get the ride row + driver info
    const rideResult = await pool.query(
      `SELECT ride_id, status, started_at, completed_at,
              pickup_addr, dropoff_addr,
              driver_id, driver_name, driver_phone,
              driver_rating,
              vehicle_model, vehicle_plate,
              estimated_fare, estimated_distance_km,
              final_fare, driver_earning, platform_fee
       FROM v_ride_details
       WHERE request_id = $1`,
      [request.request_id]
    );

    if (rideResult.rows.length === 0) {
      return res.json({ phase: "searching", request });
    }

    const ride = rideResult.rows[0];

    if (ride.status === "completed") {
      // Fetch rider wallet balance
      const walletResult = await pool.query(
        "SELECT balance FROM wallets WHERE owner_id = $1",
        [riderId]
      );
      return res.json({
        phase: "completed",
        ride,
        request,
        wallet_balance: walletResult.rows[0]?.balance || 0,
      });
    }
    if (ride.status === "cancelled") {
      return res.json({ phase: "idle", message: "Ride was cancelled" });
    }

    const phase = ride.status === "started" ? "in_progress" : "matched";

    // Fetch driver's live location for rider tracking
    let driver_location = null;
    if (ride.driver_id) {
      const driverLocResult = await pool.query(
        `SELECT ST_Y(current_location::geometry) AS driver_lat,
                ST_X(current_location::geometry) AS driver_lng
         FROM drivers WHERE driver_id = $1 AND current_location IS NOT NULL`,
        [ride.driver_id]
      );
      if (driverLocResult.rows.length > 0) {
        driver_location = {
          lat: parseFloat(driverLocResult.rows[0].driver_lat),
          lng: parseFloat(driverLocResult.rows[0].driver_lng),
        };
      }
    }

    return res.json({ phase, ride, request, driver_location });
  } catch (err) {
    console.error("getRiderActiveRide error:", err);
    res.status(500).json({ error: "Failed to get active ride status", details: err.message });
  }
};

// GET /api/rides/driver/active
// Driver: check for an active ride (state restoration on login/refresh)
const getDriverActiveRide = async (req, res) => {
  const driverId = req.user.id;

  try {
    const result = await pool.query(
      `SELECT v.ride_id, v.request_id, v.rider_id, v.driver_id, v.status,
              v.pickup_addr, v.dropoff_addr, v.rider_name, v.estimated_fare,
              ST_Y(r.pickup_location::geometry) AS pickup_lat,
              ST_X(r.pickup_location::geometry) AS pickup_lng,
              ST_Y(r.dropoff_location::geometry) AS dropoff_lat,
              ST_X(r.dropoff_location::geometry) AS dropoff_lng
       FROM v_ride_details v
       JOIN rides r ON r.ride_id = v.ride_id
       WHERE v.driver_id = $1 AND v.status IN ('driver_assigned', 'started')
       ORDER BY v.ride_id DESC
       LIMIT 1`,
      [driverId]
    );

    if (result.rows.length === 0) {
      return res.json({ active: false });
    }

    const row = result.rows[0];

    res.json({
      active: true,
      ride: {
        ride_id: row.ride_id,
        status: row.status,
        pickup_addr: row.pickup_addr,
        dropoff_addr: row.dropoff_addr,
        rider_id: row.rider_id,
        pickup_lat: row.pickup_lat,
        pickup_lng: row.pickup_lng,
        dropoff_lat: row.dropoff_lat,
        dropoff_lng: row.dropoff_lng,
      },
      rider_name: row.rider_name,
      estimated_fare: row.estimated_fare,
    });
  } catch (err) {
    console.error("getDriverActiveRide error:", err);
    res.status(500).json({ error: "Failed to get active ride", details: err.message });
  }
};

// POST /api/rides/requests/:id/cancel
// Rider: cancel their own pending ride request
const cancelRideRequest = async (req, res) => {
  const riderId = req.user.id;
  const { id: requestId } = req.params;

  try {
    // Fetch the request first to check scheduled_time
    const reqCheck = await pool.query(
      `SELECT request_id, status, scheduled_time, estimated_fare
       FROM ride_requests
       WHERE request_id = $1 AND rider_id = $2 AND status IN ('open', 'scheduled')`,
      [requestId, riderId]
    );

    if (reqCheck.rows.length === 0) {
      return res.status(404).json({
        error: "Request not found, not yours, or no longer cancellable",
      });
    }

    const request = reqCheck.rows[0];

    // Check if scheduled ride is within 30-min window (paid cancellation)
    let cancellationFee = 0;
    if (request.status === "scheduled" && request.scheduled_time) {
      const msUntilScheduled = new Date(request.scheduled_time).getTime() - Date.now();
      if (msUntilScheduled < 30 * 60 * 1000) {
        // Within 30 minutes — apply cancellation fee
        const pricingResult = await pool.query(
          `SELECT cancellation_pct FROM pricing_standards LIMIT 1`
        );
        const pct = pricingResult.rows[0]?.cancellation_pct
          ? parseFloat(pricingResult.rows[0].cancellation_pct)
          : 0;
        cancellationFee = Math.round(parseFloat(request.estimated_fare) * (pct / 100) * 100) / 100;

        if (cancellationFee > 0) {
          // Deduct fee from rider wallet
          await pool.query(
            `UPDATE wallets SET balance = balance - $1 WHERE owner_id = $2`,
            [cancellationFee, riderId]
          );
        }
      }
    }

    // Cancel the request
    const result = await pool.query(
      `UPDATE ride_requests SET status = 'cancelled'
       WHERE request_id = $1
       RETURNING request_id, status`,
      [requestId]
    );

    res.json({
      message: cancellationFee > 0
        ? `Ride cancelled. A fee of ${cancellationFee} BDT was charged.`
        : "Ride request cancelled",
      request: result.rows[0],
      cancellation_fee: cancellationFee,
    });
  } catch (err) {
    console.error("cancelRideRequest error:", err);
    res.status(500).json({ error: "Failed to cancel ride request", details: err.message });
  }
};

// GET /api/rides/rider/scheduled
// Rider: get all scheduled rides
const getRiderScheduledRides = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT request_id, status, pickup_addr, dropoff_addr,
              estimated_fare, estimated_distance_km,
              scheduled_time, vehicle_type, created_at
       FROM ride_requests
       WHERE rider_id = $1 AND status = 'scheduled'
       ORDER BY scheduled_time ASC`,
      [req.user.id]
    );
    res.json({ requests: result.rows });
  } catch (err) {
    console.error("getRiderScheduledRides error:", err);
    res.status(500).json({ error: "Failed to get scheduled rides", details: err.message });
  }
};

// GET /api/rides/rider/history
const getRiderHistory = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ride_id, request_id, rider_id, driver_id, status,
              started_at, completed_at, final_fare,
              pickup_addr, dropoff_addr, estimated_fare, estimated_distance_km,
              driver_name, driver_phone, driver_rating, vehicle_model, vehicle_plate
       FROM v_ride_details
       WHERE rider_id = $1
       ORDER BY completed_at DESC NULLS LAST, started_at DESC NULLS LAST
       LIMIT 50`,
      [req.user.id]
    );
    res.json({ rides: result.rows });
  } catch (err) {
    console.error("getRiderHistory error:", err);
    res.status(500).json({ error: "Failed to get ride history", details: err.message });
  }
};

// GET /api/rides/driver/history
const getDriverHistory = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ride_id, request_id, rider_id, driver_id, status,
              started_at, completed_at, final_fare,
              driver_earning, platform_fee,
              pickup_addr, dropoff_addr, estimated_fare, estimated_distance_km,
              rider_name, vehicle_model, vehicle_plate
       FROM v_ride_details
       WHERE driver_id = $1
       ORDER BY completed_at DESC NULLS LAST, started_at DESC NULLS LAST
       LIMIT 50`,
      [req.user.id]
    );
    res.json({ rides: result.rows });
  } catch (err) {
    console.error("getDriverHistory error:", err);
    res.status(500).json({ error: "Failed to get ride history", details: err.message });
  }
};

// GET /api/rides/:id/detail
const getRideDetail = async (req, res) => {
  try {
    const rideId = req.params.id;
    const userId = req.user.id;

    // Fetch ride details — only if user is a participant
    const rideResult = await pool.query(
      `SELECT ride_id, request_id, rider_id, driver_id, status,
              started_at, completed_at, final_fare, driver_earning, platform_fee,
              pickup_addr, dropoff_addr, estimated_fare, estimated_distance_km,
              driver_name, driver_phone, rider_name, driver_rating,
              vehicle_model, vehicle_plate
       FROM v_ride_details
       WHERE ride_id = $1 AND (rider_id = $2 OR driver_id = $2)`,
      [rideId, userId]
    );

    if (rideResult.rows.length === 0) {
      return res.status(404).json({ error: "Ride not found" });
    }

    // Fetch chat messages
    const messagesResult = await pool.query(
      `SELECT m.message_id, m.sender_id, m.content, m.created_at,
              u.first_name || ' ' || u.last_name AS sender_name
       FROM chat_messages m
       JOIN users u ON u.user_id = m.sender_id
       WHERE m.ride_id = $1
       ORDER BY m.created_at ASC`,
      [rideId]
    );

    // Fetch ratings
    const ratingsResult = await pool.query(
      `SELECT r.rating_id, r.score, r.comment, r.created_at,
              r.rater_user_id, r.ratee_user_id,
              u.first_name || ' ' || u.last_name AS rater_name
       FROM ratings r
       JOIN users u ON u.user_id = r.rater_user_id
       WHERE r.ride_id = $1`,
      [rideId]
    );

    res.json({
      ride: rideResult.rows[0],
      messages: messagesResult.rows,
      ratings: ratingsResult.rows,
    });
  } catch (err) {
    console.error("getRideDetail error:", err);
    res.status(500).json({ error: "Failed to get ride detail", details: err.message });
  }
};

// GET /api/rides/vehicle-types — public endpoint
const getVehicleTypes = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT type_key, label, description, fare_multiplier, capacity
       FROM vehicle_types ORDER BY sort_order`
    );
    res.json({ vehicle_types: result.rows });
  } catch (err) {
    console.error("getVehicleTypes error:", err);
    res.status(500).json({ error: "Failed to get vehicle types" });
  }
};

// GET /api/rides/driver/readiness — check if driver can go online
const checkDriverReadiness = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT vehicle_id, model, type FROM vehicles
       WHERE driver_id = $1 AND is_active = true`,
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(400).json({
        ready: false,
        error: "You must have an active vehicle before going online. Go to My Vehicles to set one.",
      });
    }
    res.json({ ready: true, active_vehicle: result.rows[0] });
  } catch (err) {
    console.error("checkDriverReadiness error:", err);
    res.status(500).json({ error: "Failed to check readiness" });
  }
};

// PUT /api/rides/rider-location
// Rider: update their GPS position (for proximity enforcement on ride completion)
const updateRiderLocation = async (req, res) => {
  const riderId = req.user.id;
  const { lat, lng } = req.body;

  if (lat == null || lng == null) {
    return res.status(400).json({ error: "lat and lng are required" });
  }

  try {
    await pool.query(
      `UPDATE riders SET current_location = ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
       WHERE rider_id = $3`,
      [parseFloat(lat), parseFloat(lng), riderId]
    );
    res.json({ message: "Location updated" });
  } catch (err) {
    console.error("updateRiderLocation error:", err);
    res.status(500).json({ error: "Failed to update rider location", details: err.message });
  }
};

// GET /api/rides/:id/cancel-fee
// Preview cancellation fee before confirming
const getCancellationFee = async (req, res) => {
  const userId = req.user.id;
  const { id: rideId } = req.params;

  try {
    const rideResult = await pool.query(
      `SELECT r.ride_id, r.rider_id, r.driver_id, r.status, rr.estimated_fare
       FROM rides r
       JOIN ride_requests rr ON r.request_id = rr.request_id
       WHERE r.ride_id = $1`,
      [rideId]
    );

    if (rideResult.rows.length === 0) {
      return res.status(404).json({ error: "Ride not found" });
    }

    const ride = rideResult.rows[0];
    if (ride.rider_id !== userId && ride.driver_id !== userId) {
      return res.status(403).json({ error: "You are not a participant in this ride" });
    }

    if (!["driver_assigned", "started"].includes(ride.status)) {
      return res.status(400).json({ error: "Ride is not in a cancellable state" });
    }

    const pricingResult = await pool.query(
      `SELECT cancellation_pct FROM pricing_standards LIMIT 1`
    );
    const cancellationPct = pricingResult.rows.length > 0
      ? parseFloat(pricingResult.rows[0].cancellation_pct)
      : 10.0;

    const estimatedFare = parseFloat(ride.estimated_fare) || 0;
    const fee = Math.round(estimatedFare * cancellationPct / 100 * 100) / 100;

    res.json({ fee, cancellation_pct: cancellationPct });
  } catch (err) {
    console.error("getCancellationFee error:", err);
    res.status(500).json({ error: "Failed to get cancellation fee", details: err.message });
  }
};

// POST /api/rides/:id/cancel
// Paid cancellation for rider or driver after driver is assigned
const cancelRide = async (req, res) => {
  const userId = req.user.id;
  const { id: rideId } = req.params;
  const { reason } = req.body;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Lock ride row and fetch details
    const rideResult = await client.query(
      `SELECT r.ride_id, r.rider_id, r.driver_id, r.status, rr.estimated_fare
       FROM rides r
       JOIN ride_requests rr ON r.request_id = rr.request_id
       WHERE r.ride_id = $1
       FOR UPDATE OF r`,
      [rideId]
    );

    if (rideResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Ride not found" });
    }

    const ride = rideResult.rows[0];

    // 2. Validate participant
    if (ride.rider_id !== userId && ride.driver_id !== userId) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "You are not a participant in this ride" });
    }

    // 3. Validate status
    if (!["driver_assigned", "started"].includes(ride.status)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Ride is not in a cancellable state" });
    }

    // 4. Get cancellation percentage
    const pricingResult = await client.query(
      `SELECT cancellation_pct FROM pricing_standards LIMIT 1`
    );
    const cancellationPct = pricingResult.rows.length > 0
      ? parseFloat(pricingResult.rows[0].cancellation_pct)
      : 10.0;

    const estimatedFare = parseFloat(ride.estimated_fare) || 0;
    const fee = Math.round(estimatedFare * cancellationPct / 100 * 100) / 100;

    const canceller = userId;
    const otherParty = ride.rider_id === userId ? ride.driver_id : ride.rider_id;

    // 5. Check canceller wallet balance
    const walletResult = await client.query(
      `SELECT balance FROM wallets WHERE owner_id = $1 FOR UPDATE`,
      [canceller]
    );

    if (walletResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Wallet not found" });
    }

    if (parseFloat(walletResult.rows[0].balance) < fee) {
      await client.query("ROLLBACK");
      return res.status(402).json({
        error: "Insufficient wallet balance for cancellation fee",
        details: `Required: ${fee} BDT, Available: ${walletResult.rows[0].balance} BDT`,
      });
    }

    // 6. Create invoice for cancellation fee
    const invoiceResult = await client.query(
      `INSERT INTO invoices (base_fare, tax, total_amount, status)
       VALUES ($1, 0, $1, 'paid')
       RETURNING invoice_id`,
      [fee]
    );
    const invoiceId = invoiceResult.rows[0].invoice_id;

    // 7. Debit canceller wallet
    await client.query(
      `UPDATE wallets SET balance = balance - $1 WHERE owner_id = $2`,
      [fee, canceller]
    );

    // 8. Credit other party wallet
    await client.query(
      `UPDATE wallets SET balance = balance + $1 WHERE owner_id = $2`,
      [fee, otherParty]
    );

    // 9. Transaction records
    await client.query(
      `INSERT INTO transactions (wallet_owner_id, amount, currency, status, type, invoice_id)
       VALUES ($1, $2, 'BDT', 'succeeded', 'cancellation_fee', $3)`,
      [canceller, fee, invoiceId]
    );
    await client.query(
      `INSERT INTO transactions (wallet_owner_id, amount, currency, status, type, invoice_id)
       VALUES ($1, $2, 'BDT', 'succeeded', 'cancellation_fee', $3)`,
      [otherParty, fee, invoiceId]
    );

    // 10. Insert ride_cancellations record
    await client.query(
      `INSERT INTO ride_cancellations (ride_id, cancelled_by_user_id, reason, cancellation_fee, cancellation_type, invoice_id)
       VALUES ($1, $2, $3, $4, 'unilateral', $5)`,
      [rideId, canceller, reason || null, fee, invoiceId]
    );

    // 11. Update ride status — trigger handles driver→online
    await client.query(
      `UPDATE rides SET status = 'cancelled' WHERE ride_id = $1`,
      [rideId]
    );

    // 12. Notifications
    const cancellerName = req.user.name || "A participant";
    await client.query(
      `INSERT INTO notifications (user_id, title, body) VALUES ($1, $2, $3)`,
      [canceller, "Ride Cancelled", `You cancelled the ride. A fee of ${fee} BDT was charged.`]
    );
    await client.query(
      `INSERT INTO notifications (user_id, title, body) VALUES ($1, $2, $3)`,
      [otherParty, "Ride Cancelled", `${cancellerName} cancelled the ride. You received ${fee} BDT as compensation.`]
    );

    await client.query("COMMIT");

    // Fetch updated wallet balance for the canceller
    const updatedWallet = await pool.query(
      `SELECT balance FROM wallets WHERE owner_id = $1`,
      [canceller]
    );

    res.json({
      cancellation: {
        ride_id: rideId,
        fee,
        invoice_id: invoiceId,
        reason: reason || null,
        cancelled_by: canceller,
        wallet_balance: parseFloat(updatedWallet.rows[0]?.balance || 0),
      },
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("cancelRide error:", err);
    res.status(500).json({ error: "Failed to cancel ride", details: err.message });
  } finally {
    client.release();
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
  getDriverActiveRide,
  cancelRideRequest,
  getRiderScheduledRides,
  getCancellationFee,
  cancelRide,
  getRiderHistory,
  getDriverHistory,
  getRideDetail,
  getVehicleTypes,
  checkDriverReadiness,
  updateRiderLocation,
};
