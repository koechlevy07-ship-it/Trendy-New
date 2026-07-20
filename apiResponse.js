const express = require('express');
const shippingZoneController = require('../controllers/shippingZoneController');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const ADMIN_ROLES = ['admin', 'super_admin'];

// Public
router.get('/quote', shippingZoneController.getQuote);
router.get('/zones', shippingZoneController.listZones);

// Admin
router.post('/zones', requireAuth, requireRole(...ADMIN_ROLES), shippingZoneController.createZone);
router.patch('/zones/:id', requireAuth, requireRole(...ADMIN_ROLES), shippingZoneController.updateZone);
router.delete('/zones/:id', requireAuth, requireRole(...ADMIN_ROLES), shippingZoneController.deleteZone);

module.exports = router;
