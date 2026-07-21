const mongoose = require('mongoose');
const deviceSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    fingerprint: { type: String, required: true },
    name: { type: String, default: 'Unknown Device' },
    type: { type: String, enum: ['desktop', 'laptop', 'tablet', 'mobile', 'unknown'], default: 'unknown' },
    browser: { type: String, default: '' },
    os: { type: String, default: '' },
    ipAddress: { type: String, default: '' },
    location: { type: String, default: '' },
    isTrusted: { type: Boolean, default: false },
    lastUsed: { type: Date, default: Date.now },
    firstSeen: { type: Date, default: Date.now }
}, { timestamps: true });
deviceSchema.index({ userId: 1, fingerprint: 1 }, { unique: true });
module.exports = mongoose.model('Device', deviceSchema);
