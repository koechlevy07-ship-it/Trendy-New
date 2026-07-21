const mongoose = require('mongoose');

const engagementSchema = new mongoose.Schema({
    // Email engagement
    totalSent: { type: Number, default: 0 },
    totalDelivered: { type: Number, default: 0 },
    totalOpened: { type: Number, default: 0 },
    totalClicked: { type: Number, default: 0 },
    totalBounced: { type: Number, default: 0 },
    totalUnsubscribed: { type: Number, default: 0 },
    totalComplained: { type: Number, default: 0 },
    
    // Rates
    averageOpenRate: { type: Number, default: 0 },
    averageClickRate: { type: Number, default: 0 },
    averageClickToOpenRate: { type: Number, default: 0 },
    averageBounceRate: { type: Number, default: 0 },
    averageUnsubscribeRate: { type: Number, default: 0 },
    averageComplaintRate: { type: Number, default: 0 },
    
    // Timestamps
    firstOpenedAt: Date,
    lastOpenedAt: Date,
    firstClickedAt: Date,
    lastClickedAt: Date,
    lastEngagementAt: Date,
    
    // Engagement scoring
    engagementScore: { type: Number, default: 0, min: 0, max: 100 },
    engagementLevel: {
        type: String,
        enum: ['highly_engaged', 'engaged', 'somewhat_engaged', 'unengaged', 'dormant', 'unknown'],
        default: 'unknown'
    },
    lastEngagementScoreUpdate: Date,
    
    // Device and client tracking
    devices: {
        desktop: { type: Number, default: 0 },
        mobile: { type: Number, default: 0 },
        tablet: { type: Number, default: 0 }
    },
    clients: mongoose.Schema.Types.Mixed,
    locations: mongoose.Schema.Types.Mixed,
    
    // Campaign interaction
    campaignsInteracted: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' }],
    lastCampaignInteracted: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' },
    campaignsOpened: { type: Number, default: 0 },
    campaignsClicked: { type: Number, default: 0 },
    
    // Link tracking
    clickedLinks: [{
        url: String,
        campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' },
        clickedAt: Date,
        count: { type: Number, default: 1 }
    }],
    
    // Unsubscribe tracking
    unsubscribeHistory: [{
        campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' },
        reason: String,
        method: { type: String, enum: ['link', 'preference_center', 'spam_complaint', 'admin'] },
        unsubscribedAt: { type: Date, default: Date.now }
    }],
    
    // Re-engagement
    reengagementAttempts: { type: Number, default: 0 },
    lastReengagementAt: Date,
    reengagementSuccess: { type: Boolean, default: false }
}, { _id: false });

const subscriberSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    firstName: { type: String, trim: true, maxlength: 50 },
    lastName: { type: String, trim: true, maxlength: 50 },
    
    // Profile
    profile: {
        avatar: String,
        phone: String,
        dateOfBirth: Date,
        gender: { type: String, enum: ['male', 'female', 'other', 'prefer_not_to_say'] },
        company: String,
        jobTitle: String,
        language: { type: String, default: 'en' },
        timezone: { type: String, default: 'Africa/Nairobi' },
        country: String,
        city: String,
        state: String,
        postalCode: String,
        address: String,
        socialProfiles: {
            facebook: String,
            twitter: String,
            instagram: String,
            linkedin: String,
            tiktok: String
        },
        customFields: mongoose.Schema.Types.Mixed
    },
    
    // Status
    status: {
        type: String,
        enum: ['subscribed', 'unsubscribed', 'pending', 'bounced', 'complained', 'suppressed', 'cleaned'],
        default: 'pending'
    },
    confirmed: { type: Boolean, default: false },
    confirmationToken: String,
    confirmationSentAt: Date,
    confirmedAt: Date,
    doubleOptIn: { type: Boolean, default: false },
    
    // Subscription preferences
    preferences: {
        emailFrequency: { type: String, enum: ['daily', 'weekly', 'biweekly', 'monthly', 'never'], default: 'weekly' },
        contentTypes: [{
            type: { type: String, enum: ['promotional', 'transactional', 'newsletter', 'educational', 'survey', 'birthday', 'abandoned_cart', 'back_in_stock', 'price_drop', 'loyalty', 'referral'] },
            enabled: { type: Boolean, default: true }
        }],
        categories: [String],
        brands: [String],
        formats: { type: String, enum: ['html', 'text', 'both'], default: 'both' },
        sendTime: { type: String, default: '09:00' },
        timezone: { type: String, default: 'Africa/Nairobi' },
        daysOfWeek: [{ type: Number, min: 0, max: 6 }],
        quietHours: { start: { type: String, default: '22:00' }, end: { type: String, default: '08:00' } }
    },
    
    // Marketing preferences
    marketing: {
        acceptPromotional: { type: Boolean, default: true },
        acceptTransactional: { type: Boolean, default: true },
        acceptPersonalized: { type: Boolean, default: true },
        acceptSMS: { type: Boolean, default: false },
        acceptPush: { type: Boolean, default: false },
        acceptPhone: { type: Boolean, default: false },
        acceptPost: { type: Boolean, default: false },
        acceptedAt: Date,
        acceptedIp: String,
        consentSource: { type: String, enum: ['form', 'import', 'checkout', 'account', 'api', 'manual'] }
    },
    
    // GDPR/Privacy
    privacy: {
        gdprConsent: { type: Boolean, default: false },
        gdprConsentAt: Date,
        gdprConsentIp: String,
        gdprConsentMethod: String,
        ccpaOptOut: { type: Boolean, default: false },
        ccpaOptOutAt: Date,
        dataProcessingAgreement: { type: Boolean, default: false },
        dataRetentionConsent: { type: Boolean, default: false },
        marketingConsent: { type: Boolean, default: false },
        analyticsConsent: { type: Boolean, default: false },
        cookiesConsent: { type: Boolean, default: false },
        consentLog: [{
            type: { type: String, enum: ['gdpr', 'ccpa', 'marketing', 'analytics', 'cookies'] },
            action: { type: String, enum: ['granted', 'revoked', 'updated'] },
            details: String,
            ip: String,
            userAgent: String,
            timestamp: { type: Date, default: Date.now }
        }],
        lastPrivacyUpdate: Date,
        dataExportRequested: { type: Boolean, default: false },
        dataExportRequestedAt: Date,
        dataDeletionRequested: { type: Boolean, default: false },
        dataDeletionRequestedAt: Date,
        rightToBeForgotten: { type: Boolean, default: false }
    },
    
    // Source and attribution
    source: { type: String, default: 'organic' },
    sourceDetails: {
        campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' },
        medium: String,
        content: String,
        term: String,
        referrer: String,
        landingPage: String,
        utm: {
            source: String,
            medium: String,
            campaign: String,
            term: String,
            content: String
        }
    },
    referrer: String,
    landingPage: String,
    
    // Engagement
    engagement: { type: engagementSchema, default: () => ({}) },
    
    // Segmentation
    tags: [{ type: String, trim: true }],
    segments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CustomerSegment' }],
    lists: [{ type: mongoose.Schema.Types.ObjectId, ref: 'List' }],
    
    // Custom fields
    customFields: mongoose.Schema.Types.Mixed,
    
    // Lifecycle
    lifecycleStage: {
        type: String,
        enum: ['prospect', 'lead', 'customer', 'repeat_customer', 'vip', 'at_risk', 'churned'],
        default: 'prospect'
    },
    lifecycleScore: { type: Number, default: 0, min: 0, max: 100 },
    
    // Customer link
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    customerId: String,
    
    // Suppression
    suppressed: { type: Boolean, default: false },
    suppressionReason: { type: String, enum: ['hard_bounce', 'spam_complaint', 'manual', 'unsubscribe', 'list_cleaning', 'role_account', 'disposable'] },
    suppressedAt: Date,
    suppressedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    
    // Bounce tracking
    bounceCount: { type: Number, default: 0 },
    lastBounceAt: Date,
    lastBounceType: { type: String, enum: ['hard', 'soft'] },
    lastBounceReason: String,
    
    // Spam complaints
    complaintCount: { type: Number, default: 0 },
    lastComplaintAt: Date,
    
    // Timing
    firstSubscribedAt: Date,
    lastSubscribedAt: Date,
    lastUnsubscribedAt: Date,
    resubscribedAt: Date,
    
    // Import/Export
    importBatch: String,
    importSource: String,
    exportRequested: { type: Boolean, default: false },
    exportRequestedAt: Date,
    
    // Sync
    externalId: String,
    externalSource: String,
    lastSyncedAt: Date,
    syncStatus: { type: String, enum: ['synced', 'pending', 'failed', 'never'], default: 'never' },
    syncError: String,
    
    // Metadata
    tags: [{ type: String, trim: true }],
    notes: String,
    custom: mongoose.Schema.Types.Mixed,
    
    // Created/Modified tracking
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

