const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../middleware/auth");
const {
  initPayment,
  paymentSuccess,
  paymentFail,
  paymentCancel,
  paymentIPN,
} = require("../controllers/paymentController");

// Authenticated — user initiates payment
router.post("/init", authenticateToken, initPayment);

// SSLCommerz callbacks — not authenticated (SSLCommerz POSTs to these)
router.post("/success", paymentSuccess);
router.post("/fail", paymentFail);
router.post("/cancel", paymentCancel);
router.post("/ipn", paymentIPN);

module.exports = router;
