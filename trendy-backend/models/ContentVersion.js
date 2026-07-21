const mongoose = require('mongoose');

const contentVersionSchema = new mongoose.Schema({
    contentType: { type: String, required: true, enum: ['homepage', 'page', 'testimonial', 'banner', 'footer'], index: true },
    contentId: { type: String, default: '' },
    version: { type: Number, required: true },
    title: { type: String, default: '' },
    data: { type: mongoose.Schema.Types.Mixed, required: true },
    status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    changeLog: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
});

contentVersionSchema.index({ contentType: 1, contentId: 1, version: -1 });
contentVersionSchema.index({ contentType: 1, status: 1 });

module.exports = mongoose.model('ContentVersion', contentVersionSchema);