subscriberSchema.index({ email: 1 }, { unique: true });
subscriberSchema.index({ status: 1, confirmed: 1 });
subscriberSchema.index({ status: 1, confirmed: 1, createdAt: -1 });
subscriberSchema.index({ tags: 1 });
subscriberSchema.index({ segments: 1 });
subscriberSchema.index({ customer: 1 });
subscriberSchema.index({ lifecycleStage: 1, status: 1 });
subscriberSchema.index({ 'engagement.engagementScore': -1 });
subscriberSchema.index({ 'engagement.lastEngagementAt': -1 });
subscriberSchema.index({ source: 1, createdAt: -1 });
subscriberSchema.index({ 'sourceDetails.campaign': 1 });
subscriberSchema.index({ tags: 1, status: 1 });
subscriberSchema.index({ lifecycleStage: 1, lifecycleScore: -1 });

subscriberSchema.index({ email: 'text', firstName: 'text', lastName: 'text' });

subscriberSchema.virtual('fullName').get(function() {
    return `${this.firstName || ''} ${this.lastName || ''}`.trim() || this.email;
});

subscriberSchema.virtual('isActive').get(function() {
    return this.status === 'subscribed' && this.confirmed;
});

subscriberSchema.virtual('age').get(function() {
    if (!this.profile?.dateOfBirth) return null;
    const today = new Date();
    const birth = new Date(this.profile.dateOfBirth);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
});

subscriberSchema.methods.calculateEngagementScore = function() {
    const e = this.engagement;
    if (!e || e.totalSent === 0) {
        this.engagement.engagementScore = 0;
        this.engagement.engagementLevel = 'unknown';
        return 0;
    }
    
    // Weighted scoring algorithm
    const openRate = e.totalOpened / e.totalDelivered;
    const clickRate = e.totalClicked / e.totalDelivered;
    const clickToOpenRate = e.totalOpened > 0 ? e.totalClicked / e.totalOpened : 0;
    
    // Recency factor (days since last engagement)
    const daysSinceEngagement = e.lastEngagementAt 
        ? (Date.now() - e.lastEngagementAt) / (1000 * 60 * 60 * 24)
        : 365;
    const recencyFactor = Math.max(0, 1 - (daysSinceEngagement / 90));
    
    // Frequency factor
    const frequencyFactor = Math.min(e.totalOpened / Math.max(e.totalSent, 1), 1);
    
    // Weighted score (0-100)
    const score = Math.round(
        (openRate * 30) +
        (clickRate * 25) +
        (clickToOpenRate * 20) +
        (recencyFactor * 15) +
        (frequencyFactor * 10)
    );
    
    let level = 'dormant';
    if (score >= 80) level = 'highly_engaged';
    else if (score >= 60) level = 'engaged';
    else if (score >= 40) level = 'somewhat_engaged';
    else if (score >= 20) level = 'unengaged';
    
    this.engagement.engagementScore = Math.min(100, Math.max(0, score));
    this.engagement.engagementLevel = level;
    this.engagement.lastEngagementScoreUpdate = new Date();
    
    return this.engagement.engagementScore;
};

subscriberSchema.methods.updateLifecycleStage = function() {
    const e = this.engagement;
    const orders = this.customer ? this.customer.orderCount || 0 : 0;
    const totalSpent = this.customer ? this.customer.totalSpent || 0 : 0;
    
    let stage = 'prospect';
    
    if (this.customer) {
        if (totalSpent > 100000 || orders > 20) stage = 'vip';
        else if (orders > 1) stage = 'repeat_customer';
        else if (orders === 1) stage = 'customer';
        else stage = 'lead';
    } else {
        if (this.engagement.engagementScore > 60) stage = 'lead';
    }
    
    // Check for at risk
    if (this.customer && this.engagement.lastEngagementAt) {
        const daysSince = (Date.now() - this.engagement.lastEngagementAt) / (1000 * 60 * 60 * 24);
        if (daysSince > 90) stage = 'at_risk';
        if (daysSince > 180) stage = 'churned';
    }
    
    this.lifecycleStage = stage;
    return stage;
};

