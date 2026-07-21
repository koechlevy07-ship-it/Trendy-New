// services/auditService.js
const AuditLog = require('../models/AuditLog');

const auditService = {};

auditService.log = async (action, module, resourceId = '', previousValue = null, newValue = null) => {
    try {
        return await AuditLog.create({
            action,
            module,
            resourceId,
            previousValue,
            newValue
        });
    } catch (err) {
        console.error('Audit log creation failed:', err);
    }
};

auditService.getLogs = async (filters = {}) => {
    try {
        const {
            page = 1,
            limit = 30,
            search,
            module,
            action,
            userId,
            startDate,
            endDate
        } = filters;
        
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
            AuditLog.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .populate('userId', 'name email roleId'),
            AuditLog.countDocuments(query)
        ]);
        
        return {
            data: logs,
            total,
            page: parseInt(page),
            pages: Math.ceil(total / parseInt(limit))
        };
    } catch (err) {
        throw new Error('Failed to get audit logs: ' + err.message);
    }
};

auditService.exportLogs = async (filters = {}) => {
    try {
        const {
            module,
            action,
            userId,
            startDate,
            endDate
        } = filters;
        
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
        
        return csv.join('\n');
    } catch (err) {
        throw new Error('Failed to export audit logs: ' + err.message);
    }
};

module.exports = auditService;
