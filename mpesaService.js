const express = require('express');
const orderController = require('../controllers/orderController');
const { requireAuth, requireRole } = require('../middleware/auth');
const { checkoutRules, updateStatusRules } = require('../middleware/validators/orderValidators');

const router = express.Router();

const ADMIN_ROLES = ['admin', 'super_admin'];

router.use(requireAuth);

// --- Customer ---
router.post('/checkout', checkoutRules, orderController.checkout);
router.get('/my-orders', orderController.listMyOrders);
router.get('/my-orders/:id', orderController.getMyOrder);
router.post('/my-orders/:id/cancel', orderController.cancelMyOrder);

// --- Admin ---
router.get('/admin/all', requireRole(...ADMIN_ROLES), orderController.listAllOrders);
router.get('/admin/:id', requireRole(...ADMIN_ROLES), orderController.getOrderAdmin);
router.patch('/admin/:id/status', requireRole(...ADMIN_ROLES), updateStatusRules, orderController.updateOrderStatus);

module.exports = router;
