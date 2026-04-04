const express = require("express");
const router = express.Router();
const { authenticateToken, authorizeRoles } = require("../middleware/auth");
const {
  getBalance,
  getTransactions,
  topUp,
  withdraw,
  validatePromo,
  getEarningsSummary,
} = require("../controllers/walletController");

// All routes require authentication
router.get("/balance", authenticateToken, getBalance);
router.get("/transactions", authenticateToken, getTransactions);
router.post("/topup", authenticateToken, topUp);
router.post("/withdraw", authenticateToken, authorizeRoles("driver"), withdraw);
router.post("/validate-promo", authenticateToken, authorizeRoles("rider"), validatePromo);
router.get("/earnings-summary", authenticateToken, authorizeRoles("driver"), getEarningsSummary);

module.exports = router;
