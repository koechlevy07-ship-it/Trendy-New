const mongoose = require('mongoose');

const securityPolicySchema = new mongoose.Schema({
    passwordMinLength: { type: Number, default: 8 },
    passwordRequireUppercase: { type: Boolean, default: true },
    passwordRequireLowercase: { type: Boolean, default: true },
    passwordRequireNumber: { type: Boolean, default: true },
    passwordRequireSpecial: { type: Boolean, default: true },
    sessionTimeoutMinutes: { type: Number, default: 60 },
    maxLoginAttempts: { type: Number, default: 5 },
    accountLockoutMinutes: { type: Number, default: 30 },
    jwtExpiration: { type: String, default: '7d' },
    maxSessionsPerUser: { type: Number, default: 5 },
    enforceTwoFactor: { type: Boolean, default: false },
    ipWhitelist: { type: [String], default: [] },
    maintenanceMode: { type: Boolean, default: false },
    maintenanceMessage: { type: String, default: 'We are currently undergoing scheduled maintenance. Please check back shortly.' },
    maintenanceAllowAdmin: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('SecurityPolicy', securityPolicySchema);
