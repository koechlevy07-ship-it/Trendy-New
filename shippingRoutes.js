const express = require('express');
const categoryController = require('../controllers/categoryController');
const { requireAuth, requireRole } = require('../middleware/auth');
const { uploadCategoryImage } = require('../middleware/upload');

const router = express.Router();

// Public
router.get('/', categoryController.listCategories);
router.get('/:slug', categoryController.getCategory);

// Admin only
router.post(
  '/',
  requireAuth,
  requireRole('admin', 'super_admin'),
  uploadCategoryImage.single('image'),
  categoryController.createCategory
);
router.patch(
  '/:id',
  requireAuth,
  requireRole('admin', 'super_admin'),
  uploadCategoryImage.single('image'),
  categoryController.updateCategory
);
router.delete('/:id', requireAuth, requireRole('admin', 'super_admin'), categoryController.deleteCategory);

module.exports = router;
