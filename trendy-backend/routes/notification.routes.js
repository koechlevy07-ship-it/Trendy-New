const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const { authenticateToken } = require('../middleware/auth');

router.get('/', authenticateToken, async (req, res) => {
    try {
        const notifications = await Notification.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(50);
        const unreadCount = await Notification.countDocuments({ userId: req.user.id, read: false });
        res.json({ success: true, data: notifications, unreadCount });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

router.put('/:id/read', authenticateToken, async (req, res) => {
    try {
        await Notification.findByIdAndUpdate(req.params.id, { read: true });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

router.put('/read-all', authenticateToken, async (req, res) => {
    try {
        await Notification.updateMany({ userId: req.user.id, read: false }, { read: true });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

async function addNotification(userId, type, message, data = {}) {
    try {
        await Notification.create({ userId, type, message, data });
    } catch (err) {
        console.error('Notification error:', err);
    }
}

module.exports = router;
module.exports.addNotification = addNotification;
