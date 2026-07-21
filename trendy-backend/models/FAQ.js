const mongoose = require('mongoose');

const faqSchema = new mongoose.Schema({
    question: { type: String, required: true, trim: true },
    answer: { type: String, required: true },
    category: {
        type: String,
        enum: ['general', 'orders', 'shipping', 'returns', 'payments', 'account', 'products', 'technical'],
        default: 'general'
    },
    tags: [{ type: String, trim: true }],
    isPublished: { type: Boolean, default: true },
    displayOrder: { type: Number, default: 0 },
    viewCount: { type: Number, default: 0 },
    helpfulCount: { type: Number, default: 0 },
    notHelpfulCount: { type: Number, default: 0 },
    relatedFAQs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'FAQ' }],
    seoTitle: { type: String, trim: true },
    seoDescription: { type: String, trim: true }
}, { timestamps: true });

faqSchema.index({ category: 1, displayOrder: 1 });
faqSchema.index({ question: 'text', answer: 'text', tags: 'text' });
faqSchema.index({ isPublished: 1, category: 1 });

module.exports = mongoose.model('FAQ', faqSchema);