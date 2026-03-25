#!/usr/bin/env node

/**
 * Ride Simulation Test Location Override Script
 *
 * Purpose: Manually update driver/rider locations in the database for testing
 * Test accounts are identified by email convention: test-*@example.com
 *
 * Usage:
 *   node update-test-location.js <email> <latitude> <longitude>
 *   node update-test-location.js test-driver-@example.com 23.8103 90.4125
 *   node update-test-location.js test-rider-@example.com 23.8200 90.4300 --batch pickup
 */

const { Pool } = require('pg');
require('dotenv').config();

// Database configuration from .env
// Use DATABASE_URL if available (standard PostgreSQL format), otherwise fall back to individual vars
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || `postgresql://${process.env.DB_USER || 'postgres'}:${process.env.DB_PASS || 'postgres'}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || 'ridesharev2'}`,
});

/**
 * Detect if input is PostGIS hex WKB format
 * Hex strings are typically 130+ characters and contain only hex digits
 */
function isHexWKBFormat(input) {
  if (typeof input !== 'string') return false;
  // PostGIS WKB hex format is typically 130+ chars of hex digits
  return input.length > 64 && /^[0-9a-fA-F]+$/.test(input);
}

/**
 * Determine actual user role by checking which table they exist in
 * More reliable than relying on user.role column which might be 'mixed'
 */
async function getUserRole(pool, userId) {
  try {
    const driverResult = await pool.query('SELECT driver_id FROM drivers WHERE driver_id = $1', [userId]);
    if (driverResult.rows.length > 0) {
      return 'driver';
    }

    const riderResult = await pool.query('SELECT rider_id FROM riders WHERE rider_id = $1', [userId]);
    if (riderResult.rows.length > 0) {
      return 'rider';
    }

    return null; // User has neither driver nor rider profile
  } catch (err) {
    throw new Error(`Failed to determine user role: ${err.message}`);
  }
}

/**
 * Parse command-line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    printUsage();
    process.exit(1);
  }

  const email = args[0];
  const locInput = args[1]; // Can be lat (number) or hex string
  const thirdArg = args[2];

  // Determine if we're using hex format or lat/lng format
  const isHex = isHexWKBFormat(locInput);

  let lat, lng, hexWKB;
  if (isHex) {
    // Hex format: email and hex only, no lng
    hexWKB = locInput;
    lat = null;
    lng = null;
  } else {
    // Lat/lng format: email, lat, lng
    lat = parseFloat(locInput);
    lng = parseFloat(thirdArg);
  }

  return {
    email,
    lat,
    lng,
    hexWKB,
    isHexFormat: isHex,
    batchMode: args.includes('--batch'),
    batchType: args[args.indexOf('--batch') + 1] || null,
    interval: args.includes('--interval') ? parseFloat(args[args.indexOf('--interval') + 1]) : 1000,
  };
}

/**
 * Print usage information
 */
function printUsage() {
  console.log(`
Ride Simulation - Test Location Override Script
================================================

Usage:
  node update-test-location.js <email> <latitude> <longitude> [options]
  node update-test-location.js <email> <postgis-hex-wkb>

Arguments:
  email              Test account email (e.g., test-driver-@example.com)
  latitude           New latitude coordinate (e.g., 23.8103) - OR -
  longitude          New longitude coordinate (e.g., 90.4125)
  postgis-hex-wkb    PostGIS WKB in hex format (auto-detected if >64 hex chars)

Options:
  --batch pickup    Batch move to pickup location (marks as in-transit)
  --batch dropoff   Batch move to dropoff location (marks as near destination)
  --interval N      Interval between moves in milliseconds (default: 1000)

Examples:
  # Set driver location using lat/lng coordinates
  node update-test-location.js test-driver-@example.com 23.8103 90.4125

  # Set driver location using PostGIS WKB hex format (auto-detected)
  node update-test-location.js test-driver-@example.com "0101000020E610000000000000C0405240000000008C294C40"

  # Move rider to pickup location with interpolation
  node update-test-location.js test-rider-@example.com 23.8200 90.4300 --batch pickup

  # Move driver slowly with 2-second intervals
  node update-test-location.js test-driver-@example.com 23.8300 90.4400 --batch dropoff --interval 2000

Note: Test accounts are identified by email convention (test-*@example.com).
      Location updates override browser geolocation until next natural update.
  `);
}

/**
 * Update location in database using PostGIS format
 * Supports both lat/lng coordinates and raw PostGIS WKB hex format
 */
