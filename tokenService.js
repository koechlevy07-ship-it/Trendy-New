const express = require('express');
const reportController = require('../controllers/reportController');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth, requireRole('admin', 'super_admin'));

router.get('/sales-summary', reportController.salesSummary);
router.get('/revenue-series', reportController.revenueTimeSeries);
router.get('/top-products', reportController.topProducts);
router.get('/inventory-alerts', reportController.inventoryAlerts);
router.get('/customers', reportController.customerSummary);

module.exports = router;
