const express = require("express");
const router = express.Router();
const { authenticateToken, authorizeRoles } = require("../middleware/auth");
const { onboardingUpload, vehicleUpload } = require("../middleware/upload");
const { getMyVehicles, setActiveVehicle, deactivateVehicle } = require("../controllers/vehicleController");
const {
  getDocuments,
  addDocument,
  deleteDocument,
  getOnboardingStatus,
  submitOnboarding,
  addVehicle,
} = require("../controllers/driversController");

// Documents
router.get("/documents", authenticateToken, authorizeRoles("driver"), getDocuments);
router.post("/documents", authenticateToken, authorizeRoles("driver"), addDocument);
router.delete("/documents/:docType", authenticateToken, authorizeRoles("driver"), deleteDocument);

// Onboarding
router.get("/onboarding-status", authenticateToken, authorizeRoles("driver"), getOnboardingStatus);
router.post("/onboarding/submit", authenticateToken, authorizeRoles("driver"), onboardingUpload, submitOnboarding);

// Vehicles
router.get("/vehicles", authenticateToken, authorizeRoles("driver"), getMyVehicles);
router.post("/vehicles", authenticateToken, authorizeRoles("driver"), vehicleUpload, addVehicle);
router.put("/vehicles/:vehicleId/activate", authenticateToken, authorizeRoles("driver"), setActiveVehicle);
router.put("/vehicles/:vehicleId/deactivate", authenticateToken, authorizeRoles("driver"), deactivateVehicle);

module.exports = router;
