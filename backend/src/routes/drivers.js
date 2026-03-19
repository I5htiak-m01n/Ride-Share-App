const express = require("express");
const router = express.Router();
const { pool } = require("../db");
const { authenticateToken, authorizeRoles } = require("../middleware/auth");

// Get all documents for the authenticated driver
router.get(
  "/documents",
  authenticateToken,
  authorizeRoles("driver", "mixed"),
  async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT doc_type, image_url, expiry_date, status,
                vehicle_name, vehicle_type, plate_number
         FROM driver_documents
         WHERE driver_id = $1
         ORDER BY doc_type`,
        [req.user.id]
      );
      res.json({ documents: result.rows });
    } catch (error) {
      console.error("Get documents error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Add or update a document for the authenticated driver
router.post(
  "/documents",
  authenticateToken,
  authorizeRoles("driver", "mixed"),
  async (req, res) => {
    const { doc_type, image_url, expiry_date, vehicle_name, vehicle_type, plate_number } = req.body;

    if (!doc_type || !image_url) {
      return res
        .status(400)
        .json({ error: "doc_type and image_url are required" });
    }

    const allowed = [
      "driving_license",
      "vehicle_registration",
      "insurance",
      "nid",
      "other",
    ];
    if (!allowed.includes(doc_type)) {
      return res.status(400).json({
        error: `Invalid doc_type. Must be one of: ${allowed.join(", ")}`,
      });
    }

    // Vehicle fields required for vehicle_registration
    if (doc_type === "vehicle_registration") {
      if (!vehicle_name?.trim() || !vehicle_type?.trim() || !plate_number?.trim()) {
        return res.status(400).json({
          error: "vehicle_name, vehicle_type, and plate_number are required for vehicle registration",
        });
      }
    }

    const vName = doc_type === "vehicle_registration" ? vehicle_name.trim() : null;
    const vType = doc_type === "vehicle_registration" ? vehicle_type.trim() : null;
    const vPlate = doc_type === "vehicle_registration" ? plate_number.trim() : null;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const result = await client.query(
        `INSERT INTO driver_documents
           (driver_id, doc_type, image_url, expiry_date, status, vehicle_name, vehicle_type, plate_number)
         VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7)
         ON CONFLICT (driver_id, doc_type)
         DO UPDATE SET image_url = $3, expiry_date = $4, status = 'pending',
                       vehicle_name = $5, vehicle_type = $6, plate_number = $7
         RETURNING doc_type, image_url, expiry_date, status, vehicle_name, vehicle_type, plate_number`,
        [req.user.id, doc_type, image_url, expiry_date || null, vName, vType, vPlate]
      );

      await client.query("COMMIT");
      res.status(201).json({ document: result.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Add document error:", error);
      res.status(500).json({ error: "Internal server error" });
    } finally {
      client.release();
    }
  }
);

// Delete a document for the authenticated driver
router.delete(
  "/documents/:docType",
  authenticateToken,
  authorizeRoles("driver", "mixed"),
  async (req, res) => {
    const { docType } = req.params;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const result = await client.query(
        `DELETE FROM driver_documents
         WHERE driver_id = $1 AND doc_type = $2
         RETURNING doc_type`,
        [req.user.id, docType]
      );

      if (result.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Document not found" });
      }

      await client.query("COMMIT");
      res.json({ message: "Document deleted successfully" });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Delete document error:", error);
      res.status(500).json({ error: "Internal server error" });
    } finally {
      client.release();
    }
  }
);

// ── Onboarding ─────────────────────────────────────────────

// GET /api/drivers/onboarding-status
router.get(
  "/onboarding-status",
  authenticateToken,
  authorizeRoles("driver", "mixed"),
  async (req, res) => {
    try {
      const driverId = req.user.id;

      // 1. Check for any approved vehicle
      const approved = await pool.query(
        `SELECT vehicle_id FROM vehicles WHERE driver_id = $1 AND approval_status = 'approved' LIMIT 1`,
        [driverId]
      );
      if (approved.rows.length > 0) {
        return res.json({ status: "approved" });
      }

      // 2. Check for pending documents or vehicles
      const pendingDocs = await pool.query(
        `SELECT doc_type FROM driver_documents WHERE driver_id = $1 AND status = 'pending'`,
        [driverId]
      );
      const pendingVehicles = await pool.query(
        `SELECT vehicle_id FROM vehicles WHERE driver_id = $1 AND approval_status = 'pending'`,
        [driverId]
      );
      if (pendingDocs.rows.length > 0 || pendingVehicles.rows.length > 0) {
        return res.json({ status: "pending_review" });
      }

      // 3. Check for rejected documents or vehicles
      const rejectedVehicle = await pool.query(
        `SELECT vehicle_id, rejection_reason FROM vehicles WHERE driver_id = $1 AND approval_status = 'rejected' LIMIT 1`,
        [driverId]
      );
      const rejectedDocs = await pool.query(
        `SELECT doc_type FROM driver_documents WHERE driver_id = $1 AND status = 'rejected'`,
        [driverId]
      );
      if (rejectedDocs.rows.length > 0 || rejectedVehicle.rows.length > 0) {
        return res.json({
          status: "rejected",
          reason: rejectedVehicle.rows[0]?.rejection_reason || "Your documents were rejected. Please resubmit.",
        });
      }

      // 4. No documents at all
      return res.json({ status: "needs_documents" });
    } catch (error) {
      console.error("Onboarding status error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// POST /api/drivers/onboarding/submit
const { onboardingUpload } = require("../middleware/upload");

router.post(
  "/onboarding/submit",
  authenticateToken,
  authorizeRoles("driver", "mixed"),
  onboardingUpload,
  async (req, res) => {
    const { license_number, license_expiry, vehicle_model, vehicle_type, plate_number, insurance_expiry } = req.body;
    const files = req.files || {};

    // Validate required files
    if (!files.license_file?.[0] || !files.nid_file?.[0] || !files.registration_file?.[0] || !files.insurance_file?.[0]) {
      return res.status(400).json({
        error: "All document images are required: license_file, nid_file, registration_file, insurance_file",
      });
    }

    // Validate required text fields
    if (!license_number?.trim() || !vehicle_model?.trim() || !vehicle_type?.trim() || !plate_number?.trim()) {
      return res.status(400).json({
        error: "All fields are required: license_number, vehicle_model, vehicle_type, plate_number",
      });
    }

    const licenseUrl = `/uploads/documents/${files.license_file[0].filename}`;
    const nidUrl = `/uploads/documents/${files.nid_file[0].filename}`;
    const registrationUrl = `/uploads/documents/${files.registration_file[0].filename}`;
    const insuranceUrl = `/uploads/documents/${files.insurance_file[0].filename}`;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const driverId = req.user.id;

      // 1. Upsert driving_license document
      await client.query(
        `INSERT INTO driver_documents (driver_id, doc_type, image_url, expiry_date, status)
         VALUES ($1, 'driving_license', $2, $3, 'pending')
         ON CONFLICT (driver_id, doc_type)
         DO UPDATE SET image_url = $2, expiry_date = $3, status = 'pending'`,
        [driverId, licenseUrl, license_expiry || null]
      );

      // 2. Upsert nid document
      await client.query(
        `INSERT INTO driver_documents (driver_id, doc_type, image_url, status)
         VALUES ($1, 'nid', $2, 'pending')
         ON CONFLICT (driver_id, doc_type)
         DO UPDATE SET image_url = $2, status = 'pending'`,
        [driverId, nidUrl]
      );

      // 3. Update driver license_number
      await client.query(
        `UPDATE drivers SET license_number = $1 WHERE driver_id = $2`,
        [license_number.trim(), driverId]
      );

      // 4. Upsert vehicle with approval_status = 'pending'
      const vResult = await client.query(
        `INSERT INTO vehicles (driver_id, plate_number, model, type, is_active, approval_status, rejection_reason)
         VALUES ($1, $2, $3, $4, false, 'pending', NULL)
         ON CONFLICT (plate_number)
         DO UPDATE SET model = $3, type = $4, is_active = false, approval_status = 'pending', rejection_reason = NULL, driver_id = $1
         RETURNING vehicle_id`,
        [driverId, plate_number.trim(), vehicle_model.trim(), vehicle_type.trim()]
      );
      const vehicleId = vResult.rows[0].vehicle_id;

      // 5. Upsert vehicle_registration document
      await client.query(
        `INSERT INTO driver_documents (driver_id, doc_type, image_url, status, vehicle_name, vehicle_type, plate_number)
         VALUES ($1, 'vehicle_registration', $2, 'pending', $3, $4, $5)
         ON CONFLICT (driver_id, doc_type)
         DO UPDATE SET image_url = $2, status = 'pending', vehicle_name = $3, vehicle_type = $4, plate_number = $5`,
        [driverId, registrationUrl, vehicle_model.trim(), vehicle_type.trim(), plate_number.trim()]
      );

      // 6. Upsert insurance in vehicle_documents
      await client.query(
        `INSERT INTO vehicle_documents (vehicle_id, doc_type, image_url, expiry_date, status)
         VALUES ($1, 'insurance', $2, $3, 'pending')
         ON CONFLICT (vehicle_id, doc_type)
         DO UPDATE SET image_url = $2, expiry_date = $3, status = 'pending'`,
        [vehicleId, insuranceUrl, insurance_expiry || null]
      );

      await client.query("COMMIT");
      res.status(201).json({ message: "Documents submitted successfully" });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Onboarding submit error:", error);
      if (error.code === "23503" && error.constraint?.includes("vehicle_type")) {
        return res.status(400).json({ error: "Invalid vehicle type" });
      }
      res.status(500).json({ error: "Internal server error" });
    } finally {
      client.release();
    }
  }
);

// ── Vehicle Management ─────────────────────────────────────
const { getMyVehicles, setActiveVehicle, deactivateVehicle } = require("../controllers/vehicleController");

router.get("/vehicles", authenticateToken, authorizeRoles("driver", "mixed"), getMyVehicles);
router.put("/vehicles/:vehicleId/activate", authenticateToken, authorizeRoles("driver", "mixed"), setActiveVehicle);
router.put("/vehicles/:vehicleId/deactivate", authenticateToken, authorizeRoles("driver", "mixed"), deactivateVehicle);

module.exports = router;
