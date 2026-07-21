const mongoose = require('mongoose');
const sessionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    token: { type: String, required: true, unique: true },
    refreshToken: { type: String, unique: true, sparse: true },
    ipAddress: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    browser: { type: String, default: '' },
    os: { type: String, default: '' },
    device: { type: String, default: '' },
    deviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Device', default: null },
    location: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    isCurrent: { type: Boolean, default: false },
    lastActivity: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    terminatedAt: { type: Date, default: null },
    terminatedBy: { type: String, default: '' }
}, { timestamps: true });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
sessionSchema.index({ userId: 1, isActive: 1 });
module.exports = mongoose.model('Session', sessionSchema);
