const mongoose = require('mongoose');

const abandonedCartItemSchema = new mongoose.Schema({
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: String,
    price: Number,
    originalPrice: Number,
    quantity: { type: Number, default: 1, min: 1 },
    size: { type: String, default: '' },
    color: { type: String, default: '' },
    image: { type: String, default: '' },
    sku: String,
    category: String,
    brand: String
}, { _id: false });

const abandonedCartSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    sessionId: String,
    email: { type: String, lowercase: true, trim: true },
    items: [abandonedCartItemSchema],
    
    // Cart values
    subtotal: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    shipping: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    
    // Coupon info
    couponCode: String,
    couponDiscount: { type: Number, default: 0 },
    
    // Shipping info (if entered)
    shippingAddress: {
        fullName: String,
        phone: String,
        email: String,
        county: String,
        city: String,
        street: String,
        apartment: String,
        postalCode: String,
        country: { type: String, default: 'Kenya' },
        deliveryInstructions: String
    },
    
    // Payment method selected
    paymentMethod: { type: String, enum: ['cash', 'mpesa', 'card', 'bank', 'paypal'] },
    
    // Status tracking
    status: {
        type: String,
        enum: ['active', 'recovering', 'recovered', 'expired', 'completed', 'cancelled'],
        default: 'active'
    },
    
    // Abandonment tracking
    abandonedAt: { type: Date, default: Date.now },
    lastActivityAt: { type: Date, default: Date.now },
    recoveryStartedAt: Date,
    recoveredAt: Date,
    expiredAt: Date,
    completedAt: Date,
    cancelledAt: Date,
    
    // Recovery tracking
    recovery: {
        emailsSent: { type: Number, default: 0 },
        maxEmails: { type: Number, default: 3 },
        lastEmailSentAt: Date,
        lastEmailType: { type: String, enum: ['reminder', 'incentive', 'urgency', 'final'] },
        emails: [{
            type: { type: String, enum: ['reminder', 'incentive', 'urgency', 'final'] },
            sentAt: Date,
            opened: Boolean,
            openedAt: Date,
            clicked: Boolean,
            clickedAt: Date,
            converted: Boolean,
            couponCode: String,
            subjectLine: String
        }],
        incentiveOffered: Boolean,
        incentiveType: { type: String, enum: ['discount', 'free_shipping', 'gift', 'loyalty_points'] },
        incentiveValue: Number,
        incentiveCouponCode: String,
        convertedFromEmail: { type: Boolean, default: false },
        convertedFromEmailId: String
    },
    
    // Conversion tracking
    isConverted: { type: Boolean, default: false },
    convertedOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    convertedAt: Date,
    convertedValue: Number,
    convertedItems: Number,
    conversionSource: { type: String, enum: ['email', 'direct', 'retargeting', 'push', 'sms', 'organic', 'unknown'] },
    
    // Session data
    sessionData: {
        userAgent: String,
        ipAddress: String,
        referrer: String,
        utm: {
            source: String,
            medium: String,
            campaign: String,
            term: String,
            content: String
        },
        device: { type: String, enum: ['desktop', 'mobile', 'tablet'] },
        browser: String,
        os: String,
        country: String,
        city: String,
        referrerUrl: String,
        landingPage: String,
        timeOnSite: Number,
        pagesViewed: Number,
        scrollDepth: Number
    },
    
    // Customer info
    customer: {
        id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        name: String,
        email: String,
        isNewCustomer: Boolean,
        lifetimeValue: Number,
        orderCount: Number
    },
    
    // Coupon applied
    coupon: {
        code: String,
        discount: Number,
        discountType: { type: String, enum: ['percentage', 'fixed'] }
    },
    
    // Notifications
    notifications: [{
        type: { type: String, enum: ['email', 'push', 'sms', 'webhook'] },
        sentAt: Date,
        status: { type: String, enum: ['pending', 'sent', 'delivered', 'failed', 'opened', 'clicked'] },
        provider: String,
        providerId: String,
        error: String
    }],
    
    // Retargeting
    retargeting: {
        pixelFired: Boolean,
        pixelFiredAt: Date,
        audiences: [String],
        adPlatforms: [String]
    },
    
    // Metadata
    tags: [String],
    notes: String,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

