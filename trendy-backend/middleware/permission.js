const Role = require('../models/Role');
const AuditLog = require('../models/AuditLog');

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

const requireModuleAccess = (...modules) => async (req, res, next) => {
    try {
        const user = req.user;
        if (user.role === 'admin') return next();
        const role = await Role.findById(user.roleId);
        if (!role) return res.status(403).json({ success: false, message: 'Role not found' });
        const hasAccess = modules.some(m => role.permissions.some(p => p.module === m && p.actions.includes('view')));
        if (!hasAccess) return res.status(403).json({ success: false, message: 'Access denied' });
        next();
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const logAudit = (action, module, resourceId = '', previousValue = null, newValue = null) => {
    return async (req, res, next) => {
        const originalJson = res.json.bind(res);
        res.json = async function (body) {
            try {
                if (res.statusCode < 400) {
                    const audit = new AuditLog({
                        userId: req.user?._id,
                        userName: req.user?.name || 'System',
                        userRole: req.user?.role || 'system',
                        action,
                        module,
                        description: `${action} on ${module}${resourceId ? ' - ' + resourceId : ''}`,
                        resourceId: resourceId || '',
                        previousValue: previousValue || undefined,
                        newValue: newValue || undefined,
                        ipAddress: req.ip || req.connection?.remoteAddress || '',
                        userAgent: req.headers['user-agent'] || '',
                        status: 'success'
                    });
                    await audit.save();
                }
            } catch (e) {}
            return originalJson(body);
        };
        next();
    };
};

module.exports = { checkPermission, requireModuleAccess, logAudit };
