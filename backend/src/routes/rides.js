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
} = require("../controllers/ridesController");

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

// Driver: update ride status (started / completed / cancelled)
router.put("/:id/status", authenticateToken, updateRideStatus);

// Rider: get fare estimate without creating request
router.get("/fare-estimate", authenticateToken, authorizeRoles("rider", "mixed"), getFareEstimate);

// Rider: poll for active ride request / ride status
router.get("/rider/active", authenticateToken, authorizeRoles("rider", "mixed"), getRiderActiveRide);

// Rider: cancel a pending ride request
router.post("/requests/:id/cancel", authenticateToken, authorizeRoles("rider", "mixed"), cancelRideRequest);

module.exports = router;
