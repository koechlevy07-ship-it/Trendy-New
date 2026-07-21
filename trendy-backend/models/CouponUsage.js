const mongoose = require('mongoose');

const couponUsageSchema = new mongoose.Schema({
    coupon: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon', required: true },
    code: { type: String, required: true, uppercase: true, trim: true },

    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    customerEmail: { type: String, trim: true, lowercase: true },
    customerName: { type: String, trim: true },

    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    orderNumber: { type: String },
    orderSubtotal: { type: Number, default: 0 },
    orderTotal: { type: Number, default: 0 },

    discountAmount: { type: Number, required: true, min: 0 },
    discountType: { type: String, enum: ['percentage', 'fixed', 'free_shipping', 'bogo', 'bundle'] },

    usageType: {
        type: String,
        enum: ['checkout', 'auto', 'api', 'loyalty', 'referral', 'birthday'],
        default: 'checkout'
    },

    items: [{
        product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        name: { type: String },
        quantity: { type: Number },
        price: { type: Number }
    }],

    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },

    usedAt: { type: Date, default: Date.now },
    sessionId: { type: String },
    ipAddress: { type: String },
    userAgent: { type: String }
}, { timestamps: true });

couponUsageSchema.index({ coupon: 1, usedAt: -1 });
couponUsageSchema.index({ customer: 1, usedAt: -1 });
couponUsageSchema.index({ code: 1 });
couponUsageSchema.index({ usedAt: -1 });

module.exports = mongoose.model('CouponUsage', couponUsageSchema);
