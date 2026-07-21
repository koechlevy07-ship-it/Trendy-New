const mongoose = require('mongoose');
const loginAttemptSchema = new mongoose.Schema({
    email: { type: String, required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    ipAddress: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    browser: { type: String, default: '' },
    os: { type: String, default: '' },
    device: { type: String, default: '' },
    location: { type: String, default: '' },
    success: { type: Boolean, default: false },
    failureReason: { type: String, default: '' },
    twoFactorVerified: { type: Boolean, default: false },
    attemptedAt: { type: Date, default: Date.now }
}, { timestamps: true });
loginAttemptSchema.index({ email: 1, attemptedAt: -1 });
loginAttemptSchema.index({ ipAddress: 1, attemptedAt: -1 });
module.exports = mongoose.model('LoginAttempt', loginAttemptSchema);
