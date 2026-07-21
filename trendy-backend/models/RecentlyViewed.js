const mongoose = require('mongoose');

const recentlyViewedSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    products: {
        type: [{
            product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
            viewedAt: { type: Date, default: Date.now }
        }],
        default: []
    }
}, { timestamps: true });

recentlyViewedSchema.index({ user: 1 });

module.exports = mongoose.model('RecentlyViewed', recentlyViewedSchema);