abandonedCartSchema.index({ userId: 1, status: 1 });
abandonedCartSchema.index({ sessionId: 1 });
abandonedCartSchema.index({ email: 1, status: 1 });
abandonedCartSchema.index({ status: 1, abandonedAt: -1 });
abandonedCartSchema.index({ 'recovery.emailsSent': 1, status: 1 });
abandonedCartSchema.index({ abandonedAt: -1 });
abandonedCartSchema.index({ 'customer.id': 1, status: 1 });
abandonedCartSchema.index({ 'sessionData.utm.campaign': 1 });
abandonedCartSchema.index({ status: 1, 'recovery.emailsSent': 1 });
abandonedCartSchema.index({ abandonedAt: -1, status: 1 });

// Virtual for cart age in hours
abandonedCartSchema.virtual('ageInHours').get(function() {
    return Math.floor((Date.now() - this.abandonedAt.getTime()) / (1000 * 60 * 60));
});

// Virtual for recovery rate
abandonedCartSchema.virtual('recoveryRate').get(function() {
    if (this.status === 'recovered') return 100;
    if (this.status === 'expired') return 0;
    return this.recovery?.emailsSent > 0 ? 50 : 0; // Simplified
});

// Method to check if cart is recoverable
abandonedCartSchema.methods.isRecoverable = function() {
    return ['active', 'recovering'].includes(this.status) && 
           this.recovery.emailsSent < this.recovery.maxEmails &&
           (!this.expiredAt || this.expiredAt > new Date());
};

// Method to start recovery process
abandonedCartSchema.methods.startRecovery = function() {
    this.status = 'recovering';
    this.recoveryStartedAt = new Date();
    this.recovery.emailsSent = 0;
    return this.save();
};

// Method to record email sent
abandonedCartSchema.methods.recordEmailSent = function(emailData) {
    this.recovery.emailsSent = (this.recovery.emailsSent || 0) + 1;
    this.recovery.lastEmailSentAt = new Date();
    this.recovery.lastEmailType = emailData.type;
    this.recovery.emails = this.recovery.emails || [];
    this.recovery.emails.push({
        type: emailData.type,
        sentAt: new Date(),
        subjectLine: emailData.subjectLine,
        couponCode: emailData.couponCode,
        opened: false,
        clicked: false,
        converted: false
    });
    
    if (this.recovery.emailsSent >= this.recovery.maxEmails) {
        this.status = 'expired';
        this.expiredAt = new Date();
    }
    
    return this.save();
};

// Method to record email opened
abandonedCartSchema.methods.recordEmailOpened = function(emailIndex) {
    if (this.recovery.emails[emailIndex]) {
        this.recovery.emails[emailIndex].opened = true;
        this.recovery.emails[emailIndex].openedAt = new Date();
        return this.save();
    }
};

// Method to record email clicked
abandonedCartSchema.methods.recordEmailClicked = function(emailIndex) {
    if (this.recovery.emails[emailIndex]) {
        this.recovery.emails[emailIndex].clicked = true;
        this.recovery.emails[emailIndex].clickedAt = new Date();
        return this.save();
    }
};

// Method to mark as recovered
abandonedCartSchema.methods.markRecovered = function(orderId, conversionSource = 'email') {
    this.status = 'recovered';
    this.isConverted = true;
    this.convertedOrderId = orderId;
    this.convertedAt = new Date();
    this.convertedValue = this.total;
    this.convertedItems = this.items.reduce((sum, item) => sum + item.quantity, 0);
    this.conversionSource = conversionSource;
    this.recoveredAt = new Date();
    this.recovery.converted = true;
    this.recovery.convertedFromEmail = true;
    return this.save();
};

// Method to mark as completed (order placed)
abandonedCartSchema.methods.markCompleted = function(orderId) {
    this.status = 'completed';
    this.convertedOrderId = orderId;
    this.completedAt = new Date();
    return this.save();
};

// Method to expire
abandonedCartSchema.methods.expire = function() {
    this.status = 'expired';
    this.expiredAt = new Date();
    return this.save();
};

