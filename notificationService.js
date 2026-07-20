const express = require('express');
const paymentController = require('../controllers/paymentController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/mpesa/initiate', requireAuth, paymentController.initiateMpesaPayment);
router.get('/:id/status', requireAuth, paymentController.getPaymentStatus);

// Public — Safaricom calls this server-to-server, not through the browser
router.post('/mpesa/callback', paymentController.mpesaCallback);

module.exports = router;
