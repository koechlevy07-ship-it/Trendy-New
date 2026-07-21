const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Session = require('../models/Session');
const LoginAttempt = require('../models/LoginAttempt');
const Device = require('../models/Device');
const AuditLog = require('../models/AuditLog');
const SecurityPolicy = require('../models/SecurityPolicy');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { validate, schemas } = require('../middleware/validate');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const generateTokens = (user) => {
    const token = jwt.sign(
        { id: user._id, email: user.email, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
    );
    const refreshToken = crypto.randomBytes(40).toString('hex');
    return { token, refreshToken };
};

const getClientInfo = (req) => ({
    ipAddress: req.ip || req.connection?.remoteAddress || '',
    userAgent: req.headers['user-agent'] || '',
    browser: req.headers['user-agent']?.includes('Chrome') ? 'Chrome' : req.headers['user-agent']?.includes('Firefox') ? 'Firefox' : req.headers['user-agent']?.includes('Safari') ? 'Safari' : 'Unknown',
    os: req.headers['user-agent']?.includes('Windows') ? 'Windows' : req.headers['user-agent']?.includes('Mac') ? 'macOS' : req.headers['user-agent']?.includes('Linux') ? 'Linux' : 'Unknown',
    device: req.headers['user-agent']?.includes('Mobile') ? 'Mobile' : 'Desktop'
});

const createSession = async (user, token, refreshToken, clientInfo) => {
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

// POST /api/auth/register
router.post('/register', validate(schemas.register), async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const existing = await User.findOne({ email });
        if (existing) {
            return res.status(400).json({ success: false, message: 'Email already registered' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const ts = Date.now().toString(36).toUpperCase();
        const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
        const user = new User({
            name, email, password: hashedPassword,
            customerId: 'CUST-' + ts + rand,
            status: 'pending_verification',
            emailVerificationToken: crypto.randomBytes(32).toString('hex')
        });
        await user.save();
        await AuditLog.create({ userId: user._id, userName: name, userRole: 'customer', action: 'register', module: 'auth', description: 'New customer registered', ipAddress: req.ip, userAgent: req.headers['user-agent'], status: 'success' });
        const { token, refreshToken } = generateTokens(user);
        const clientInfo = getClientInfo(req);
        await createSession(user, token, refreshToken, clientInfo);
        res.status(201).json({
            success: true, token, refreshToken,
            user: { id: user._id, name: user.name, email: user.email, role: user.role }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// POST /api/auth/login
router.post('/login', validate(schemas.login), async (req, res) => {
    try {
        const { email, password } = req.body;
        const clientInfo = getClientInfo(req);
        const policy = await SecurityPolicy.findOne();

        const user = await User.findOne({ email });
        if (!user) {
            await LoginAttempt.create({ email, success: false, failureReason: 'User not found', ...clientInfo });
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        if (user.status === 'suspended' || user.status === 'blocked') {
            await LoginAttempt.create({ email, userId: user._id, success: false, failureReason: 'Account ' + user.status, ...clientInfo });
            return res.status(403).json({ success: false, message: 'Account is ' + user.status + '. Contact support.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            await LoginAttempt.create({ email, userId: user._id, success: false, failureReason: 'Invalid password', ...clientInfo });
            const maxAttempts = policy?.maxLoginAttempts || 5;
            const recentFailures = await LoginAttempt.countDocuments({ email, success: false, attemptedAt: { $gte: new Date(Date.now() - 15 * 60 * 1000) } });
            if (recentFailures >= maxAttempts) {
                user.status = 'suspended';
                await user.save();
                await AuditLog.create({ userId: user._id, userName: user.name, userRole: user.role, action: 'account_locked', module: 'auth', description: 'Account locked due to too many failed attempts', ipAddress: clientInfo.ipAddress, userAgent: clientInfo.userAgent, status: 'success' });
                return res.status(429).json({ success: false, message: 'Account locked due to too many failed attempts. Try again later.' });
            }
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        user.lastLogin = new Date();
        user.loginCount = (user.loginCount || 0) + 1;
        user.lastLoginIp = clientInfo.ipAddress;
        if (user.status === 'pending_verification') user.status = 'active';
        await user.save();

        const { token, refreshToken } = generateTokens(user);
        await createSession(user, token, refreshToken, clientInfo);
        await LoginAttempt.create({ email, userId: user._id, success: true, ...clientInfo });

        await AuditLog.create({ userId: user._id, userName: user.name, userRole: user.role, action: 'login', module: 'auth', description: 'User logged in', ipAddress: clientInfo.ipAddress, userAgent: clientInfo.userAgent, status: 'success' });

        const twoFactorRequired = policy?.enforceTwoFactor && user.role === 'admin' && !user.twoFactorEnabled;

        res.json({
            success: true, token, refreshToken,
            twoFactorRequired,
            user: { id: user._id, name: user.name, email: user.email, role: user.role, status: user.status }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// POST /api/auth/logout
router.post('/logout', authenticateToken, async (req, res) => {
    try {
        if (req.session) {
            req.session.isActive = false;
            req.session.terminatedAt = new Date();
            req.session.terminatedBy = 'user logout';
            await req.session.save();
        }
        await AuditLog.create({ userId: req.user._id, userName: req.user.name, userRole: req.user.role, action: 'logout', module: 'auth', description: 'User logged out', ipAddress: req.ip, userAgent: req.headers['user-agent'], status: 'success' });
        res.json({ success: true, message: 'Logged out successfully' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) return res.status(400).json({ success: false, message: 'Refresh token required' });
        const session = await Session.findOne({ refreshToken, isActive: true });
        if (!session) return res.status(401).json({ success: false, message: 'Invalid refresh token' });
        const user = await User.findById(session.userId).select('-password');
        if (!user || user.status === 'suspended' || user.status === 'blocked') {
            session.isActive = false;
            session.terminatedAt = new Date();
            session.terminatedBy = 'user status changed';
            await session.save();
            return res.status(403).json({ success: false, message: 'Account unavailable' });
        }
        const { token: newToken, refreshToken: newRefresh } = generateTokens(user);
        session.token = newToken;
        session.refreshToken = newRefresh;
        session.lastActivity = new Date();
        await session.save();
        res.json({ success: true, token: newToken, refreshToken: newRefresh });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ success: false, message: 'Email required' });
        const user = await User.findOne({ email });
        if (!user) return res.json({ success: true, message: 'If the email exists, a reset link has been sent.' });
        const resetToken = crypto.randomBytes(32).toString('hex');
        user.resetPasswordToken = resetToken;
        user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000);
        await user.save();
        await AuditLog.create({ userId: user._id, userName: user.name, userRole: user.role, action: 'forgot_password', module: 'auth', description: 'Password reset requested', ipAddress: req.ip, userAgent: req.headers['user-agent'], status: 'success' });
        res.json({ success: true, message: 'If the email exists, a reset link has been sent.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
    try {
        const { token, password } = req.body;
        if (!token || !password) return res.status(400).json({ success: false, message: 'Token and password required' });
        const user = await User.findOne({ resetPasswordToken: token, resetPasswordExpires: { $gt: new Date() } });
        if (!user) return res.status(400).json({ success: false, message: 'Invalid or expired reset token' });
        user.password = await bcrypt.hash(password, 10);
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();
        await Session.updateMany({ userId: user._id, isActive: true }, { isActive: false, terminatedAt: new Date(), terminatedBy: 'password reset' });
        await AuditLog.create({ userId: user._id, userName: user.name, userRole: user.role, action: 'reset_password', module: 'auth', description: 'Password reset completed', ipAddress: req.ip, userAgent: req.headers['user-agent'], status: 'success' });
        res.json({ success: true, message: 'Password reset successfully. Please login with your new password.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/auth/verify-email
router.post('/verify-email', async (req, res) => {
    try {
        const { token } = req.body;
        if (!token) return res.status(400).json({ success: false, message: 'Verification token required' });
        const user = await User.findOne({ emailVerificationToken: token });
        if (!user) return res.status(400).json({ success: false, message: 'Invalid verification token' });
        user.emailVerified = true;
        user.emailVerificationToken = undefined;
        if (user.status === 'pending_verification') user.status = 'active';
        await user.save();
        await AuditLog.create({ userId: user._id, userName: user.name, userRole: user.role, action: 'verify_email', module: 'auth', description: 'Email verified', ipAddress: req.ip, userAgent: req.headers['user-agent'], status: 'success' });
        res.json({ success: true, message: 'Email verified successfully' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/auth/change-password (authenticated)
router.post('/change-password', authenticateToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) return res.status(400).json({ success: false, message: 'Current and new password required' });
        const user = await User.findById(req.user._id);
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) return res.status(400).json({ success: false, message: 'Current password is incorrect' });
        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();
        await Session.updateMany({ userId: user._id, isActive: true, _id: { $ne: req.session?._id } }, { isActive: false, terminatedAt: new Date(), terminatedBy: 'password change' });
        await AuditLog.create({ userId: user._id, userName: user.name, userRole: user.role, action: 'change_password', module: 'auth', description: 'Password changed', ipAddress: req.ip, userAgent: req.headers['user-agent'], status: 'success' });
        res.json({ success: true, message: 'Password changed successfully' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/auth/me (authenticated)
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('-password -resetPasswordToken -resetPasswordExpires -emailVerificationToken');
        res.json({ success: true, user });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/auth/sessions (authenticated)
router.get('/sessions', authenticateToken, async (req, res) => {
    try {
        const sessions = await Session.find({ userId: req.user._id, isActive: true }).sort({ lastActivity: -1 });
        res.json({ success: true, data: sessions });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// DELETE /api/auth/sessions/:id (terminate a session)
router.delete('/sessions/:id', authenticateToken, async (req, res) => {
    try {
        const session = await Session.findOne({ _id: req.params.id, userId: req.user._id });
        if (!session) return res.status(404).json({ success: false, message: 'Session not found' });
        session.isActive = false;
        session.terminatedAt = new Date();
        session.terminatedBy = 'user terminated';
        await session.save();
        res.json({ success: true, message: 'Session terminated' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// DELETE /api/auth/sessions (terminate all other sessions)
router.delete('/sessions', authenticateToken, async (req, res) => {
    try {
        await Session.updateMany({ userId: req.user._id, isActive: true, _id: { $ne: req.session?._id } }, { isActive: false, terminatedAt: new Date(), terminatedBy: 'user terminated all' });
        res.json({ success: true, message: 'All other sessions terminated' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
