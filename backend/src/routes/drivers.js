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
        `SELECT doc_type, image_url, expiry_date, status
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
    try {
      const { doc_type, image_url, expiry_date } = req.body;

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

      const result = await pool.query(
        `INSERT INTO driver_documents (driver_id, doc_type, image_url, expiry_date, status)
         VALUES ($1, $2, $3, $4, 'pending')
         ON CONFLICT (driver_id, doc_type)
         DO UPDATE SET image_url = $3, expiry_date = $4, status = 'pending'
         RETURNING doc_type, image_url, expiry_date, status`,
        [req.user.id, doc_type, image_url, expiry_date || null]
      );

      res.status(201).json({ document: result.rows[0] });
    } catch (error) {
      console.error("Add document error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Delete a document for the authenticated driver
router.delete(
  "/documents/:docType",
  authenticateToken,
  authorizeRoles("driver", "mixed"),
  async (req, res) => {
    try {
      const { docType } = req.params;

      const result = await pool.query(
        `DELETE FROM driver_documents
         WHERE driver_id = $1 AND doc_type = $2
         RETURNING doc_type`,
        [req.user.id, docType]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Document not found" });
      }

      res.json({ message: "Document deleted successfully" });
    } catch (error) {
      console.error("Delete document error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

module.exports = router;
