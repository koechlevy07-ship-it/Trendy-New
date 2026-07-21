const mongoose = require('mongoose');

const testimonialSchema = new mongoose.Schema({
    customerName: { type: String, required: true, trim: true },
    customerPhoto: { type: String, default: '' },
    rating: { type: Number, min: 1, max: 5, default: 5 },
    review: { type: String, required: true, trim: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
    productName: { type: String, default: '' },
    verifiedPurchase: { type: Boolean, default: false },
    displayOrder: { type: Number, default: 0 },
    status: { type: String, enum: ['published', 'draft', 'archived'], default: 'published' },
    featured: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

testimonialSchema.index({ status: 1, displayOrder: 1 });
testimonialSchema.index({ featured: 1 });

module.exports = mongoose.model('Testimonial', testimonialSchema);