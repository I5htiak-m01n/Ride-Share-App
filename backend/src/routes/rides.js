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
  cancelRideRequest,
  getRiderHistory,
  getDriverHistory,
  getRideDetail,
} = require("../controllers/ridesController");
const {
  getDirections,
  getRouteForRide,
  rerouteRide,
  checkAndReroute,
} = require("../controllers/directionsController");

// Rider: create a ride request
router.post("/request", authenticateToken, authorizeRoles("rider", "mixed"), createRideRequest);

// Driver: get nearby open requests
router.get("/nearby", authenticateToken, authorizeRoles("driver", "mixed"), getNearbyRequests);

// Driver: update GPS location
router.put("/driver-location", authenticateToken, authorizeRoles("driver", "mixed"), updateDriverLocation);

// Driver: accept a specific request
router.post("/requests/:id/accept", authenticateToken, authorizeRoles("driver", "mixed"), acceptRequest);

// Driver: reject a specific request
router.post("/requests/:id/reject", authenticateToken, authorizeRoles("driver", "mixed"), rejectRequest);

// Rider: ride history
router.get("/rider/history", authenticateToken, authorizeRoles("rider", "mixed"), getRiderHistory);

// Driver: ride history
router.get("/driver/history", authenticateToken, authorizeRoles("driver", "mixed"), getDriverHistory);

// Driver: update ride status (started / completed / cancelled)
router.put("/:id/status", authenticateToken, updateRideStatus);

// Ride detail: full ride info + chat history + ratings (for both rider and driver)
router.get("/:id/detail", authenticateToken, getRideDetail);

// Rider: get fare estimate without creating request
router.get("/fare-estimate", authenticateToken, authorizeRoles("rider", "mixed"), getFareEstimate);

// Rider: poll for active ride request / ride status
router.get("/rider/active", authenticateToken, authorizeRoles("rider", "mixed"), getRiderActiveRide);

// Rider: cancel a pending ride request
router.post("/requests/:id/cancel", authenticateToken, authorizeRoles("rider", "mixed"), cancelRideRequest);

// Directions: get route preview between two points
router.post("/directions", authenticateToken, getDirections);

// Directions: get stored route for a ride
router.get("/:id/route", authenticateToken, getRouteForRide);

// Directions: force reroute from driver's current position
router.post("/:id/reroute", authenticateToken, rerouteRide);

// Directions: check if driver is off-route and auto-reroute
router.post("/:id/check-route", authenticateToken, checkAndReroute);

module.exports = router;
