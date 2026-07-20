const express = require('express');
const productController = require('../controllers/productController');
const { requireAuth, requireRole } = require('../middleware/auth');
const { uploadProductImages } = require('../middleware/upload');
const { createProductRules, stockAdjustRules } = require('../middleware/validators/productValidators');

const router = express.Router();

const ADMIN_ROLES = ['admin', 'super_admin'];

// --- Public storefront ---
router.get('/', productController.listProducts);

// --- Admin dashboard (must be declared before the /:slug wildcard below) ---
router.get('/admin/all', requireAuth, requireRole(...ADMIN_ROLES), productController.listProductsAdmin);
router.get('/admin/:id', requireAuth, requireRole(...ADMIN_ROLES), productController.getProductAdmin);

// --- Public storefront (wildcard — must stay after all literal /admin/* routes) ---
router.get('/:slug', productController.getProduct);

router.post(
  '/',
  requireAuth,
  requireRole(...ADMIN_ROLES),
  uploadProductImages.array('images', 8),
  createProductRules,
  productController.createProduct
);

router.patch(
  '/:id',
  requireAuth,
  requireRole(...ADMIN_ROLES),
  uploadProductImages.array('images', 8),
  productController.updateProduct
);

router.delete('/:id/images/:imageId', requireAuth, requireRole(...ADMIN_ROLES), productController.removeProductImage);
router.delete('/:id', requireAuth, requireRole(...ADMIN_ROLES), productController.deleteProduct);

router.patch(
  '/:id/variants/:variantId/stock',
  requireAuth,
  requireRole(...ADMIN_ROLES),
  stockAdjustRules,
  productController.adjustVariantStock
);

module.exports = router;
