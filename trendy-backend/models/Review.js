const mongoose = require('mongoose');

const replySchema = new mongoose.Schema({
    text: { type: String, required: true, trim: true, maxlength: 2000 },
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    adminName: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
}, { _id: true });

const reportSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, enum: ['spam', 'inappropriate', 'fake', 'irrelevant', 'other'], required: true },
    details: { type: String, trim: true, maxlength: 500 },
    createdAt: { type: Date, default: Date.now }
}, { _id: true });

const reviewSchema = new mongoose.Schema({
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    order: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
        required: false
    },
    rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    title: {
        type: String,
        default: '',
        trim: true,
        maxlength: 100
    },
    comment: {
        type: String,
        required: true,
        trim: true,
        maxlength: 5000
    },
    images: [{
        url: { type: String, required: true },
        publicId: { type: String },
        uploadedAt: { type: Date, default: Date.now }
    }],
    videos: [{
        url: { type: String },
        publicId: { type: String },
        thumbnail: { type: String },
        duration: { type: Number },
        uploadedAt: { type: Date, default: Date.now }
    }],
    verifiedPurchase: { type: Boolean, default: false },
    recommended: { type: Boolean, default: false },
    helpful: { type: Number, default: 0 },
    helpfulBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    reports: [reportSchema],
    reportCount: { type: Number, default: 0 },
    status: {
        type: String,
        enum: ['pending', 'approved', 'hidden', 'rejected', 'reported'],
        default: 'pending'
    },
    featured: { type: Boolean, default: false },
    adminReply: { type: replySchema, default: null },
    reviewAttributes: {
        type: Map,
        of: String,
        default: {}
    }
}, { timestamps: true });

reviewSchema.index({ product: 1, createdAt: -1 });
reviewSchema.index({ user: 1 });
reviewSchema.index({ status: 1 });
reviewSchema.index({ product: 1, status: 1 });
reviewSchema.index({ featured: 1, status: 1 });
reviewSchema.index({ createdAt: -1 });

reviewSchema.pre('save', function (next) {
    this.reportCount = this.reports?.length || 0;
    if (this.reportCount > 0 && this.status !== 'reported' && this.status !== 'rejected') {
        this.status = 'reported';
    }
    next();
});

module.exports = mongoose.model('Review', reviewSchema);