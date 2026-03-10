const { pool } = require("../db");

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

/**
 * Call Google Directions API and return parsed route data.
 * @param {object} params - { origin_lat, origin_lng, dest_lat, dest_lng, travel_mode }
 * @returns {object|null} Parsed directions result
 */
async function fetchGoogleDirections({ origin_lat, origin_lng, dest_lat, dest_lng, travel_mode = "driving" }) {
  if (!GOOGLE_MAPS_API_KEY) {
    throw new Error("GOOGLE_MAPS_API_KEY is not configured in backend .env");
  }

  const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
  url.searchParams.set("origin", `${origin_lat},${origin_lng}`);
  url.searchParams.set("destination", `${dest_lat},${dest_lng}`);
  url.searchParams.set("mode", travel_mode.toLowerCase());
  url.searchParams.set("key", GOOGLE_MAPS_API_KEY);
  url.searchParams.set("alternatives", "false");

  const response = await fetch(url.toString());
  const data = await response.json();

  if (data.status !== "OK" || !data.routes || data.routes.length === 0) {
    console.error("Google Directions API error:", data.status, data.error_message);
    return null;
  }

  const route = data.routes[0];
  const leg = route.legs[0];

  return {
    overview_polyline: route.overview_polyline.points,
    distance_meters: leg.distance.value,
    distance_text: leg.distance.text,
    duration_seconds: leg.duration.value,
    duration_text: leg.duration.text,
    start_location: leg.start_location,
    end_location: leg.end_location,
    bounds: {
      northeast: route.bounds.northeast,
      southwest: route.bounds.southwest,
    },
    steps: leg.steps.map((step) => ({
      instruction: step.html_instructions,
      distance_text: step.distance.text,
      duration_text: step.duration.text,
      travel_mode: step.travel_mode,
      start_location: step.start_location,
      end_location: step.end_location,
      polyline: step.polyline.points,
    })),
  };
}

/**
 * POST /api/rides/directions
 * Get route directions between two points (preview, before booking).
 * Body: { origin_lat, origin_lng, dest_lat, dest_lng, travel_mode? }
 */
const getDirections = async (req, res) => {
  const { origin_lat, origin_lng, dest_lat, dest_lng, travel_mode = "driving" } = req.body;

  if (!origin_lat || !origin_lng || !dest_lat || !dest_lng) {
    return res.status(400).json({ error: "origin and destination lat/lng are required" });
  }

  try {
    const directions = await fetchGoogleDirections({
      origin_lat: parseFloat(origin_lat),
      origin_lng: parseFloat(origin_lng),
      dest_lat: parseFloat(dest_lat),
      dest_lng: parseFloat(dest_lng),
      travel_mode,
    });

    if (!directions) {
      return res.status(404).json({ error: "No route found between the given locations" });
    }

    res.json({ route: directions });
  } catch (err) {
    console.error("getDirections error:", err);
    res.status(500).json({ error: "Failed to get directions", details: err.message });
  }
};

/**
 * Store a route in the ride_routes table.
 * @param {object} params - { ride_id?, request_id?, directions, travel_mode, is_reroute }
 * @returns {object} The created route row
 */
async function storeRoute({ ride_id = null, request_id = null, directions, travel_mode = "DRIVING", is_reroute = false }) {
  const result = await pool.query(
    `INSERT INTO ride_routes
      (ride_id, request_id, overview_polyline,
       distance_meters, distance_text, duration_seconds, duration_text,
       start_location_lat, start_location_lng,
       end_location_lat, end_location_lng,
       bounds_ne_lat, bounds_ne_lng, bounds_sw_lat, bounds_sw_lng,
       travel_mode, is_reroute)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
     RETURNING *`,
    [
      ride_id,
      request_id,
      directions.overview_polyline,
      directions.distance_meters,
      directions.distance_text,
      directions.duration_seconds,
      directions.duration_text,
      directions.start_location.lat,
      directions.start_location.lng,
      directions.end_location.lat,
      directions.end_location.lng,
      directions.bounds.northeast.lat,
      directions.bounds.northeast.lng,
      directions.bounds.southwest.lat,
      directions.bounds.southwest.lng,
      travel_mode,
      is_reroute,
    ]
  );
  return result.rows[0];
}

/**
 * GET /api/rides/:id/route
 * Get the latest stored route for a ride.
 */
