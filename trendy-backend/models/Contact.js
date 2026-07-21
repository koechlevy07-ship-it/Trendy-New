const mongoose = require('mongoose');

const replySchema = new mongoose.Schema({
    text: { type: String, required: true },
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    adminName: { type: String, default: '' },
    isInternal: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
}, { _id: true });

const assignmentHistorySchema = new mongoose.Schema({
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    assignedToName: { type: String, default: '' },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    assignedByName: { type: String, default: '' },
    assignedAt: { type: Date, default: Date.now }
}, { _id: true });

const contactSchema = new mongoose.Schema({
    ticketId: { type: String, unique: true, sparse: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, trim: true, default: '' },
    subject: { type: String, default: 'General Inquiry', trim: true },
    message: { type: String, required: true },
    status: {
        type: String,
        enum: ['new', 'open', 'read', 'in_progress', 'pending', 'waiting_for_customer', 'resolved', 'closed', 'spam'],
        default: 'new'
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
    },
    category: {
        type: String,
        enum: ['general', 'order', 'product', 'technical', 'feedback', 'complaint', 'shipping', 'returns', 'other'],
        default: 'general'
    },
    source: {
        type: String,
        enum: ['web', 'email', 'api', 'admin'],
        default: 'web'
    },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    assignedToName: { type: String, default: '' },
    assignedAt: { type: Date },
    assignmentHistory: [assignmentHistorySchema],
    replies: [replySchema],
    internalNotes: { type: String, default: '' },
    resolutionNotes: { type: String, default: '' },
    spamReason: { type: String, default: '' },
    firstReplyAt: { type: Date },
    responseTime: { type: Number, default: 0 },
    resolvedAt: { type: Date },
    closedAt: { type: Date },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

contactSchema.index({ createdAt: -1 });
contactSchema.index({ status: 1 });
contactSchema.index({ priority: 1 });
contactSchema.index({ category: 1 });
contactSchema.index({ email: 1 });
contactSchema.index({ assignedTo: 1 });
contactSchema.index({ ticketId: 1 });
contactSchema.index({ userId: 1 });

contactSchema.pre('save', function (next) {
    if (this.isNew && !this.ticketId) {
        const ts = Date.now().toString(36).toUpperCase();
        const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
        this.ticketId = `TKT-${ts}${rand}`;
    }
    if (this.isModified('status')) {
        if (this.status === 'resolved' && !this.resolvedAt) this.resolvedAt = new Date();
        if (this.status === 'closed' && !this.closedAt) this.closedAt = new Date();
        if (this.status === 'spam' && !this.spamReason) this.spamReason = this.spamReason || 'Marked as spam';
    }
    next();
});

module.exports = mongoose.model('Contact', contactSchema);
