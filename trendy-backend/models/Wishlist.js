const mongoose = require('mongoose');

const wishlistItemSchema = new mongoose.Schema({
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    size: { type: String, default: '' },
    color: { type: String, default: '' },
    note: { type: String, default: '', maxlength: 500 },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high'],
        default: 'medium'
    },
    addedAt: {
        type: Date,
        default: Date.now
    }
}, { _id: true });

const wishlistSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    items: [wishlistItemSchema],
    isPublic: { type: Boolean, default: false },
    shareId: { type: String, unique: true, sparse: true }
}, { timestamps: true });

wishlistSchema.virtual('totalItems').get(function() {
    return this.items.length;
});

wishlistSchema.virtual('estimatedValue').get(function() {
    return 0;
});

wishlistSchema.set('toJSON', { virtuals: true });
wishlistSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Wishlist', wishlistSchema);