const express = require('express');
const settingsController = require('../controllers/settingsController');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const ADMIN_ROLES = ['admin', 'super_admin'];

router.get('/', settingsController.getPublicSettings);
router.get('/admin', requireAuth, requireRole(...ADMIN_ROLES), settingsController.getAdminSettings);
router.patch('/admin', requireAuth, requireRole(...ADMIN_ROLES), settingsController.updateSettings);

module.exports = router;
