const express = require('express');
const router = express.Router();
const { validate, schemas } = require('../middleware/validate');
const { authenticateToken, requireAdmin, requireTwoFactor, requireStatus } = require('../middleware/auth');
const permissionMiddleware = require('../middleware/permission');
const adminController = require('../controllers/adminController');
const authService = require('../services/authService');

// ===== ADMIN USER MANAGEMENT =====

// GET /api/rbac/admin-users - List all admin users
router.get('/admin-users', authenticateToken, requireAdmin, adminController.getUsers);

// GET /api/rbac/admin-users/:id - Get single admin user
router.get('/admin-users/:id', authenticateToken, requireAdmin, adminController.getUserById);

// POST /api/rbac/admin-users - Create admin user
router.post('/admin-users', authenticateToken, requireAdmin, requireTwoFactor, validate(schemas.adminUser), adminController.createUser);

// PUT /api/rbac/admin-users/:id - Update admin user
router.put('/admin-users/:id', authenticateToken, requireAdmin, requireTwoFactor, validate(schemas.adminUser), adminController.updateUser);

// DELETE /api/rbac/admin-users/:id - Delete admin user
router.delete('/admin-users/:id', authenticateToken, requireAdmin, requireTwoFactor, adminController.deleteUser);

// POST /api/rbac/admin-users/:id/suspend - Suspend admin user
router.post('/admin-users/:id/suspend', authenticateToken, requireAdmin, requireTwoFactor, adminController.suspendUser);

// POST /api/rbac/admin-users/:id/activate - Activate admin user
router.post('/admin-users/:id/activate', authenticateToken, requireAdmin, requireTwoFactor, adminController.activateUser);

// POST /api/rbac/admin-users/:id/reset-password - Reset admin password
router.post('/admin-users/:id/reset-password', authenticateToken, requireAdmin, requireTwoFactor, adminController.resetUserPassword);

// POST /api/rbac/admin-users/:id/force-logout - Force logout admin user
router.post('/admin-users/:id/force-logout', authenticateToken, requireAdmin, requireTwoFactor, adminController.forceLogoutUser);

// ===== ROLE MANAGEMENT =====

// GET /api/rbac/roles - List all roles
router.get('/roles', authenticateToken, requireAdmin, adminController.getRoles);

// GET /api/rbac/roles/:id - Get single role
router.get('/roles/:id', authenticateToken, requireAdmin, adminController.getRoleById);

// POST /api/rbac/roles - Create role
router.post('/roles', authenticateToken, requireAdmin, requireTwoFactor, validate(schemas.role), adminController.createRole);

// PUT /api/rbac/roles/:id - Update role
router.put('/admin-users/:id', authenticateToken, requireAdmin, requireTwoFactor, validate(schemas.role), adminController.updateRole);

// DELETE /api/rbac/roles/:id - Delete role
router.delete('/admin-users/:id', authenticateToken, requireAdmin, requireTwoFactor, adminController.deleteRole);

// POST /api/rbac/roles/:id/duplicate - Duplicate role
router.post('/roles/:id/duplicate', authenticateToken, requireAdmin, requireTwoFactor, adminController.duplicateRole);

// ===== DEPARTMENT MANAGEMENT =====

// GET /api/rbac/departments - List departments
router.get('/departments', authenticateToken, requireAdmin, adminController.getDepartments);

// GET /api/rbac/departments/:id - Get department
router.get('/api/rbac/departments/:id', authenticateToken, requireAdmin, adminController.getDepartmentById);

// POST /api/rbac/departments - Create department
router.post('/departments', authenticateToken, requireAdmin, requireTwoFactor, validate(schemas.department), adminController.createDepartment);

// PUT /api/rbac/departments/:id - Update department
router.put('/departments/:id', authenticateToken, requireAdmin, requireTwoFactor, validate(schemas.department), adminController.updateDepartment);

// DELETE /api/rbac/departments/:id - Delete department
router.delete('/departments/:id', authenticateToken, requireAdmin, requireTwoFactor, adminController.deleteDepartment);

// ===== SESSION MANAGEMENT =====

// GET /api/rbac/sessions - List sessions
router.get('/sessions', authenticateToken, requireAdmin, adminController.getSessions);

// DELETE /api/rbac/sessions/:id - Terminate session
router.delete('/sessions/:id', authenticateToken, requireAdmin, requireTwoFactor, adminController.terminateSession);

// ===== AUDIT LOGS =====

// GET /api/rbac/audit-logs - List audit logs
router.get('/audit-logs', authenticateToken, requireAdmin, adminController.getAuditLogs);

// GET /api/rbac/audit-logs/export - Export audit logs
router.get('/audit-logs/export', authenticateToken, requireAdmin, adminController.exportAuditLogs);

// ===== SECURITY POLICY =====

// GET /api/rbac/security-policy - Get security policy
router.get('/security-policy', authenticateToken, requireAdmin, adminController.getSecurityPolicy);

// PUT /api/rbac/security-policy - Update security policy
router.put('/security-policy', authenticateToken, requireAdmin, requireTwoFactor, validate(schemas.securityPolicy), adminController.updateSecurityPolicy);

// ===== PERMISSION MIDDLEWARE =====

// Apply permission middleware for specific routes
router.use('/admin-users', permissionMiddleware.checkPermission('admin-users', 'view'));
router.use('/roles', permissionMiddleware.checkPermission('roles', 'view'));
router.use('/departments', permissionMiddleware.checkPermission('departments', 'view'));
router.use('/sessions', permissionMiddleware.checkPermission('sessions', 'view'));
router.use('/audit-logs', permissionMiddleware.checkPermission('audit-logs', 'view'));
router.use('/security-policy', permissionMiddleware.checkPermission('security-policy', 'view'));

module.exports = router;