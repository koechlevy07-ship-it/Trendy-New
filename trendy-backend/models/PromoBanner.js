const mongoose = require('mongoose');

const promoBannerSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 300 },

    type: {
        type: String,
        enum: ['image', 'text', 'html', 'slider', 'popup', 'sticky_bar', 'countdown'],
        default: 'image'
    },

    image: { type: String, default: '' },
    mobileImage: { type: String, default: '' },
    altText: { type: String, default: '' },

    headline: { type: String, trim: true, maxlength: 100 },
    subheadline: { type: String, trim: true, maxlength: 200 },
    ctaText: { type: String, trim: true, maxlength: 50 },
    ctaUrl: { type: String, trim: true },
    ctaColor: { type: String, default: '#C8A96A' },
    ctaTextColor: { type: String, default: '#FFFFFF' },

    backgroundColor: { type: String, default: '#111827' },
    textColor: { type: String, default: '#FFFFFF' },
    borderColor: { type: String, default: '' },

    location: {
        type: String,
        enum: ['homepage_hero', 'homepage_below_hero', 'category_top', 'category_sidebar',
               'product_top', 'product_sidebar', 'cart_top', 'cart_bottom', 'footer_top',
               'between_products', 'search_results', 'checkout_top', 'popup', 'sticky_bar',
               'announcement_bar', 'custom'],
        default: 'homepage_hero'
    },

    displayOrder: { type: Number, default: 0 },

    targeting: {
        showOnPages: [{ type: String }],
        hideOnPages: [{ type: String }],
        showOnMobile: { type: Boolean, default: true },
        showOnDesktop: { type: Boolean, default: true },
        minScreenWidth: { type: Number, default: 0 },
        maxScreenWidth: { type: Number, default: 0 },
        excludeUrls: [{ type: String }],
        includeUrls: [{ type: String }]
    },

    scheduling: {
        enabled: { type: Boolean, default: false },
        startDate: { type: Date },
        endDate: { type: Date },
        timezone: { type: String, default: 'Africa/Nairobi' }
    },

    conditions: {
        minCartValue: { type: Number, default: 0 },
        cartItems: { type: Number, default: 0 },
        customerSegments: [{ type: String, enum: ['all', 'new', 'returning', 'vip', 'guest'] }],
        hasCoupon: { type: String, default: '' },
        categories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
        products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }]
    },

    status: {
        type: String,
        enum: ['draft', 'active', 'scheduled', 'paused', 'expired'],
        default: 'draft'
    },

    tracking: {
        views: { type: Number, default: 0 },
        clicks: { type: Number, default: 0 },
        conversions: { type: Number, default: 0 },
        revenue: { type: Number, default: 0 },
        clickRate: { type: Number, default: 0 },
        conversionRate: { type: Number, default: 0 }
    },

    settings: {
        openInNewTab: { type: Boolean, default: true },
        dismissible: { type: Boolean, default: true },
        showCloseButton: { type: Boolean, default: true },
        cookieExpiryDays: { type: Number, default: 7 },
        animation: { type: String, enum: ['none', 'fade', 'slide', 'bounce'], default: 'none' },
        position: { type: String, enum: ['top', 'center', 'bottom'], default: 'top' },
        maxWidth: { type: Number, default: 0 },
        padding: { type: Number, default: 16 },
        borderRadius: { type: Number, default: 0 },
        shadow: { type: Boolean, default: true }
    },

    tags: [{ type: String, trim: true }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

promoBannerSchema.index({ location: 1, status: 1, displayOrder: 1 });
promoBannerSchema.index({ status: 1 });

promoBannerSchema.pre('save', function(next) {
    const now = new Date();
    if (this.status !== 'draft' && this.status !== 'paused') {
        if (this.scheduling.enabled && this.scheduling.endDate && this.scheduling.endDate < now) {
            this.status = 'expired';
        } else if (this.scheduling.enabled && this.scheduling.startDate > now) {
            this.status = 'scheduled';
        } else if (!this.scheduling.enabled || (this.scheduling.startDate <= now && (!this.scheduling.endDate || this.scheduling.endDate >= now))) {
            if (this.status !== 'expired') this.status = 'active';
        }
    }
    next();
});

promoBannerSchema.methods.isCurrentlyVisible = function() {
    const now = new Date();
    if (this.status !== 'active') return false;
    if (this.scheduling.enabled) {
        if (this.scheduling.startDate && this.scheduling.startDate > now) return false;
        if (this.scheduling.endDate && this.scheduling.endDate < now) return false;
    }
    return true;
};

module.exports = mongoose.model('PromoBanner', promoBannerSchema);