async function updateLocation(userId, latitude, longitude, role, hexWKB = null) {
  const table = role === 'driver' ? 'drivers' : 'riders';
  const column = role === 'driver' ? 'driver_id' : 'rider_id';

  try {
    let query, params;

    if (hexWKB) {
      // Use raw PostGIS WKB hex format
      // ST_GeomFromWKB converts hex to geography
      query = `UPDATE ${table}
       SET current_location = ST_GeomFromWKB(decode($2, 'hex'), 4326)::geography
       WHERE ${column} = $1
       RETURNING ${column}`;
      params = [userId, hexWKB];
    } else {
      // Use lat/lng coordinates with ST_MakePoint
      query = `UPDATE ${table}
       SET current_location = ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
       WHERE ${column} = $3
       RETURNING ${column}`;
      params = [latitude, longitude, userId];
    }

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      throw new Error(`${role} profile not found for user ${userId}`);
    }

    return {
      table,
      userId,
      latitude: latitude || null,
      longitude: longitude || null,
      hexWKB: hexWKB || null,
      updated: true,
    };
  } catch (err) {
    throw new Error(`Failed to update location: ${err.message}`);
  }
}

/**
 * Get ride details for batch operations
 */
async function getRideDetails(userId, role) {
  try {
    const query = role === 'driver'
      ? `SELECT
           r.ride_id,
           rr.pickup_location,
           rr.dropoff_location,
           ST_Y(rr.pickup_location::geometry) as pickup_lat,
           ST_X(rr.pickup_location::geometry) as pickup_lng,
           ST_Y(rr.dropoff_location::geometry) as dropoff_lat,
           ST_X(rr.dropoff_location::geometry) as dropoff_lng
         FROM rides r
         JOIN ride_requests rr ON r.request_id = rr.request_id
         WHERE r.driver_id = $1 AND r.status IN ('driver_assigned', 'started')
         LIMIT 1`
      : `SELECT
           r.ride_id,
           rr.pickup_location,
           rr.dropoff_location,
           ST_Y(rr.pickup_location::geometry) as pickup_lat,
           ST_X(rr.pickup_location::geometry) as pickup_lng,
           ST_Y(rr.dropoff_location::geometry) as dropoff_lat,
           ST_X(rr.dropoff_location::geometry) as dropoff_lng
         FROM rides r
         JOIN ride_requests rr ON r.request_id = rr.request_id
         WHERE rr.rider_id = $1 AND r.status IN ('driver_assigned', 'started')
         LIMIT 1`;

    const result = await pool.query(query, [userId]);
    return result.rows[0] || null;
  } catch (err) {
    throw new Error(`Failed to fetch ride details: ${err.message}`);
  }
}

/**
 * Calculate intermediate points along a route (linear interpolation)
 */
function interpolateRoute(startLat, startLng, endLat, endLng, steps = 5) {
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const lat = startLat + (endLat - startLat) * t;
    const lng = startLng + (endLng - startLng) * t;
    points.push({ lat, lng });
  }
  return points;
}

/**
 * Batch move location with interpolation
 */
async function batchMove(userId, startLat, startLng, endLat, endLng, interval = 1000, role = 'driver') {
  const steps = Math.ceil(
    Math.sqrt(
      Math.pow(endLat - startLat, 2) + Math.pow(endLng - startLng, 2)
    ) * 100
  );

  const points = interpolateRoute(startLat, startLng, endLat, endLng, Math.min(steps, 20));

  console.log(`\n📍 Batch move: ${points.length} waypoints, ${interval}ms intervals`);
  console.log(`   From: (${startLat.toFixed(4)}, ${startLng.toFixed(4)})`);
  console.log(`   To:   (${endLat.toFixed(4)}, ${endLng.toFixed(4)})\n`);

  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    const result = await updateLocation(userId, point.lat, point.lng, role);
    const progress = Math.round((i / points.length) * 100);
    console.log(`   [${progress}%] Updated to (${point.lat.toFixed(4)}, ${point.lng.toFixed(4)})`);

    if (i < points.length - 1) {
      await new Promise(resolve => setTimeout(resolve, interval));
    }
  }

  console.log(`\n✅ Batch move complete!\n`);
}

/**
 * Main execution
 */
