const express = require('express');
const cmsController = require('../controllers/cmsController');
const { requireAuth, requireRole } = require('../middleware/auth');
const { uploadCmsImage } = require('../middleware/upload');

const router = express.Router();

const ADMIN_ROLES = ['admin', 'super_admin'];

// Public
router.get('/', cmsController.listPublic);

// Admin (must come before the /:slug wildcard below)
router.get('/admin/all', requireAuth, requireRole(...ADMIN_ROLES), cmsController.listAdmin);
router.post('/admin', requireAuth, requireRole(...ADMIN_ROLES), uploadCmsImage.single('image'), cmsController.createPage);
router.patch(
  '/admin/:id',
  requireAuth,
  requireRole(...ADMIN_ROLES),
  uploadCmsImage.single('image'),
  cmsController.updatePage
);
router.delete('/admin/:id', requireAuth, requireRole(...ADMIN_ROLES), cmsController.deletePage);

// Public wildcard — must stay last
router.get('/:slug', cmsController.getPublicBySlug);

module.exports = router;
