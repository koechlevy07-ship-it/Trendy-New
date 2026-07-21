const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema({
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: String,
    price: Number,
    originalPrice: Number,
    quantity: { type: Number, default: 1, min: 1 },
    size: { type: String, default: '' },
    color: { type: String, default: '' },
    image: { type: String, default: '' },
    savedForLater: { type: Boolean, default: false }
});

const cartSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    items: [cartItemSchema],
    couponCode: { type: String, default: '' },
    couponDiscount: { type: Number, default: 0 }
}, { timestamps: true });

cartSchema.virtual('subtotal').get(function() {
    return this.items.filter(i => !i.savedForLater).reduce((sum, item) => sum + (item.price || 0) * item.quantity, 0);
});

cartSchema.virtual('savings').get(function() {
    return this.items.filter(i => !i.savedForLater).reduce((sum, item) => {
        return sum + ((item.originalPrice && item.originalPrice > item.price ? item.originalPrice - item.price : 0) * item.quantity);
    }, 0);
});

cartSchema.virtual('totalItems').get(function() {
    return this.items.filter(i => !i.savedForLater).reduce((sum, item) => sum + item.quantity, 0);
});

cartSchema.set('toJSON', { virtuals: true });
cartSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Cart', cartSchema);