const getRouteForRide = async (req, res) => {
  const { id: rideId } = req.params;

  try {
    const result = await pool.query(
      `SELECT * FROM ride_routes
       WHERE ride_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [rideId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "No route found for this ride" });
    }

    res.json({ route: result.rows[0] });
  } catch (err) {
    console.error("getRouteForRide error:", err);
    res.status(500).json({ error: "Failed to get route", details: err.message });
  }
};

/**
 * POST /api/rides/:id/reroute
 * Recalculate route from driver's current position to ride destination.
 * Body: { driver_lat, driver_lng }
 */
const rerouteRide = async (req, res) => {
  const { id: rideId } = req.params;
  const { driver_lat, driver_lng } = req.body;

  if (!driver_lat || !driver_lng) {
    return res.status(400).json({ error: "driver_lat and driver_lng are required" });
  }

  try {
    // Get the ride's dropoff location
    const rideResult = await pool.query(
      `SELECT ST_Y(dropoff_location::geometry) AS dropoff_lat,
              ST_X(dropoff_location::geometry) AS dropoff_lng
       FROM rides WHERE ride_id = $1`,
      [rideId]
    );

    if (rideResult.rows.length === 0) {
      return res.status(404).json({ error: "Ride not found" });
    }

    const { dropoff_lat, dropoff_lng } = rideResult.rows[0];

    const directions = await fetchGoogleDirections({
      origin_lat: parseFloat(driver_lat),
      origin_lng: parseFloat(driver_lng),
      dest_lat: parseFloat(dropoff_lat),
      dest_lng: parseFloat(dropoff_lng),
      travel_mode: "driving",
    });

    if (!directions) {
      return res.status(404).json({ error: "No route found for reroute" });
    }

    const routeRow = await storeRoute({
      ride_id: rideId,
      directions,
      travel_mode: "DRIVING",
      is_reroute: true,
    });

    res.json({ route: routeRow, directions });
  } catch (err) {
    console.error("rerouteRide error:", err);
    res.status(500).json({ error: "Failed to reroute", details: err.message });
  }
};

/**
 * Check if a point is off the encoded polyline by more than threshold meters.
 * Uses a simple approach: decode polyline, find closest point, check distance.
 */
function isOffRoute(driverLat, driverLng, encodedPolyline, thresholdMeters = 50) {
  const points = decodePolyline(encodedPolyline);
  let minDistance = Infinity;

  for (const point of points) {
    const d = haversineDistance(driverLat, driverLng, point.lat, point.lng);
    if (d < minDistance) {
      minDistance = d;
    }
    if (minDistance <= thresholdMeters) return false; // early exit
  }

  return minDistance > thresholdMeters;
}

/**
 * Decode a Google Maps encoded polyline string into an array of { lat, lng }.
 */
function decodePolyline(encoded) {
  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return points;
}

/**
 * Haversine distance between two points in meters.
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * POST /api/rides/:id/check-route
 * Check if driver is off-route and trigger reroute if needed.
 * Body: { driver_lat, driver_lng }
 */
const checkAndReroute = async (req, res) => {
  const { id: rideId } = req.params;
  const { driver_lat, driver_lng } = req.body;

  if (!driver_lat || !driver_lng) {
    return res.status(400).json({ error: "driver_lat and driver_lng are required" });
  }

  try {
    // Get latest route for this ride
    const routeResult = await pool.query(
      `SELECT overview_polyline, duration_seconds, distance_meters
       FROM ride_routes
       WHERE ride_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [rideId]
    );

    if (routeResult.rows.length === 0) {
      return res.json({ on_route: true, rerouted: false, message: "No route to check against" });
    }

    const { overview_polyline, duration_seconds, distance_meters } = routeResult.rows[0];
    const offRoute = isOffRoute(parseFloat(driver_lat), parseFloat(driver_lng), overview_polyline, 100);

    if (!offRoute) {
      // Calculate approximate remaining distance/time
      const points = decodePolyline(overview_polyline);
      let closestIdx = 0;
      let minDist = Infinity;
      for (let i = 0; i < points.length; i++) {
        const d = haversineDistance(parseFloat(driver_lat), parseFloat(driver_lng), points[i].lat, points[i].lng);
        if (d < minDist) {
          minDist = d;
          closestIdx = i;
        }
      }
      const progressRatio = closestIdx / Math.max(points.length - 1, 1);
      const remainingSeconds = Math.round(duration_seconds * (1 - progressRatio));
      const remainingMeters = Math.round(distance_meters * (1 - progressRatio));

      return res.json({
        on_route: true,
        rerouted: false,
        remaining_seconds: remainingSeconds,
        remaining_meters: remainingMeters,
        remaining_text: formatDuration(remainingSeconds),
        progress_percent: Math.round(progressRatio * 100),
      });
    }

    // Off route — trigger reroute
    const rideResult = await pool.query(
      `SELECT ST_Y(dropoff_location::geometry) AS dropoff_lat,
              ST_X(dropoff_location::geometry) AS dropoff_lng
       FROM rides WHERE ride_id = $1`,
      [rideId]
    );

    if (rideResult.rows.length === 0) {
      return res.status(404).json({ error: "Ride not found" });
    }

    const { dropoff_lat, dropoff_lng } = rideResult.rows[0];

    const directions = await fetchGoogleDirections({
      origin_lat: parseFloat(driver_lat),
      origin_lng: parseFloat(driver_lng),
      dest_lat: parseFloat(dropoff_lat),
      dest_lng: parseFloat(dropoff_lng),
      travel_mode: "driving",
    });

    if (!directions) {
      return res.json({ on_route: false, rerouted: false, message: "Reroute failed — no route found" });
    }

    const routeRow = await storeRoute({
      ride_id: rideId,
      directions,
      travel_mode: "DRIVING",
      is_reroute: true,
    });

    res.json({
      on_route: false,
      rerouted: true,
      route: routeRow,
      directions,
      remaining_seconds: directions.duration_seconds,
      remaining_meters: directions.distance_meters,
      remaining_text: directions.duration_text,
      progress_percent: 0,
    });
  } catch (err) {
    console.error("checkAndReroute error:", err);
    res.status(500).json({ error: "Failed to check route", details: err.message });
  }
};

/**
 * Format seconds into a human-readable duration string.
 */
function formatDuration(seconds) {
  if (seconds < 60) return "< 1 min";
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours} h ${mins} min`;
  return `${mins} min`;
}

module.exports = {
  getDirections,
  getRouteForRide,
  rerouteRide,
  checkAndReroute,
  fetchGoogleDirections,
  storeRoute,
  decodePolyline,
  isOffRoute,
};
