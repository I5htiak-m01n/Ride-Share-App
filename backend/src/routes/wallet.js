const express = require("express");
const router = express.Router();
const { authenticateToken, authorizeRoles } = require("../middleware/auth");
const {
  getBalance,
  getTransactions,
  topUp,
  validatePromo,
  getEarningsSummary,
} = require("../controllers/walletController");

// All routes require authentication
router.get("/balance", authenticateToken, getBalance);
router.get("/transactions", authenticateToken, getTransactions);
router.post("/topup", authenticateToken, topUp);
router.post("/validate-promo", authenticateToken, authorizeRoles("rider", "mixed"), validatePromo);
router.get("/earnings-summary", authenticateToken, authorizeRoles("driver", "mixed"), getEarningsSummary);

module.exports = router;
