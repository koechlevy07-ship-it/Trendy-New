const mongoose = require('mongoose');

const flashSaleProductSchema = new mongoose.Schema({
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    originalPrice: { type: Number, required: true },
    salePrice: { type: Number, required: true },
    discountPercent: { type: Number, required: true, min: 0, max: 99 },
    quantity: { type: Number, default: -1, min: -1 },
    sold: { type: Number, default: 0 },
    reserved: { type: Number, default: 0 }
}, { _id: false });

const flashSaleSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 500 },
    bannerImage: { type: String, default: '' },

    products: [flashSaleProductSchema],

    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    timezone: { type: String, default: 'Africa/Nairobi' },

    status: {
        type: String,
        enum: ['draft', 'active', 'scheduled', 'paused', 'ended'],
        default: 'draft'
    },

    displaySettings: {
        showCountdown: { type: Boolean, default: true },
        showBadge: { type: Boolean, default: true },
        badgeText: { type: String, default: 'FLASH SALE' },
        badgeColor: { type: String, default: '#DC2626' },
        bgColor: { type: String, default: '#111827' },
        textColor: { type: String, default: '#FFFFFF' }
    },

    targeting: {
        showOnHomepage: { type: Boolean, default: true },
        showOnCategory: { type: Boolean, default: true },
        showOnProduct: { type: Boolean, default: true },
        showOnSearch: { type: Boolean, default: true },
        showOnCart: { type: Boolean, default: false },
        minPurchaseAmount: { type: Number, default: 0 },
        applicableCustomerSegments: [{ type: String, enum: ['all', 'new', 'returning', 'vip'] }]
    },

    totalSold: { type: Number, default: 0 },
    totalRevenue: { type: Number, default: 0 },
    totalDiscountGiven: { type: Number, default: 0 },
    views: { type: Number, default: 0 },
    conversionRate: { type: Number, default: 0 },

    priority: { type: Number, default: 0 },
    isRecurring: { type: Boolean, default: false },
    recurringPattern: {
        type: { type: String, enum: ['daily', 'weekly', 'monthly'] },
        daysOfWeek: [{ type: Number, min: 0, max: 6 }]
    },

    tags: [{ type: String, trim: true }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

flashSaleSchema.index({ status: 1, startDate: 1, endDate: 1 });
flashSaleSchema.index({ 'products.product': 1 });

flashSaleSchema.pre('save', function(next) {
    const now = new Date();
    if (this.status !== 'draft' && this.status !== 'paused') {
        if (this.endDate && this.endDate < now) {
            this.status = 'ended';
        } else if (this.startDate > now) {
            this.status = 'scheduled';
        } else if (this.startDate <= now && this.endDate >= now) {
            this.status = 'active';
        }
    }
    next();
});

flashSaleSchema.methods.isActive = function() {
    const now = new Date();
    return this.status === 'active' && this.startDate <= now && this.endDate >= now;
};

module.exports = mongoose.model('FlashSale', flashSaleSchema);
