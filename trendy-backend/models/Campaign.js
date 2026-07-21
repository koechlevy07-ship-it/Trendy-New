const mongoose = require('mongoose');

const campaignScheduleSchema = new mongoose.Schema({
    type: { type: String, enum: ['immediate', 'scheduled', 'recurring', 'triggered', 'drip'], required: true },
    startDate: Date,
    endDate: Date,
    timezone: { type: String, default: 'Africa/Nairobi' },
    recurring: {
        frequency: { type: String, enum: ['daily', 'weekly', 'monthly', 'yearly'] },
        interval: { type: Number, default: 1 },
        daysOfWeek: [{ type: Number, min: 0, max: 6 }],
        dayOfMonth: { type: Number, min: 1, max: 31 },
        month: { type: Number, min: 1, max: 12 }
    },
    sendTime: { type: String, default: '10:00' },
    triggerEvent: { type: String, enum: ['cart_abandoned', 'welcome', 'post_purchase', 'birthday', 'anniversary', 'review_request', 'win_back', 'price_drop', 'back_in_stock', 'loyalty_tier_change', 'referral_signup', 'referral_complete'] },
    triggerDelay: { value: { type: Number, default: 1 }, unit: { type: String, enum: ['minutes', 'hours', 'days'], default: 'hours' } },
    dripSequence: [{
        delay: { value: Number, unit: { type: String, enum: ['minutes', 'hours', 'days'] } },
        template: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailTemplate' },
        conditions: mongoose.Schema.Types.Mixed
    }]
}, { _id: false });

const campaignTargetingSchema = new mongoose.Schema({
    includeAll: { type: Boolean, default: false },
    segments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CustomerSegment' }],
    tags: [{ type: String }],
    customFilters: mongoose.Schema.Types.Mixed,
    excludeSegments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CustomerSegment' }],
    excludeTags: [{ type: String }],
    excludeSubscribers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Subscriber' }],
    minEngagementScore: Number,
    maxEngagementScore: Number,
    engagementLevels: [{ type: String, enum: ['highly_engaged', 'engaged', 'low_engagement', 'disengaged'] }],
    loyaltyTiers: [{ type: String, enum: ['bronze', 'silver', 'gold', 'platinum', 'diamond'] }],
    locations: {
        countries: [String],
        regions: [String],
        cities: [String]
    },
    purchaseHistory: {
        minOrders: Number,
        maxOrders: Number,
        minTotalSpent: Number,
        maxTotalSpent: Number,
        categories: [String],
        brands: [String],
        lastOrderWithinDays: Number,
        hasAbandonedCart: Boolean,
        hasWishlist: Boolean
    },
    demographics: {
        ageMin: Number,
        ageMax: Number,
        genders: [String]
    },
    engagement: {
        minEngagementScore: Number,
        maxEngagementScore: Number,
        lastOpenedWithinDays: Number,
        lastClickedWithinDays: Number,
        hasOpenedLastCampaign: Boolean,
        hasClickedLastCampaign: Boolean
    },
    subscription: {
        sources: [String],
        statuses: [String],
        dateRange: { start: Date, end: Date },
        confirmed: Boolean
    },
    customFields: mongoose.Schema.Types.Mixed
}, { _id: false });

