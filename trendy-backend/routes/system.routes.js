const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const Role = require('../models/Role');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const SecurityPolicy = require('../models/SecurityPolicy');
const Settings = require('../models/Settings');

const checkPermission = (module, action) => async (req, res, next) => {
    try {
        const user = req.user;
        if (user.role === 'admin') {
            const role = await Role.findOne({ slug: 'super-admin' });
            if (role) {
                const perm = role.permissions.find(p => p.module === module);
                if (perm && perm.actions.includes(action)) return next();
            }
            return next();
        }
        const role = await Role.findById(user.roleId);
        if (!role) return res.status(403).json({ success: false, message: 'Role not found' });
        const perm = role.permissions.find(p => p.module === module);
        if (!perm || !perm.actions.includes(action)) {
            return res.status(403).json({ success: false, message: 'Permission denied' });
        }
        next();
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const logAudit = (action, module, resourceId = '', previousValue = null, newValue = null) => {
    return async (req, res, next) => {
        const originalJson = res.json.bind(res);
        res.json = function (body) {
            if (res.statusCode < 400) {
                const entry = new AuditLog({
                    userId: req.user._id,
                    userName: req.user.name,
                    userRole: req.user.role,
                    action, module, resourceId,
                    previousValue, newValue,
                    ipAddress: req.ip || req.connection.remoteAddress,
                    userAgent: req.headers['user-agent'] || '',
                    status: 'success'
                });
                entry.save().catch(() => {});
            }
            return originalJson(body);
        };
        next();
    };
};

Role.findOne({ slug: 'super-admin' }).then(async (role) => {
    if (!role) {
        const permissions = [
            { module: 'products', actions: ['view', 'create', 'edit', 'delete', 'import', 'export'] },
            { module: 'categories', actions: ['view', 'create', 'edit', 'delete'] },
            { module: 'orders', actions: ['view', 'process', 'cancel', 'refund', 'export'] },
            { module: 'customers', actions: ['view', 'edit', 'suspend', 'delete'] },
            { module: 'inventory', actions: ['view', 'update', 'adjust-stock'] },
            { module: 'reviews', actions: ['view', 'approve', 'reject', 'delete'] },
            { module: 'coupons', actions: ['view', 'create', 'edit', 'delete'] },
            { module: 'homepage', actions: ['view', 'edit', 'publish'] },
            { module: 'branding', actions: ['view', 'edit'] },
            { module: 'reports', actions: ['view', 'export'] },
            { module: 'settings', actions: ['view', 'edit'] },
            { module: 'audit-logs', actions: ['view'] },
            { module: 'roles', actions: ['view', 'create', 'edit', 'delete'] },
            { module: 'admin-users', actions: ['view', 'create', 'edit', 'delete', 'suspend', 'reset-password', 'force-logout'] },
            { module: 'security', actions: ['view', 'edit'] },
            { module: 'maintenance', actions: ['view', 'toggle'] },
            { module: 'backup', actions: ['view', 'create', 'restore'] },
            { module: 'email-config', actions: ['view', 'edit', 'test'] }
        ];
        try {
            await Role.create({ name: 'Super Administrator', slug: 'super-admin', description: 'Full system access', permissions, isDefault: false, isSystem: true, priority: 100 });
            await Role.create({ name: 'Administrator', slug: 'admin', description: 'Extended admin access', permissions: permissions.map(p => ({ ...p, actions: p.actions.filter(a => a !== 'delete' || p.module === 'audit-logs') })), isDefault: false, isSystem: true, priority: 90 });
            await Role.create({ name: 'Store Manager', slug: 'store-manager', description: 'Manage products, orders, customers', permissions: [
                { module: 'products', actions: ['view', 'create', 'edit', 'import', 'export'] }, { module: 'categories', actions: ['view', 'create', 'edit'] }, { module: 'orders', actions: ['view', 'process', 'cancel', 'refund', 'export'] }, { module: 'customers', actions: ['view', 'edit'] }, { module: 'inventory', actions: ['view', 'update'] }, { module: 'reports', actions: ['view', 'export'] }
            ], isDefault: false, isSystem: true, priority: 70 });
            await Role.create({ name: 'Inventory Manager', slug: 'inventory-manager', description: 'Manage inventory and stock', permissions: [
                { module: 'products', actions: ['view'] }, { module: 'inventory', actions: ['view', 'update', 'adjust-stock'] }, { module: 'reports', actions: ['view'] }
            ], isDefault: false, isSystem: true, priority: 60 });
            await Role.create({ name: 'Customer Support', slug: 'customer-support', description: 'Handle customer orders and reviews', permissions: [
                { module: 'orders', actions: ['view', 'process', 'cancel', 'refund'] }, { module: 'customers', actions: ['view', 'edit'] }, { module: 'reviews', actions: ['view', 'approve', 'reject'] }, { module: 'reports', actions: ['view'] }
            ], isDefault: false, isSystem: true, priority: 50 });
            await Role.create({ name: 'Marketing Manager', slug: 'marketing-manager', description: 'Manage coupons and homepage content', permissions: [
                { module: 'coupons', actions: ['view', 'create', 'edit', 'delete'] }, { module: 'homepage', actions: ['view', 'edit', 'publish'] }, { module: 'branding', actions: ['view', 'edit'] }, { module: 'reports', actions: ['view', 'export'] }
            ], isDefault: false, isSystem: true, priority: 40 });
            await Role.create({ name: 'Content Manager', slug: 'content-manager', description: 'Manage homepage, branding, and reviews', permissions: [
                { module: 'homepage', actions: ['view', 'edit', 'publish'] }, { module: 'branding', actions: ['view', 'edit'] }, { module: 'reviews', actions: ['view', 'approve', 'reject'] }
            ], isDefault: false, isSystem: true, priority: 30 });
            await Role.create({ name: 'Analyst', slug: 'analyst', description: 'View reports and analytics', permissions: [
                { module: 'reports', actions: ['view', 'export'] }, { module: 'audit-logs', actions: ['view'] }
            ], isDefault: false, isSystem: true, priority: 20 });
            await Role.create({ name: 'Sales Manager', slug: 'sales-manager', description: 'Manage orders and customers', permissions: [
                { module: 'orders', actions: ['view', 'process', 'cancel', 'refund', 'export'] }, { module: 'customers', actions: ['view', 'edit', 'suspend'] }, { module: 'coupons', actions: ['view', 'create', 'edit'] }, { module: 'reports', actions: ['view', 'export'] }
            ], isDefault: false, isSystem: true, priority: 80 });
        } catch (e) { /* roles may already exist */ }
    }
}).catch(() => {});

SecurityPolicy.findOne().then(async (policy) => {
    if (!policy) {
        try { await SecurityPolicy.create({}); } catch (e) { /* ignore */ }
    }
}).catch(() => {});

router.use(authenticateToken, requireAdmin);

router.get('/settings', async (req, res) => {
    try {
        let settings = await Settings.findOne({});
        if (!settings) {
            settings = await Settings.create({});
        }
        const securityPolicy = await SecurityPolicy.findOne({});
        res.json({ success: true, data: { settings, securityPolicy } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.put('/settings', logAudit('update', 'settings'), async (req, res) => {
    try {
        let settings = await Settings.findOne({});
        if (!settings) {
            settings = new Settings({});
        }
        Object.keys(req.body).forEach(key => {
            if (key !== '_id' && key !== '__v' && key !== 'createdAt' && key !== 'updatedAt') {
                settings[key] = req.body[key];
            }
        });
        await settings.save();
        res.json({ success: true, data: settings });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/security', async (req, res) => {
    try {
        const policy = await SecurityPolicy.findOne({});
        res.json({ success: true, data: policy || {} });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.put('/security', logAudit('update', 'security'), async (req, res) => {
    try {
        const policy = await SecurityPolicy.findOneAndUpdate({}, req.body, { new: true, upsert: true });
        res.json({ success: true, data: policy });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/roles', async (req, res) => {
    try {
        const roles = await Role.find({}).sort({ priority: -1 });
        res.json({ success: true, data: roles });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/roles/:id', async (req, res) => {
    try {
        const role = await Role.findById(req.params.id);
        if (!role) return res.status(404).json({ success: false, message: 'Role not found' });
        res.json({ success: true, data: role });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/roles', logAudit('create', 'roles'), async (req, res) => {
    try {
        const { name, slug, description, permissions, priority } = req.body;
        if (!name || !slug) return res.status(400).json({ success: false, message: 'Name and slug are required' });
        const existing = await Role.findOne({ slug });
        if (existing) return res.status(400).json({ success: false, message: 'Role with this slug already exists' });
        const role = await Role.create({ name, slug, description, permissions: permissions || [], priority: priority || 0 });
        res.json({ success: true, data: role });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.put('/roles/:id', logAudit('edit', 'roles'), async (req, res) => {
    try {
        const role = await Role.findById(req.params.id);
        if (!role) return res.status(404).json({ success: false, message: 'Role not found' });
        if (role.isSystem && (req.body.name !== role.name || req.body.slug !== role.slug)) {
            return res.status(400).json({ success: false, message: 'System role name/slug cannot be changed' });
        }
        Object.assign(role, req.body);
        await role.save();
        res.json({ success: true, data: role });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.delete('/roles/:id', logAudit('delete', 'roles'), async (req, res) => {
    try {
        const role = await Role.findById(req.params.id);
        if (!role) return res.status(404).json({ success: false, message: 'Role not found' });
        if (role.isSystem) return res.status(400).json({ success: false, message: 'System roles cannot be deleted' });
        const usersWithRole = await User.countDocuments({ roleId: req.params.id });
        if (usersWithRole > 0) return res.status(400).json({ success: false, message: `Cannot delete role assigned to ${usersWithRole} user(s)` });
        await Role.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Role deleted' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/admin-users', async (req, res) => {
    try {
        const { page = 1, limit = 20, search, status, role } = req.query;
        const query = { role: { $in: ['admin'] } };
        if (search) query.$or = [{ name: { $regex: search, $options: 'i' } }, { email: { $regex: search, $options: 'i' } }];
        if (status) query.status = status;
        if (role) query.roleId = role;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [users, total] = await Promise.all([
            User.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).populate('roleId', 'name slug'),
            User.countDocuments(query)
        ]);
        res.json({ success: true, data: users, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/admin-users/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id).populate('roleId', 'name slug');
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        res.json({ success: true, data: user });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/admin-users', logAudit('create', 'admin-users'), async (req, res) => {
    try {
        const { name, username, email, password, roleId, phone, notes, department, jobTitle, employeeId, profilePhoto } = req.body;
        if (!name || !email || !password) return res.status(400).json({ success: false, message: 'Name, email, and password are required' });
        const existing = await User.findOne({ email });
        if (existing) return res.status(400).json({ success: false, message: 'Email already exists' });
        const role = await Role.findById(roleId);
        if (!role) return res.status(400).json({ success: false, message: 'Role not found' });
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const user = await User.create({ name, username: username || name.toLowerCase().replace(/\s+/g, '.'), email, password: hashedPassword, role: 'admin', roleId, phone, notes, department, jobTitle, employeeId, profilePhoto, status: 'active' });
        res.json({ success: true, data: { _id: user._id, name: user.name, username: user.username, email: user.email, role: user.role, roleId: user.roleId, department: user.department, jobTitle: user.jobTitle, employeeId: user.employeeId, status: user.status, createdAt: user.createdAt } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.put('/admin-users/:id', logAudit('edit', 'admin-users'), async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        const { name, username, roleId, phone, notes, status, department, jobTitle, employeeId, profilePhoto } = req.body;
        if (name) user.name = name;
        if (username !== undefined) user.username = username;
        if (roleId) {
            const role = await Role.findById(roleId);
            if (!role) return res.status(400).json({ success: false, message: 'Role not found' });
            user.roleId = roleId;
        }
        if (phone !== undefined) user.phone = phone;
        if (notes !== undefined) user.notes = notes;
        if (status) user.status = status;
        if (department !== undefined) user.department = department;
        if (jobTitle !== undefined) user.jobTitle = jobTitle;
        if (employeeId !== undefined) user.employeeId = employeeId;
        if (profilePhoto !== undefined) user.profilePhoto = profilePhoto;
        await user.save();
        const populated = await User.findById(user._id).populate('roleId', 'name slug').populate('department', 'name');
        res.json({ success: true, data: populated });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.delete('/admin-users/:id', logAudit('delete', 'admin-users'), async (req, res) => {
    try {
        if (req.params.id === req.user._id.toString()) return res.status(400).json({ success: false, message: 'Cannot delete your own account' });
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        user.status = 'deleted';
        await user.save();
        res.json({ success: true, message: 'Admin user deactivated' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/admin-users/:id/suspend', logAudit('suspend', 'admin-users'), async (req, res) => {
    try {
        if (req.params.id === req.user._id.toString()) return res.status(400).json({ success: false, message: 'Cannot suspend your own account' });
        const user = await User.findByIdAndUpdate(req.params.id, { status: 'suspended' }, { new: true });
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        res.json({ success: true, data: user });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/admin-users/:id/activate', logAudit('edit', 'admin-users'), async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(req.params.id, { status: 'active' }, { new: true });
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        res.json({ success: true, data: user });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/admin-users/:id/reset-password', logAudit('reset-password', 'admin-users'), async (req, res) => {
    try {
        const { newPassword } = req.body;
        if (!newPassword || newPassword.length < 6) return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
        const user = await User.findByIdAndUpdate(req.params.id, { password: hashedPassword }, { new: true });
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        res.json({ success: true, message: 'Password reset successfully' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/audit-logs', async (req, res) => {
    try {
        const { page = 1, limit = 30, search, module, action, userId, startDate, endDate } = req.query;
        const query = {};
        if (search) query.$text = { $search: search };
        if (module) query.module = module;
        if (action) query.action = action;
        if (userId) query.userId = userId;
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [logs, total] = await Promise.all([
            AuditLog.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
            AuditLog.countDocuments(query)
        ]);
        res.json({ success: true, data: logs, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/audit-logs/export', async (req, res) => {
    try {
        const { module, action, userId, startDate, endDate } = req.query;
        const query = {};
        if (module) query.module = module;
        if (action) query.action = action;
        if (userId) query.userId = userId;
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }
        const logs = await AuditLog.find(query).sort({ createdAt: -1 }).limit(5000);
        const csv = ['User,Action,Module,Description,IP Address,Timestamp'];
        logs.forEach(log => {
            csv.push(`"${log.userName || ''}","${log.action}","${log.module}","${(log.description || '').replace(/"/g, '""')}","${log.ipAddress || ''}","${log.createdAt}"`);
        });
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=audit-logs.csv');
        res.send(csv.join('\n'));
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/maintenance', async (req, res) => {
    try {
        const policy = await SecurityPolicy.findOne({});
        res.json({ success: true, data: { maintenanceMode: policy ? policy.maintenanceMode : false, maintenanceMessage: policy ? policy.maintenanceMessage : '', maintenanceAllowAdmin: policy ? policy.maintenanceAllowAdmin : true } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.put('/maintenance', logAudit('toggle', 'maintenance'), async (req, res) => {
    try {
        const { maintenanceMode, maintenanceMessage } = req.body;
        const policy = await SecurityPolicy.findOneAndUpdate({}, { maintenanceMode, maintenanceMessage: maintenanceMessage || 'We are currently undergoing scheduled maintenance. Please check back shortly.' }, { new: true, upsert: true });
        res.json({ success: true, data: policy });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/backups', async (req, res) => {
    try {
        let settings = await Settings.findOne({});
        if (!settings) settings = await Settings.create({});
        res.json({ success: true, data: settings.backupHistory || [] });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/backups', logAudit('create', 'backup'), async (req, res) => {
    try {
        const backup = {
            date: new Date(),
            type: 'configuration',
            size: '~2KB',
            status: 'completed',
            initiatedBy: req.user.name
        };
        const settings = await Settings.findOneAndUpdate({}, { $push: { backupHistory: backup } }, { new: true, upsert: true });
        res.json({ success: true, data: backup, allBackups: settings.backupHistory || [] });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/test-email', logAudit('test', 'email-config'), async (req, res) => {
    try {
        const { smtpHost, smtpPort, username, password, senderName, senderEmail, testRecipient } = req.body;
        if (!testRecipient) return res.status(400).json({ success: false, message: 'Test recipient email required' });
        const nodemailer = require('nodemailer');
        const transporter = nodemailer.createTransport({
            host: smtpHost || 'smtp.ethereal.email',
            port: parseInt(smtpPort) || 587,
            secure: parseInt(smtpPort) === 465,
            auth: { user: username || 'test@ethereal.email', pass: password || 'test' }
        });
        const info = await transporter.sendMail({
            from: `"${senderName || 'Trendy Wardrobe'}" <${senderEmail || 'noreply@trendywardrobe.com'}>`,
            to: testRecipient,
            subject: 'Test Email from Trendy Wardrobe',
            html: '<h3>Test Email</h3><p>If you received this, email configuration is working correctly.</p>'
        });
        res.json({ success: true, message: 'Test email sent', data: { messageId: info.messageId } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to send test email: ' + err.message });
    }
});

// Department CRUD
const Department = require('../models/Department');

router.get('/departments', async (req, res) => {
    try {
        const departments = await Department.find({}).populate('managerId', 'name email profilePhoto').sort({ name: 1 });
        res.json({ success: true, data: departments });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/departments/:id', async (req, res) => {
    try {
        const dept = await Department.findById(req.params.id).populate('managerId', 'name email profilePhoto').populate('parentDepartment', 'name');
        if (!dept) return res.status(404).json({ success: false, message: 'Department not found' });
        const userCount = await User.countDocuments({ department: req.params.id });
        res.json({ success: true, data: { ...dept.toObject(), userCount } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/departments', logAudit('create', 'admin-users'), async (req, res) => {
    try {
        const { name, description, managerId, parentDepartment, color, icon } = req.body;
        if (!name) return res.status(400).json({ success: false, message: 'Name is required' });
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        const dept = await Department.create({ name, slug, description, managerId, parentDepartment, color: color || '#6366f1', icon: icon || 'fa-building' });
        res.status(201).json({ success: true, data: dept });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.put('/departments/:id', logAudit('edit', 'admin-users'), async (req, res) => {
    try {
        const dept = await Department.findById(req.params.id);
        if (!dept) return res.status(404).json({ success: false, message: 'Department not found' });
        const { name, description, managerId, parentDepartment, color, icon, isActive } = req.body;
        if (name) { dept.name = name; dept.slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }
        if (description !== undefined) dept.description = description;
        if (managerId !== undefined) dept.managerId = managerId;
        if (parentDepartment !== undefined) dept.parentDepartment = parentDepartment || null;
        if (color !== undefined) dept.color = color;
        if (icon !== undefined) dept.icon = icon;
        if (isActive !== undefined) dept.isActive = isActive;
        await dept.save();
        res.json({ success: true, data: dept });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.delete('/departments/:id', logAudit('delete', 'admin-users'), async (req, res) => {
    try {
        const usersInDept = await User.countDocuments({ department: req.params.id });
        if (usersInDept > 0) return res.status(400).json({ success: false, message: `Cannot delete department with ${usersInDept} active user(s)` });
        await Department.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Department deleted' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Sessions management
const Session = require('../models/Session');

router.get('/sessions', async (req, res) => {
    try {
        const { page = 1, limit = 20, userId } = req.query;
        const query = {};
        if (userId) query.userId = userId;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [sessions, total] = await Promise.all([
            Session.find(query).sort({ lastActivity: -1 }).skip(skip).limit(parseInt(limit)).populate('userId', 'name email'),
            Session.countDocuments(query)
        ]);
        res.json({ success: true, data: sessions, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.delete('/sessions/:id', logAudit('force-logout', 'admin-users'), async (req, res) => {
    try {
        const session = await Session.findById(req.params.id);
        if (!session) return res.status(404).json({ success: false, message: 'Session not found' });
        session.isActive = false;
        session.terminatedAt = new Date();
        session.terminatedBy = 'admin force logout';
        await session.save();
        res.json({ success: true, message: 'Session terminated' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/admin-users/:id/force-logout', logAudit('force-logout', 'admin-users'), async (req, res) => {
    try {
        const result = await Session.updateMany({ userId: req.params.id, isActive: true }, { isActive: false, terminatedAt: new Date(), terminatedBy: 'admin force logout' });
        res.json({ success: true, message: `Terminated ${result.modifiedCount} session(s)` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Login attempts
const LoginAttempt = require('../models/LoginAttempt');

router.get('/login-attempts', async (req, res) => {
    try {
        const { page = 1, limit = 30, email, success } = req.query;
        const query = {};
        if (email) query.email = email;
        if (success !== undefined) query.success = success === 'true';
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [attempts, total] = await Promise.all([
            LoginAttempt.find(query).sort({ attemptedAt: -1 }).skip(skip).limit(parseInt(limit)),
            LoginAttempt.countDocuments(query)
        ]);
        res.json({ success: true, data: attempts, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Enhanced roles with user count
router.get('/roles', async (req, res) => {
    try {
        const roles = await Role.find({}).sort({ priority: -1 }).lean();
        const roleIds = roles.map(r => r._id);
        const counts = await User.aggregate([
            { $match: { roleId: { $in: roleIds } } },
            { $group: { _id: '$roleId', count: { $sum: 1 } } }
        ]);
        const countMap = {};
        counts.forEach(c => { countMap[c._id.toString()] = c.count; });
        const enriched = roles.map(r => ({ ...r, userCount: countMap[r._id.toString()] || 0 }));
        res.json({ success: true, data: enriched });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Notification settings for admins
const Notification = require('../models/Notification');

router.get('/notifications', async (req, res) => {
    try {
        const { page = 1, limit = 20, unread } = req.query;
        const query = {};
        if (unread === 'true') query.read = false;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [notifications, total, unreadCount] = await Promise.all([
            Notification.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
            Notification.countDocuments(query),
            Notification.countDocuments({ read: false })
        ]);
        res.json({ success: true, data: notifications, total, unread: unreadCount, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.put('/notifications/read-all', async (req, res) => {
    try {
        await Notification.updateMany({}, { read: true });
        res.json({ success: true, message: 'All notifications marked as read' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Role duplicate endpoint
router.post('/roles/:id/duplicate', logAudit('create', 'roles'), async (req, res) => {
    try {
        const source = await Role.findById(req.params.id);
        if (!source) return res.status(404).json({ success: false, message: 'Source role not found' });
        const newName = req.body.name || source.name + ' (Copy)';
        const newSlug = req.body.slug || source.slug + '-copy-' + Date.now();
        const role = await Role.create({ name: newName, slug: newSlug, description: source.description, permissions: source.permissions.map(p => ({ ...p, actions: [...p.actions] })), isDefault: false, isSystem: false, priority: source.priority });
        res.json({ success: true, data: role });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
