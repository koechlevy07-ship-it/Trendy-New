const express = require('express');
const couponController = require('../controllers/couponController');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const ADMIN_ROLES = ['admin', 'super_admin'];

router.use(requireAuth);

router.get('/validate/:code', couponController.validateCoupon);

router.get('/admin/all', requireRole(...ADMIN_ROLES), couponController.listCoupons);
router.post('/admin', requireRole(...ADMIN_ROLES), couponController.createCoupon);
router.patch('/admin/:id', requireRole(...ADMIN_ROLES), couponController.updateCoupon);
router.delete('/admin/:id', requireRole(...ADMIN_ROLES), couponController.deleteCoupon);

module.exports = router;