const campaignSettingsSchema = new mongoose.Schema({
    senderName: { type: String, default: 'Trendy Wardrobe' },
    senderEmail: { type: String, default: 'noreply@trendywardrobe.com' },
    replyToEmail: String,
    subjectLine: String,
    preheader: String,
    trackOpens: { type: Boolean, default: true },
    trackClicks: { type: Boolean, default: true },
    trackPlainTextClicks: { type: Boolean, default: false },
    autoText: { type: Boolean, default: true },
    inlineCSS: { type: Boolean, default: true },
    utmCampaign: String,
    utmMedium: { type: String, default: 'email' },
    utmSource: String,
    utmContent: String,
    tags: [String],
    sendAsPlainText: { type: Boolean, default: false },
    sendAsHtml: { type: Boolean, default: true },
    personalize: { type: Boolean, default: true },
    personalizationFields: [String],
    abTest: {
        enabled: { type: Boolean, default: false },
        variants: [{
            name: String,
            subjectLine: String,
            preheader: String,
            fromName: String,
            fromEmail: String,
            weight: { type: Number, default: 50 }
        }],
        winnerCriteria: { type: String, enum: ['open_rate', 'click_rate', 'conversion_rate'], default: 'open_rate' },
        testDuration: { type: Number, default: 4 },
        testDurationUnit: { type: String, enum: ['hours', 'days'], default: 'hours' }
    },
    throttle: {
        enabled: { type: Boolean, default: false },
        maxPerHour: Number,
        maxPerDay: Number
    },
    suppressList: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Subscriber' }],
    suppressUnengaged: { type: Boolean, default: false },
    unengagedThresholdDays: { type: Number, default: 90 },
    skipUnsubscribed: { type: Boolean, default: true },
    skipSuppressed: { type: Boolean, default: true },
    skipBounced: { type: Boolean, default: true }
}, { _id: false });

const campaignAnalyticsSchema = new mongoose.Schema({
    sent: { type: Number, default: 0 },
    delivered: { type: Number, default: 0 },
    opened: { type: Number, default: 0 },
    uniqueOpened: { type: Number, default: 0 },
    clicked: { type: Number, default: 0 },
    uniqueClicked: { type: Number, default: 0 },
    bounced: { type: Number, default: 0 },
    hardBounced: { type: Number, default: 0 },
    softBounced: { type: Number, default: 0 },
    unsubscribed: { type: Number, default: 0 },
    complained: { type: Number, default: 0 },
    conversions: { type: Number, default: 0 },
    revenue: { type: Number, default: 0 },
    openRate: { type: Number, default: 0 },
    clickRate: { type: Number, default: 0 },
    clickToOpenRate: { type: Number, default: 0 },
    bounceRate: { type: Number, default: 0 },
    unsubscribeRate: { type: Number, default: 0 },
    complaintRate: { type: Number, default: 0 },
    conversionRate: { type: Number, default: 0 },
    revenuePerEmail: { type: Number, default: 0 },
    revenuePerSubscriber: { type: Number, default: 0 },
    avgOrderValue: { type: Number, default: 0 },
    roi: { type: Number, default: 0 },
    byDomain: mongoose.Schema.Types.Mixed,
    byDevice: mongoose.Schema.Types.Mixed,
    byClient: mongoose.Schema.Types.Mixed,
    byLocation: mongoose.Schema.Types.Mixed,
    byHour: mongoose.Schema.Types.Mixed,
    byDay: mongoose.Schema.Types.Mixed,
    linkClicks: mongoose.Schema.Types.Mixed,
    engagementOverTime: mongoose.Schema.Types.Mixed,
    revenueOverTime: mongoose.Schema.Types.Mixed,
    lastCalculatedAt: Date
}, { _id: false });

const campaignSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, maxlength: 100 },
    slug: { type: String, unique: true, lowercase: true, trim: true },
    description: { type: String, trim: true, maxlength: 500 },
    
    type: {
        type: String,
        enum: [
            'promotional', 'flash_sale', 'seasonal', 'holiday', 'product_launch',
            'new_arrival', 'clearance', 'loyalty', 'referral', 'birthday',
            'anniversary', 'win_back', 'abandoned_cart', 'welcome', 'post_purchase',
            'review_request', 'price_drop', 'back_in_stock', 'vip_exclusive',
            'newsletter', 'educational', 'survey', 'custom'
        ],
        required: true
    },
    
    status: {
        type: String,
        enum: ['draft', 'scheduled', 'sending', 'sent', 'paused', 'completed', 'cancelled', 'archived'],
        default: 'draft'
    },
    
    // Template and content
    template: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailTemplate' },
    templateVersion: Number,
    blocks: [mongoose.Schema.Types.Mixed],
    settings: { type: campaignSettingsSchema, default: () => ({}) },
    subjectLine: { type: String, default: '' },
    preheader: { type: String, default: '' },
    previewText: String,
    
    // AB Test variants (for A/B testing)
    variants: [{
        name: String,
        subjectLine: String,
        preheader: String,
        fromName: String,
        fromEmail: String,
        blocks: [mongoose.Schema.Types.Mixed],
        weight: { type: Number, default: 50 },
        isControl: { type: Boolean, default: false }
    }],
    
    // Targeting
    targeting: { type: campaignTargetingSchema, default: () => ({}) },
    estimatedAudience: { type: Number, default: 0 },
    
    // Schedule
    schedule: { type: campaignScheduleSchema, default: () => ({}) },
    sendAt: Date,
    sentAt: Date,
    completedAt: Date,
    
    // Budget and ROI
    budget: { type: Number, default: 0 },
    spent: { type: Number, default: 0 },
    costPerEmail: { type: Number, default: 0 },
    
    // Analytics
    analytics: { type: campaignAnalyticsSchema, default: () => ({}) },
    abTestResults: mongoose.Schema.Types.Mixed,
    winningVariant: String,
    
    // Error tracking
    errors: [{
        type: String,
        message: String,
        count: Number,
        lastOccurredAt: Date
    }],
    
    // Metadata
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes: String,
    tags: [{ type: String, trim: true }],
    
    // Flags
    isTest: { type: Boolean, default: false },
    isAutomated: { type: Boolean, default: false },
    isRecurring: { type: Boolean, default: false },
    requiresApproval: { type: Boolean, default: false },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: Date,
    priority: { type: Number, default: 0 }
}, { timestamps: true });

campaignSchema.index({ status: 1, sendAt: 1 });
campaignSchema.index({ createdBy: 1, createdAt: -1 });
campaignSchema.index({ type: 1, status: 1 });
campaignSchema.index({ slug: 1 }, { unique: true });
campaignSchema.index({ sendAt: 1, status: 1 });
campaignSchema.index({ tags: 1, status: 1 });
campaignSchema.index({ 'schedule.type': 1, 'schedule.startDate': 1 });

campaignSchema.pre('save', function(next) {
    if (this.isModified('name') && !this.slug) {
        this.slug = this.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    }
    if (this.isModified('status') && this.status === 'sending' && !this.sentAt) {
        this.sentAt = new Date();
    }
    if (this.isModified('status') && this.status === 'sent' && !this.completedAt) {
        this.completedAt = new Date();
    }
    next();
});

// Virtual for estimated cost
campaignSchema.virtual('estimatedCost').get(function() {
    return this.estimatedAudience * this.costPerEmail;
});

// Virtual for delivery rate
campaignSchema.virtual('deliveryRate').get(function() {
    if (!this.analytics.sent) return 0;
    return ((this.analytics.delivered || 0) / this.analytics.sent) * 100;
});

// Method to estimate audience
campaignSchema.methods.estimateAudience = async function() {
    const CustomerSegment = mongoose.model('CustomerSegment');
    const Subscriber = mongoose.model('Subscriber');
    
    let query = { status: 'subscribed', confirmed: true };
    
    if (this.targeting.includeAll) {
        // No additional filters
    } else {
        // Apply segment filters
        if (this.targeting.segments?.length) {
            const segments = await CustomerSegment.find({ _id: { $in: this.targeting.segments } });
            // Build query from segments
        }
    }
    
    const count = await Subscriber.countDocuments(query);
    this.estimatedAudience = count;
    return count;
};

// Method to calculate estimated cost
campaignSchema.methods.calculateCost = function() {
    this.costPerEmail = 0.0001; // Default cost per email
    this.budget = this.estimatedAudience * this.costPerEmail;
    return this.budget;
};

module.exports = mongoose.model('Campaign', campaignSchema);