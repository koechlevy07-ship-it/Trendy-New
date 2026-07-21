const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Session = require('../models/Session');
const SecurityPolicy = require('../models/SecurityPolicy');

const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ success: false, message: 'No token provided' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select('-password');
        if (!user) {
            return res.status(401).json({ success: false, message: 'User not found' });
        }
        if (user.status === 'suspended' || user.status === 'blocked') {
            return res.status(403).json({ success: false, message: 'Account is suspended or blocked' });
        }
        const session = await Session.findOne({ token, isActive: true });
        if (!session) {
            return res.status(401).json({ success: false, message: 'Session expired or terminated' });
        }
        session.lastActivity = new Date();
        await session.save();
        req.user = user;
        req.session = session;
        req.token = token;
        next();
    } catch (err) {
        return res.status(403).json({ success: false, message: 'Invalid token' });
    }
};

const optionalAuth = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return next();
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select('-password');
        if (user && user.status === 'active') {
            req.user = user;
            req.token = token;
        }
    } catch (e) {}
    next();
};

const requireAdmin = (req, res, next) => {
    if (!req.user) return res.status(401).json({ success: false, message: 'Authentication required' });
    if (req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    next();
};

const requireTwoFactor = async (req, res, next) => {
    try {
        const policy = await SecurityPolicy.findOne();
        if (policy && policy.enforceTwoFactor) {
            const user = req.user;
            if (user.role === 'admin' && !user.twoFactorEnabled) {
                return res.status(403).json({ success: false, message: 'Two-factor authentication required. Please configure 2FA.' });
            }
        }
        next();
    } catch (e) {
        next();
    }
};

const requireStatus = (...statuses) => (req, res, next) => {
    if (!req.user) return res.status(401).json({ success: false, message: 'Authentication required' });
    if (!statuses.includes(req.user.status)) {
        return res.status(403).json({ success: false, message: 'Account status does not allow this action' });
    }
    next();
};

module.exports = { authenticateToken, optionalAuth, requireAdmin, requireTwoFactor, requireStatus };