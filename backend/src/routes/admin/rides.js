const express = require("express");
const router = express.Router();
const { getAllRides } = require("../../controllers/adminController");

// GET /api/admin/rides?status=active|completed|cancelled
router.get("/", getAllRides);

module.exports = router;


