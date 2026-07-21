// services/authService.js
const User = require('../models/User');
const Session = require('../models/Session');
const Device = require('../models/Device');
const LoginAttempt = require('../models/LoginAttempt');
const AuditLog = require('../models/AuditLog');
const SecurityPolicy = require('../models/SecurityPolicy');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const authService = {};

authService.findUserByEmail = async (email) => {
    return await User.findOne({ email }).select('-password');
};

authService.createSession = async (user, token, refreshToken, clientInfo) => {
    const policy = await SecurityPolicy.findOne();
    const maxSessions = policy?.maxSessionsPerUser || 5;
    
    const activeSessions = await Session.countDocuments({ userId: user._id, isActive: true });
    if (activeSessions >= maxSessions) {
        const oldest = await Session.findOne({ userId: user._id, isActive: true }).sort({ lastActivity: 1 });
        if (oldest) {
            oldest.isActive = false;
            oldest.terminatedAt = new Date();
            oldest.terminatedBy = 'system (max sessions)';
            await oldest.save();
        }
    }
    
    const session = new Session({
        userId: user._id,
        token,
        refreshToken,
        ...clientInfo,
        isActive: true,
        isCurrent: true,
        lastActivity: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    });
    await session.save();
    return session;
};

authService.validatePassword = async (password, hashedPassword) => {
    return await bcrypt.compare(password, hashedPassword);
};

authService.hashPassword = async (password) => {
    return await bcrypt.hash(password, 10);
};

authService.getClientInfo = (req) => {
    return {
        ipAddress: req.ip || req.connection?.remoteAddress || '',
        userAgent: req.headers['user-agent'] || '',
        browser: req.headers['user-agent']?.includes('Chrome') ? 'Chrome' : req.headers['user-agent']?.includes('Firefox') ? 'Firefox' : req.headers['user-agent']?.includes('Safari') ? 'Safari' : 'Unknown',
        os: req.headers['user-agent']?.includes('Windows') ? 'Windows' : req.headers['user-agent']?.includes('Mac') ? 'macOS' : req.headers['user-agent']?.includes('Linux') ? 'Linux' : 'Unknown',
        device: req.headers['user-agent']?.includes('Mobile') ? 'Mobile' : 'Desktop'
    };
};

authService.logLoginAttempt = async (email, userId, success, reason, clientInfo) => {
    const attempt = new LoginAttempt({
        email,
        userId,
        success,
        failureReason: reason || '',
        ...clientInfo
    });
    await attempt.save();
};

authService.checkBruteForce = async (email, policy) => {
    const maxAttempts = policy?.maxLoginAttempts || 5;
    const timeWindow = 15 * 60 * 1000; // 15 minutes
    
    const recentFailures = await LoginAttempt.countDocuments({
        email,
        success: false,
        attemptedAt: { $gte: new Date(Date.now() - timeWindow) }
    });
    
    return recentFailures < maxAttempts;
};

authService.getSecurityPolicy = async () => {
    let policy = await SecurityPolicy.findOne({});
    if (!policy) {
        policy = await SecurityPolicy.create({});
    }
    return policy;
};

authService.enforcePasswordPolicy = (password, policy) => {
    const minLength = policy?.passwordMinLength || 8;
    if (password.length < minLength) {
        return false;
    }
    
    if (policy?.passwordRequireUppercase && !/[A-Z]/.test(password)) {
        return false;
    }
    
    if (policy?.passwordRequireLowercase && !/[a-z]/.test(password)) {
        return false;
    }
    
    if (policy?.passwordRequireNumber && !/[0-9]/.test(password)) {
        return false;
    }
    
    if (policy?.passwordRequireSpecial && !/[@$!%*?&]/.test(password)) {
        return false;
    }
    
    return true;
};

authService.generateTokens = (user) => {
    const token = jwt.sign(
        { id: user._id, email: user.email, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
    );
    const refreshToken = crypto.randomBytes(40).toString('hex');
    return { token, refreshToken };
};

authService.createDevice = async (userId, fingerprint) => {
    let device = await Device.findOne({ userId, fingerprint });
    if (!device) {
        device = new Device({
            userId,
            fingerprint,
            lastUsed: new Date()
        });
        await device.save();
    } else {
        device.lastUsed = new Date();
        await device.save();
    }
    return device;
};

module.exports = authService;