async function main() {
  const args = parseArgs();

  // Validate email format
  if (!args.email.includes('test-')) {
    console.error(`❌ Safety check: Email must match test convention (test-*@example.com)`);
    process.exit(1);
  }

  // Validate coordinates (if not using hex format)
  if (!args.isHexFormat) {
    if (isNaN(args.lat) || isNaN(args.lng) || args.lat < -90 || args.lat > 90 || args.lng < -180 || args.lng > 180) {
      console.error(`❌ Invalid coordinates. Latitude must be -90 to 90, Longitude must be -180 to 180`);
      process.exit(1);
    }
  }

  // Validate hex format (if using hex)
  if (args.isHexFormat) {
    if (!args.hexWKB || !/^[0-9a-fA-F]+$/.test(args.hexWKB)) {
      console.error(`❌ Invalid hex format. PostGIS WKB hex must contain only hexadecimal characters`);
      process.exit(1);
    }
  }

  try {
    console.log(`\n🚗 Ride Simulation - Test Location Override`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    // Fetch user
    console.log(`🔍 Checking user: ${args.email}`);
    const userResult = await pool.query(
      'SELECT user_id, first_name, last_name, role FROM users WHERE email = $1',
      [args.email]
    );

    if (userResult.rows.length === 0) {
      throw new Error(`User not found. Create test account first using: test-*@example.com format`);
    }

    const user = userResult.rows[0];
    const role = await getUserRole(pool, user.user_id);

    if (!role) {
      throw new Error(`User ${args.email} has no driver or rider profile. Please create one first.`);
    }

    console.log(`   ✓ Found: ${user.first_name} ${user.last_name} (${role})`);
    console.log(`   User ID: ${user.user_id}\n`);

    // Batch mode: fetch ride and move to pickup/dropoff
    if (args.batchMode && args.batchType) {
      const rideDetails = await getRideDetails(user.user_id, role);

      if (!rideDetails) {
        console.log(`⚠️  No active ride found for this ${role}`);
        console.log(`   Moving to provided coordinates instead...\n`);
      } else {
        let targetLat, targetLng, label;

        if (args.batchType.toLowerCase() === 'pickup') {
          targetLat = rideDetails.pickup_lat;
          targetLng = rideDetails.pickup_lng;
          label = 'Pickup location';
        } else if (args.batchType.toLowerCase() === 'dropoff') {
          targetLat = rideDetails.dropoff_lat;
          targetLng = rideDetails.dropoff_lng;
          label = 'Dropoff location';
        } else {
          throw new Error(`Unknown batch type: ${args.batchType}. Use 'pickup' or 'dropoff'`);
        }

        console.log(`🎯 ${label} (from active ride):`);
        console.log(`   Lat: ${targetLat.toFixed(4)}, Lng: ${targetLng.toFixed(4)}\n`);

        // Get current location for interpolation start
        const currentLocResult = await pool.query(
          role === 'driver'
            ? 'SELECT ST_Y(current_location::geometry) as lat, ST_X(current_location::geometry) as lng FROM drivers WHERE driver_id = $1'
            : 'SELECT ST_Y(current_location::geometry) as lat, ST_X(current_location::geometry) as lng FROM riders WHERE rider_id = $1',
          [user.user_id]
        );

        const currentLoc = currentLocResult.rows[0] || { lat: args.lat, lng: args.lng };
        await batchMove(user.user_id, currentLoc.lat, currentLoc.lng, targetLat, targetLng, args.interval, role);
        process.exit(0);
      }
    }

    // Single update - supports both lat/lng and hex format
    if (args.isHexFormat) {
      console.log(`📍 Updating location using PostGIS WKB hex format`);
      console.log(`   Hex: ${args.hexWKB.substring(0, 32)}...`);
    } else {
      console.log(`📍 Updating location to: (${args.lat.toFixed(4)}, ${args.lng.toFixed(4)})`);
    }
    const updateResult = await updateLocation(user.user_id, args.lat, args.lng, role, args.hexWKB);

    console.log(`\n✅ Location updated successfully!`);
    console.log(`   Table: ${updateResult.table}`);
    if (updateResult.latitude !== null && updateResult.longitude !== null) {
      console.log(`   New coordinates: (${updateResult.latitude}, ${updateResult.longitude})`);
    } else if (updateResult.hexWKB) {
      console.log(`   WKB Hex: ${updateResult.hexWKB.substring(0, 32)}...`);
    }
    console.log(`\n   The map will refresh on next polling (5-10 seconds)\n`);

  } catch (err) {
    console.error(`\n❌ Error: ${err.message}\n`);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
