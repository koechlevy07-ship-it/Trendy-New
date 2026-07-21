// controllers/adminController.js
const User = require('../models/User');
const Role = require('../models/Role');
const Department = require('../models/Department');
const AuditLog = require('../models/AuditLog');
const bcrypt = require('bcryptjs');
const { validate, schemas } = require('../middleware/validate');
const { generateSlug } = require('../utils/helpers');

// Admin User Controllers
const adminController = {};

adminController.getUsers = async (req, res) => {
    try {
        const { page = 1, limit = 20, search, status, role, department } = req.query;
        const query = { role: { $in: ['admin'] } };
        
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { username: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } }
            ];
        }
        
        if (status) query.status = status;
        if (role) query.roleId = role;
        if (department) query.department = department;
        
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [users, total] = await Promise.all([
            User.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .populate('roleId', 'name slug')
                .populate('department', 'name color'),
            User.countDocuments(query)
        ]);
        
        res.json({ success: true, data: users, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

adminController.getUserById = async (req, res) => {
    try {
        const user = await User.findById(req.params.id)
            .populate('roleId', 'name slug')
            .populate('department', 'name color');
        
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        
        res.json({ success: true, data: user });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

adminController.createUser = async (req, res) => {
    try {
        const userData = { ...req.body };
        
        if (!userData.name || !userData.email || !userData.password) {
            return res.status(400).json({ success: false, message: 'Name, email, and password are required' });
        }
        
        const existingUser = await User.findOne({ email: userData.email });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Email already exists' });
        }
        
        if (userData.username) {
            const existingUsername = await User.findOne({ username: userData.username });
            if (existingUsername) {
                return res.status(400).json({ success: false, message: 'Username already taken' });
            }
        } else {
            const baseUsername = userData.name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/(^-|-$)/g, '');
            userData.username = baseUsername;
            let counter = 1;
            while (await User.findOne({ username: `${userData.username}${counter}` })) {
                counter++;
            }
            userData.username = `${userData.username}${counter}`;
        }
        
        const hashedPassword = await bcrypt.hash(userData.password, 10);
        userData.password = hashedPassword;
        userData.role = 'admin';
        userData.status = 'active';
        
        const user = await User.create(userData);
        await AuditLog.create({
            userId: req.user._id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'create',
            module: 'admin-users',
            description: `Created admin user: ${user.name}`,
            resourceId: user._id,
            newValue: user,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            status: 'success'
        });
        
        const populatedUser = await User.findById(user._id)
            .populate('roleId', 'name slug')
            .populate('department', 'name color');
        
        res.status(201).json({ success: true, data: populatedUser });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

adminController.updateUser = async (req, res) => {
    try {
        const updates = { ...req.body };
        
        if (updates.email && updates.email !== req.user.email) {
            const existingUser = await User.findOne({ email: updates.email });
            if (existingUser && existingUser._id.toString() !== req.params.id) {
                return res.status(400).json({ success: false, message: 'Email already exists' });
            }
        }
        
        if (updates.username && updates.username !== req.user.username) {
            const existingUsername = await User.findOne({ username: updates.username });
            if (existingUsername && existingUsername._id.toString() !== req.params.id) {
                return res.status(400).json({ success: false, message: 'Username already taken' });
            }
        }
        
        if (updates.password) {
            updates.password = await bcrypt.hash(updates.password, 10);
        }
        
        const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true })
            .populate('roleId', 'name slug')
            .populate('department', 'name color');
        
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        
        await AuditLog.create({
            userId: req.user._id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'edit',
            module: 'admin-users',
            description: `Updated admin user: ${user.name}`,
            resourceId: user._id,
            newValue: user,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            status: 'success'
        });
        
        res.json({ success: true, data: user });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

adminController.deleteUser = async (req, res) => {
    try {
        if (req.params.id === req.user._id.toString()) {
            return res.status(400).json({ success: false, message: 'Cannot delete your own account' });
        }
        
        const user = await User.findByIdAndUpdate(req.params.id, { status: 'deleted' }, { new: true });
        
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        
        await AuditLog.create({
            userId: req.user._id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'delete',
            module: 'admin-users',
            description: `Deleted admin user: ${user.name}`,
            resourceId: user._id,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            status: 'success'
        });
        
        res.json({ success: true, message: 'Admin user deactivated' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

adminController.suspendUser = async (req, res) => {
    try {
        if (req.params.id === req.user._id.toString()) {
            return res.status(400).json({ success: false, message: 'Cannot suspend your own account' });
        }
        
        const user = await User.findByIdAndUpdate(req.params.id, { status: 'suspended' }, { new: true });
        
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        
        await AuditLog.create({
            userId: req.user._id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'suspend',
            module: 'admin-users',
            description: `Suspended admin user: ${user.name}`,
            resourceId: user._id,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            status: 'success'
        });
        
        res.json({ success: true, data: user });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

adminController.activateUser = async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(req.params.id, { status: 'active' }, { new: true });
        
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        
        await AuditLog.create({
            userId: req.user._id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'activate',
            module: 'admin-users',
            description: `Activated admin user: ${user.name}`,
            resourceId: user._id,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            status: 'success'
        });
        
        res.json({ success: true, data: user });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

adminController.resetUserPassword = async (req, res) => {
    try {
        const { newPassword } = req.body;
        if (!newPassword || newPassword.length < 8) {
            return res.status(400).json({ success: false, message: 'New password must be at least 8 characters long' });
        }
        
        const user = await User.findByIdAndUpdate(req.params.id, {
            password: await bcrypt.hash(newPassword, 10)
        }, { new: true });
        
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        
        await User.updateMany(
            { userId: user._id, isActive: true },
            { isActive: false, terminatedAt: new Date(), terminatedBy: 'admin password reset' }
        );
        
        await AuditLog.create({
            userId: req.user._id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'reset-password',
            module: 'admin-users',
            description: `Reset password for admin user: ${user.name}`,
            resourceId: user._id,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            status: 'success'
        });
        
        res.json({ success: true, message: 'Password reset successfully' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

adminController.forceLogoutUser = async (req, res) => {
    try {
        const result = await require('../models/Session').updateMany(
            { userId: req.params.id, isActive: true },
            { isActive: false, terminatedAt: new Date(), terminatedBy: 'admin force logout' }
        );
        
        await AuditLog.create({
            userId: req.user._id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'force-logout',
            module: 'admin-users',
            description: `Force-logged out admin user: ${user.name}`,
            resourceId: req.params.id,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            status: 'success'
        });
        
        res.json({ success: true, message: `Terminated ${result.modifiedCount} session(s)` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// Role Controllers
adminController.getRoles = async (req, res) => {
    try {
        const roles = await Role.find({}).sort({ priority: -1 });
        const roleIds = roles.map(r => r._id);
        const counts = await User.aggregate([
            { $match: { roleId: { $in: roleIds } } },
            { $group: { _id: '$roleId', count: { $sum: 1 } } }
        ]);
        const countMap = {};
        counts.forEach(c => { countMap[c._id.toString()] = c.count; });
        const enriched = roles.map(r => ({ ...r.toObject(), userCount: countMap[r._id.toString()] || 0 }));
        
        res.json({ success: true, data: enriched });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

adminController.getRoleById = async (req, res) => {
    try {
        const role = await Role.findById(req.params.id);
        if (!role) return res.status(404).json({ success: false, message: 'Role not found' });
        
        res.json({ success: true, data: role });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

adminController.createRole = async (req, res) => {
    try {
        const { name, slug, description, permissions, priority } = req.body;
        if (!name || !slug) {
            return res.status(400).json({ success: false, message: 'Name and slug are required' });
        }
        
        const existing = await Role.findOne({ slug });
        if (existing) {
            return res.status(400).json({ success: false, message: 'Role with this slug already exists' });
        }
        
        const role = await Role.create({
            name,
            slug,
            description,
            permissions: permissions || [],
            priority: priority || 0,
            isSystem: false,
            isDefault: false
        });
        
        await AuditLog.create({
            userId: req.user._id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'create',
            module: 'roles',
            description: `Created role: ${role.name}`,
            resourceId: role._id,
            newValue: role,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            status: 'success'
        });
        
        res.status(201).json({ success: true, data: role });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

adminController.updateRole = async (req, res) => {
    try {
        const role = await Role.findById(req.params.id);
        if (!role) return res.status(404).json({ success: false, message: 'Role not found' });
        
        if (role.isSystem && (req.body.name !== role.name || req.body.slug !== role.slug)) {
            return res.status(400).json({ success: false, message: 'System role name/slug cannot be changed' });
        }
        
        const updated = { ...req.body };
        if (updated.name && updated.name !== role.name && typeof updated.name !== 'undefined') role.name = updated.name;
        if (updated.slug && updated.slug !== role.slug && typeof updated.slug !== 'undefined') role.slug = updated.slug;
        if (updated.description !== undefined) role.description = updated.description;
        if (updated.priority !== undefined) role.priority = updated.priority;
        if (updated.permissions !== undefined) role.permissions = updated.permissions;
        
        await role.save();
        
        await AuditLog.create({
            userId: req.user._id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'edit',
            module: 'roles',
            description: `Updated role: ${role.name}`,
            resourceId: role._id,
            newValue: role,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            status: 'success'
        });
        
        res.json({ success: true, data: role });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

adminController.deleteRole = async (req, res) => {
    try {
        const role = await Role.findById(req.params.id);
        if (!role) return res.status(404).json({ success: false, message: 'Role not found' });
        
        if (role.isSystem) {
            return res.status(400).json({ success: false, message: 'System roles cannot be deleted' });
        }
        
        const usersWithRole = await User.countDocuments({ roleId: req.params.id });
        if (usersWithRole > 0) {
            return res.status(400).json({ success: false, message: `Cannot delete role assigned to ${usersWithRole} user(s)` });
        }
        
        await Role.findByIdAndDelete(req.params.id);
        
        await AuditLog.create({
            userId: req.user._id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'delete',
            module: 'roles',
            description: `Deleted role: ${role.name}`,
            resourceId: role._id,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            status: 'success'
        });
        
        res.json({ success: true, message: 'Role deleted' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

adminController.duplicateRole = async (req, res) => {
    try {
        const source = await Role.findById(req.params.id);
        if (!source) {
            return res.status(404).json({ success: false, message: 'Source role not found' });
        }
        
        const newName = req.body.name || `${source.name} (Copy)`;
        const newSlug = req.body.slug || `${source.slug}-copy-${Date.now()}`;
        
        const role = await Role.create({
            name: newName,
            slug: newSlug,
            description: source.description,
            permissions: source.permissions.map(p => ({ ...p, actions: [...p.actions] })),
            isDefault: false,
            isSystem: false,
            priority: source.priority
        });
        
        await AuditLog.create({
            userId: req.user._id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'create',
            module: 'roles',
            description: `Duplicated role: ${source.name} to ${role.name}`,
            resourceId: role._id,
            newValue: role,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            status: 'success'
        });
        
        res.json({ success: true, data: role });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// Department Controllers
adminController.getDepartments = async (req, res) => {
    try {
        const departments = await Department.find({})
            .populate('managerId', 'name email profilePhoto')
            .populate('parentDepartment', 'name')
            .sort({ name: 1 });
        
        const enriched = await Promise.all(departments.map(async dept => {
            const userCount = await User.countDocuments({ department: dept._id });
            return { ...dept.toObject(), userCount };
        }));
        
        res.json({ success: true, data: enriched });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

adminController.getDepartmentById = async (req, res) => {
    try {
        const dept = await Department.findById(req.params.id)
            .populate('managerId', 'name email profilePhoto')
            .populate('parentDepartment', 'name');
        
        if (!dept) return res.status(404).json({ success: false, message: 'Department not found' });
        
        const userCount = await User.countDocuments({ department: req.params.id });
        res.json({ success: true, data: { ...dept.toObject(), userCount } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

adminController.createDepartment = async (req, res) => {
    try {
        const { name, description, managerId, parentDepartment, color, icon } = req.body;
        
        if (!name) {
            return res.status(400).json({ success: false, message: 'Name is required' });
        }
        
        const slug = generateSlug(name);
        
        const dept = await Department.create({
            name,
            slug,
            description,
            managerId,
            parentDepartment,
            color: color || '#6366f1',
            icon: icon || 'fa-building',
            isActive: true
        });
        
        await AuditLog.create({
            userId: req.user._id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'create',
            module: 'admin-users',
            description: `Created department: ${dept.name}`,
            resourceId: dept._id,
            newValue: dept,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            status: 'success'
        });
        
        res.status(201).json({ success: true, data: dept });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

adminController.updateDepartment = async (req, res) => {
    try {
        const dept = await Department.findById(req.params.id);
        if (!dept) return res.status(404).json({ success: false, message: 'Department not found' });
        
        const updates = { ...req.body };
        if (updates.name) {
            dept.name = updates.name;
            dept.slug = generateSlug(updates.name);
        }
        if (updates.description !== undefined) dept.description = updates.description;
        if (updates.managerId !== undefined) dept.managerId = updates.managerId;
        if (updates.parentDepartment !== undefined) dept.parentDepartment = updates.parentDepartment || null;
        if (updates.color !== undefined) dept.color = updates.color;
        if (updates.icon !== undefined) dept.icon = updates.icon;
        if (updates.isActive !== undefined) dept.isActive = updates.isActive;
        
        await dept.save();
        
        await AuditLog.create({
            userId: req.user._id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'edit',
            module: 'admin-users',
            description: `Updated department: ${dept.name}`,
            resourceId: dept._id,
            newValue: dept,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            status: 'success'
        });
        
        res.json({ success: true, data: dept });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

adminController.deleteDepartment = async (req, res) => {
    try {
        const usersInDept = await User.countDocuments({ department: req.params.id });
        if (usersInDept > 0) {
            return res.status(400).json({ success: false, message: `Cannot delete department with ${usersInDept} active user(s)` });
        }
        
        await Department.findByIdAndDelete(req.params.id);
        
        await AuditLog.create({
            userId: req.user._id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'delete',
            module: 'admin-users',
            description: `Deleted department ID: ${req.params.id}`,
            resourceId: req.params.id,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            status: 'success'
        });
        
        res.json({ success: true, message: 'Department deleted' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// Session Controllers
adminController.getSessions = async (req, res) => {
    try {
        const { page = 1, limit = 20, userId } = req.query;
        const query = {};
        if (userId) query.userId = userId;
        
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [sessions, total] = await Promise.all([
            require('../models/Session').find(query)
                .sort({ lastActivity: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .populate('userId', 'name email roleId')
                .populate('deviceId', 'name type'),
            require('../models/Session').countDocuments(query)
        ]);
        
        res.json({ success: true, data: sessions, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

adminController.terminateSession = async (req, res) => {
    try {
        const session = await require('../models/Session').findByIdAndUpdate(
            req.params.id,
            { isActive: false, terminatedAt: new Date(), terminatedBy: 'admin force logout' },
            { new: true }
        );
        
        if (!session) return res.status(404).json({ success: false, message: 'Session not found' });
        
        await AuditLog.create({
            userId: req.user._id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'force-logout',
            module: 'admin-users',
            description: `Terminated session for user: ${session.userId}`, // Note: should get user.name from populated
            resourceId: req.params.id,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            status: 'success'
        });
        
        res.json({ success: true, message: 'Session terminated' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

adminController.forceLogoutAllUserSessions = async (req, res) => {
    try {
        const userId = req.params.id;
        const result = await require('../models/Session').updateMany(
            { userId, isActive: true },
            { isActive: false, terminatedAt: new Date(), terminatedBy: 'admin force logout' }
        );
        
        const user = await User.findById(userId);
        await AuditLog.create({
            userId: req.user._id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'force-logout',
            module: 'admin-users',
            description: `Terminated all sessions for user: ${user?.name || userId}`, // Note: should get user.name
            resourceId: userId,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            status: 'success'
        });
        
        res.json({ success: true, message: `Terminated ${result.modifiedCount} session(s)` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// Audit Log Controllers
adminController.getAuditLogs = async (req, res) => {
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
            require('../models/AuditLog').find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .populate('userId', 'name email roleId'),
            require('../models/AuditLog').countDocuments(query)
        ]);
        
        res.json({ success: true, data: logs, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

adminController.exportAuditLogs = async (req, res) => {
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
        
        const logs = await require('../models/AuditLog').find(query).sort({ createdAt: -1 }).limit(5000);
        
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
};

// Security Policy Controllers
adminController.getSecurityPolicy = async (req, res) => {
    try {
        let policy = await require('../models/SecurityPolicy').findOne({});
        if (!policy) {
            policy = await require('../models/SecurityPolicy').create({});
        }
        
        res.json({ success: true, data: policy });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

adminController.updateSecurityPolicy = async (req, res) => {
    try {
        const policy = await require('../models/SecurityPolicy').findOneAndUpdate({}, req.body, { new: true, upsert: true });
        
        await AuditLog.create({
            userId: req.user._id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'edit',
            module: 'security',
            description: `Updated security policy`,
            resourceId: policy._id,
            newValue: policy,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            status: 'success'
        });
        
        res.json({ success: true, data: policy });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

module.exports = adminController;
