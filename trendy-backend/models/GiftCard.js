const mongoose = require('mongoose');
const crypto = require('crypto');

const giftCardSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 30 },
    name: { type: String, trim: true, maxlength: 100 },

    originalValue: { type: Number, required: true, min: 1 },
    currentBalance: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'KES' },

    type: {
        type: String,
        enum: ['fixed', 'variable', 'percentage', 'digital', 'physical'],
        default: 'fixed'
    },

    status: {
        type: String,
        enum: ['active', 'partially_redeemed', 'exhausted', 'expired', 'cancelled', 'pending'],
        default: 'active'
    },

    recipient: { type: String, trim: true },
    recipientEmail: { type: String, trim: true, lowercase: true },
    senderName: { type: String, trim: true },
    senderEmail: { type: String, trim: true, lowercase: true },
    personalMessage: { type: String, trim: true, maxlength: 500 },

    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    minPurchaseAmount: { type: Number, default: 0 },
    maxDiscountValue: { type: Number, default: 0 },
    applicableProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    applicableCategories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],

    usageLimit: { type: Number, default: 1 },
    usageCount: { type: Number, default: 0 },

    startDate: { type: Date, default: Date.now },
    endDate: { type: Date, default: null },

    redemptions: [{
        order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
        amount: { type: Number, required: true },
        redeemedAt: { type: Date, default: Date.now }
    }],

    emailSent: { type: Boolean, default: false },
    emailSentAt: { type: Date },

    channel: {
        type: String,
        enum: ['admin', 'website', 'loyalty_reward', 'campaign', 'birthday', 'referral', 'api'],
        default: 'admin'
    },

    tags: [{ type: String, trim: true }],
    notes: { type: String, trim: true },
    pin: { type: String },

    expiryWarningDays: { type: Number, default: 7 },
    autoExtend: { type: Boolean, default: false },
    transferable: { type: Boolean, default: true },

    tracking: {
        totalRedeemed: { type: Number, default: 0 },
        totalRefunded: { type: Number, default: 0 },
        lastRedeemedAt: { type: Date }
    },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

giftCardSchema.index({ code: 1 });
giftCardSchema.index({ status: 1 });
giftCardSchema.index({ customer: 1 });
giftCardSchema.index({ recipientEmail: 1 });

giftCardSchema.pre('save', function(next) {
    if (this.currentBalance <= 0 && this.status !== 'cancelled') {
        this.status = 'exhausted';
    } else if (this.currentBalance > 0 && this.currentBalance < this.originalValue && this.status === 'active') {
        this.status = 'partially_redeemed';
    }
    if (this.endDate && this.endDate < new Date() && this.currentBalance > 0 && this.status === 'active') {
        this.status = 'expired';
    }
    if (this.code) this.code = this.code.toUpperCase().trim();
    next();
});

giftCardSchema.methods.redeem = function(amount, orderId) {
    if (this.status === 'expired' || this.status === 'cancelled' || this.status === 'exhausted') {
        return { success: false, message: 'Gift card cannot be used' };
    }
    if (amount > this.currentBalance) {
        return { success: false, message: 'Insufficient gift card balance' };
    }
    if (this.endDate && this.endDate < new Date()) {
        this.status = 'expired';
        return { success: false, message: 'Gift card has expired' };
    }
    const actualAmount = Math.min(amount, this.currentBalance);
    this.currentBalance -= actualAmount;
    this.usageCount += 1;
    this.redemptions.push({ order: orderId, amount: actualAmount });
    this.tracking.totalRedeemed += actualAmount;
    this.tracking.lastRedeemedAt = new Date();
    return { success: true, amount: actualAmount, remaining: this.currentBalance };
};

giftCardSchema.statics.generateCode = function(prefix) {
    const p = prefix || 'GIFT';
    const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
    return `${p}${rand}`;
};

module.exports = mongoose.model('GiftCard', giftCardSchema);
