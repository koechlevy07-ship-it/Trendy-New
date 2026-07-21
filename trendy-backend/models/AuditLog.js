const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    userName: { type: String, default: '' },
    userRole: { type: String, default: '' },
    action: { type: String, required: true },
    module: { type: String, required: true },
    description: { type: String, default: '' },
    resourceId: { type: String, default: '' },
    previousValue: { type: mongoose.Schema.Types.Mixed },
    newValue: { type: mongoose.Schema.Types.Mixed },
    ipAddress: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    status: { type: String, enum: ['success', 'failure'], default: 'success' }
}, { timestamps: true });

auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ module: 1, action: 1 });
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ action: 'text', description: 'text', userName: 'text', module: 'text' });

module.exports = mongoose.model('AuditLog', auditLogSchema);