subscriberSchema.methods.confirmSubscription = function() {
    this.status = 'subscribed';
    this.confirmed = true;
    this.confirmedAt = new Date();
    if (!this.firstSubscribedAt) this.firstSubscribedAt = new Date();
    this.lastSubscribedAt = new Date();
    return this.save();
};

subscriberSchema.methods.unsubscribe = function(reason, method = 'link', campaignId = null) {
    this.status = 'unsubscribed';
    this.lastUnsubscribedAt = new Date();
    
    if (!this.engagement.unsubscribeHistory) this.engagement.unsubscribeHistory = [];
    this.engagement.unsubscribeHistory.push({
        campaign: campaignId,
        reason,
        method,
        unsubscribedAt: new Date()
    });
    
    return this.save();
};

subscriberSchema.methods.recordEngagement = function(action, campaignId = null, data = {}) {
    const e = this.engagement;
    const now = new Date();
    
    switch (action) {
        case 'sent':
            e.totalSent = (e.totalSent || 0) + 1;
            break;
        case 'delivered':
            e.totalDelivered = (e.totalDelivered || 0) + 1;
            break;
        case 'open':
            if (!e.firstOpenedAt) e.firstOpenedAt = now;
            e.lastOpenedAt = now;
            e.totalOpened = (e.totalOpened || 0) + 1;
            if (campaignId && !e.campaignsInteracted?.includes(campaignId)) {
                e.campaignsInteracted = e.campaignsInteracted || [];
                e.campaignsInteracted.push(campaignId);
            }
            e.campaignsOpened = (e.campaignsOpened || 0) + 1;
            break;
        case 'click':
            if (!e.firstClickedAt) e.firstClickedAt = now;
            e.lastClickedAt = now;
            e.totalClicked = (e.totalClicked || 0) + 1;
            if (campaignId && !e.campaignsInteracted?.includes(campaignId)) {
                e.campaignsInteracted = e.campaignsInteracted || [];
                e.campaignsInteracted.push(campaignId);
            }
            e.campaignsClicked = (e.campaignsClicked || 0) + 1;
            e.lastCampaignInteracted = campaignId;
            
            // Track link
            if (data.url) {
                const existingLink = e.clickedLinks?.find(l => l.url === data.url && l.campaign?.toString() === campaignId?.toString());
                if (existingLink) {
                    existingLink.count = (existingLink.count || 1) + 1;
                    existingLink.clickedAt = now;
                } else {
                    e.clickedLinks = e.clickedLinks || [];
                    e.clickedLinks.push({ url: data.url, campaign: campaignId, clickedAt: now, count: 1 });
                }
            }
            break;
        case 'bounce':
            e.totalBounced = (e.totalBounced || 0) + 1;
            break;
        case 'unsubscribe':
            e.totalUnsubscribed = (e.totalUnsubscribed || 0) + 1;
            break;
        case 'complaint':
            e.totalComplained = (e.totalComplained || 0) + 1;
            break;
    }
    
    e.lastEngagementAt = now;
    e.lastCampaignInteracted = campaignId;
    e.campaignsInteracted = e.campaignsInteracted || [];
    if (campaignId && !e.campaignsInteracted.includes(campaignId)) {
        e.campaignsInteracted.push(campaignId);
    }
    
    // Update scores
    this.calculateEngagementScore();
    this.updateLifecycleStage();
    
    return this.save();
};

subscriberSchema.statics.findByEmail = function(email) {
    return this.findOne({ email: email.toLowerCase().trim() });
};

subscriberSchema.statics.findSubscribed = function() {
    return this.find({ status: 'subscribed', confirmed: true });
};

subscriberSchema.statics.findBySegment = async function(segmentId) {
    const CustomerSegment = mongoose.model('CustomerSegment');
    const segment = await mongoose.model('CustomerSegment').findById(segmentId);
    if (!segment) return [];
    
    return this.find(segment.buildSubscriberQuery());
};

subscriberSchema.statics.getEngagementStats = async function() {
    return this.aggregate([
        { $match: { status: 'subscribed', confirmed: true } },
        {
            $group: {
                _id: '$engagement.engagementLevel',
                count: { $sum: 1 },
                avgScore: { $avg: '$engagement.engagementScore' }
            }
        }
    );
};

module.exports = mongoose.model('Subscriber', subscriberSchema);