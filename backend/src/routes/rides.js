const express = require("express");
const router = express.Router();
const { authenticateToken, authorizeRoles } = require("../middleware/auth");
const {
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
  getCancellationFee,
  cancelRide,
  getRiderHistory,
  getDriverHistory,
  getRideDetail,
  getVehicleTypes,
  checkDriverReadiness,
  updateRiderLocation,
} = require("../controllers/ridesController");
const {
  getDirections,
  getRouteForRide,
  rerouteRide,
  checkAndReroute,
} = require("../controllers/directionsController");
const { getAvailablePromos } = require("../controllers/promoController");

// Public: get available vehicle types
router.get("/vehicle-types", getVehicleTypes);

// Rider: create a ride request
router.post("/request", authenticateToken, authorizeRoles("rider", "mixed"), createRideRequest);

// Driver: get nearby open requests
router.get("/nearby", authenticateToken, authorizeRoles("driver", "mixed"), getNearbyRequests);

// Driver: update GPS location
router.put("/driver-location", authenticateToken, authorizeRoles("driver", "mixed"), updateDriverLocation);

// Rider: update GPS location (for proximity enforcement on ride completion)
router.put("/rider-location", authenticateToken, authorizeRoles("rider", "mixed"), updateRiderLocation);

// Driver: accept a specific request
router.post("/requests/:id/accept", authenticateToken, authorizeRoles("driver", "mixed"), acceptRequest);

// Driver: reject a specific request
router.post("/requests/:id/reject", authenticateToken, authorizeRoles("driver", "mixed"), rejectRequest);

// Rider: ride history
router.get("/rider/history", authenticateToken, authorizeRoles("rider", "mixed"), getRiderHistory);

// Driver: ride history
router.get("/driver/history", authenticateToken, authorizeRoles("driver", "mixed"), getDriverHistory);

// Driver: poll for active ride (state restoration on login/refresh)
router.get("/driver/active", authenticateToken, authorizeRoles("driver", "mixed"), getDriverActiveRide);

// Driver: check readiness before going online
router.get("/driver/readiness", authenticateToken, authorizeRoles("driver", "mixed"), checkDriverReadiness);

// Driver: update ride status (started / completed)
router.put("/:id/status", authenticateToken, updateRideStatus);

// Cancel: preview cancellation fee
router.get("/:id/cancel-fee", authenticateToken, getCancellationFee);

// Cancel: paid cancellation (rider or driver, after driver assigned)
router.post("/:id/cancel", authenticateToken, cancelRide);

// Ride detail: full ride info + chat history + ratings (for both rider and driver)
router.get("/:id/detail", authenticateToken, getRideDetail);

// Rider: get fare estimate without creating request
router.get("/fare-estimate", authenticateToken, authorizeRoles("rider", "mixed"), getFareEstimate);

// Rider: poll for active ride request / ride status
router.get("/rider/active", authenticateToken, authorizeRoles("rider", "mixed"), getRiderActiveRide);

// Rider: cancel a pending ride request
router.post("/requests/:id/cancel", authenticateToken, authorizeRoles("rider", "mixed"), cancelRideRequest);

// Rider: get available promo codes
router.get("/rider/promos", authenticateToken, authorizeRoles("rider", "mixed"), getAvailablePromos);

// Directions: get route preview between two points
router.post("/directions", authenticateToken, getDirections);

// Directions: get stored route for a ride
router.get("/:id/route", authenticateToken, getRouteForRide);

// Directions: force reroute from driver's current position
router.post("/:id/reroute", authenticateToken, rerouteRide);

// Directions: check if driver is off-route and auto-reroute
router.post("/:id/check-route", authenticateToken, checkAndReroute);

module.exports = router;
