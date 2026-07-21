// services/sessionService.js
const Session = require('../models/Session');

const sessionService = {};

sessionService.getUserSessions = async (userId, page = 1, limit = 20) => {
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [sessions, total] = await Promise.all([
        Session.find({ userId, isActive: true })
            .sort({ lastActivity: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .populate('userId', 'name email roleId')
            .populate('deviceId', 'name type'),
        Session.countDocuments({ userId, isActive: true })
    ]);
    
    return {
        data: sessions,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit))
    };
};

sessionService.terminateSession = async (sessionId, userId) => {
    const session = await Session.findOneAndUpdate(
        { _id: sessionId, userId, isActive: true },
        { isActive: false, terminatedAt: new Date(), terminatedBy: 'admin force logout' },
        { new: true }
    );
    
    if (!session) {
        throw new Error('Session not found or already terminated');
    }
    
    return session;
};

sessionService.terminateAllUserSessions = async (userId, excludeSessionId) => {
    const updateQuery = { isActive: false, terminatedAt: new Date(), terminatedBy: 'admin force logout' };
    if (excludeSessionId) {
        updateQuery.$and = [ { _id: { $ne: excludeSessionId } } ];
    }
    
    const result = await Session.updateMany(
        { userId, isActive: true, ...(excludeSessionId ? { _id: { $ne: excludeSessionId } } : {}) },
        updateQuery
    );
    
    return result;
};

sessionService.cleanupExpiredSessions = async () => {
    const result = await Session.updateMany(
        { expiresAt: { $lt: new Date() }, isActive: true },
        { isActive: false, terminatedAt: new Date(), terminatedBy: 'expired' }
    );
    return result;
};

module.exports = sessionService;