// Method to cancel
abandonedCartSchema.methods.cancel = function() {
    this.status = 'cancelled';
    this.cancelledAt = new Date();
    return this.save();
};

// Static method to find abandoned carts for recovery
abandonedCartSchema.statics.findRecoverable = function(limit = 100) {
    return this.find({
        status: { $in: ['active', 'recovering'] },
        $or: [
            { 'recovery.emailsSent': { $lt: 3 } },
            { 'recovery.emailsSent': { $exists: false } }
        ],
        $or: [
            { expiredAt: { $exists: false } },
            { expiredAt: { $gt: new Date() } }
        ]
    }).sort({ abandonedAt: 1 }).limit(limit);
};

// Static method to get abandoned cart stats
abandonedCartSchema.statics.getStats = async function(days = 30) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    const [
        totalStats,
        byStatus,
        byDay,
        recoveryStats,
        topProducts
    ] = await Promise.all([
        this.aggregate([
            { $match: { abandonedAt: { $gte: startDate } } },
            { $group: { _id: null, total: { $sum: 1 }, value: { $sum: '$total' }, items: { $sum: { $sum: '$items.quantity' } } } }
        ]),
        this.aggregate([
            { $match: { abandonedAt: { $gte: startDate } } },
            { $group: { _id: '$status', count: { $sum: 1 }, value: { $sum: '$total' } } }
        ]),
        this.aggregate([
            { $match: { abandonedAt: { $gte: startDate } } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$abandonedAt' } },
                    abandoned: { $sum: 1 },
                    value: { $sum: '$total' },
                    recovered: { $sum: { $cond: [{ $eq: ['$isConverted', true] }, 1, 0] } },
                    recoveredValue: { $sum: { $cond: ['$isConverted', '$total', 0] } }
                }
            },
            { $sort: { _id: 1 } }
        ]),
        this.aggregate([
            { $match: { abandonedAt: { $gte: startDate }, isConverted: true } },
            { $group: { _id: null, recovered: { $sum: 1 }, value: { $sum: '$total' }, avgTime: { $avg: { $subtract: ['$convertedAt', '$abandonedAt'] } } } }
        ]),
        this.aggregate([
            { $match: { abandonedAt: { $gte: startDate } } },
            { $unwind: '$items' },
            { $group: { _id: '$items.productId', name: { $first: '$items.name' }, count: { $sum: '$items.quantity' }, revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } } } },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ])
    ]);
    
    return {
        total: totalStats[0] || { total: 0, value: 0, items: 0 },
        byStatus: byStatus,
        byDay: byDay,
        recovery: recoveryStats[0] || { recovered: 0, value: 0, avgTime: 0 },
        topProducts: topProducts,
        recoveryRate: totalStats[0]?.total > 0 ? ((totalStats[0]?.total / totalStats[0]?.total) * 100).toFixed(2) : 0
    };
};

// Static method to find abandoned carts needing recovery email
abandonedCartSchema.statics.findNeedingRecoveryEmail = function() {
    const now = new Date();
    const oneHourAgo = new Date(now - 60 * 60 * 1000);
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
    const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60 * 1000);
    
    return this.find({
        status: { $in: ['active', 'recovering'] },
        $or: [
            // First email - 1 hour after abandonment
            {
                'recovery.emailsSent': 0,
                abandonedAt: { $lte: oneHourAgo }
            },
            // Second email - 24 hours after abandonment
            {
                'recovery.emailsSent': 1,
                'recovery.lastEmailSentAt': { $lte: oneDayAgo }
            },
            // Third email - 3 days after abandonment
            {
                'recovery.emailsSent': 2,
                'recovery.lastEmailSentAt': { $lte: threeDaysAgo }
            }
        ]
    });
};

// Static method to clean up expired carts
abandonedCartSchema.statics.cleanupExpired = async function(days = 30) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return this.updateMany(
        { status: { $in: ['active', 'recovering'] }, abandonedAt: { $lt: cutoff } },
        { status: 'expired', expiredAt: new Date() }
    );
};

module.exports = mongoose.model('AbandonedCart', abandonedCartSchema);