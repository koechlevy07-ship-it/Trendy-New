const mongoose = require('mongoose');

const segmentFilterSchema = new mongoose.Schema({
    field: { type: String, required: true },
    operator: {
        type: String,
        enum: [
            'equals', 'not_equals', 'contains', 'not_contains',
            'starts_with', 'ends_with', 'greater_than', 'less_than',
            'greater_than_or_equal', 'less_than_or_equal',
            'in', 'not_in', 'between', 'exists', 'not_exists',
            'regex', 'before', 'after', 'on_date', 'last_n_days', 'next_n_days'
        ],
        required: true
    },
    value: mongoose.Schema.Types.Mixed,
    value2: mongoose.Schema.Types.Mixed,
    logic: { type: String, enum: ['AND', 'OR'], default: 'AND' }
}, { _id: false });

const segmentSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, maxlength: 100 },
    slug: { type: String, unique: true, lowercase: true, trim: true },
    description: { type: String, trim: true, maxlength: 500 },
    
    // Segment type
    type: {
        type: String,
        enum: ['static', 'dynamic', 'manual', 'imported', 'rfm', 'predictive'],
        default: 'dynamic'
    },
    
    // Filters
    filters: [segmentFilterSchema],
    filterLogic: { type: String, enum: ['AND', 'OR'], default: 'AND' },
    
    // RFM specific
    rfmConfig: {
        recencyWeight: { type: Number, default: 1 },
        frequencyWeight: { type: Number, default: 1 },
        monetaryWeight: { type: Number, default: 1 },
        recencyBins: { type: Number, default: 5 },
        frequencyBins: { type: Number, default: 5 },
        monetaryBins: { type: Number, default: 5 }
    },
    
    // Manual members (for static/imported segments)
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Subscriber' }],
    
    // Segment metrics
    metrics: {
        totalMembers: { type: Number, default: 0 },
        activeMembers: { type: Number, default: 0 },
        avgEngagementScore: { type: Number, default: 0 },
        avgLifetimeValue: { type: Number, default: 0 },
        avgOrderValue: { type: Number, default: 0 },
        avgOrders: { type: Number, default: 0 },
        churnRate: { type: Number, default: 0 },
        growthRate: { type: Number, default: 0 }
    },
    
    // Auto-refresh
    autoRefresh: { type: Boolean, default: true },
    refreshInterval: { type: String, enum: ['realtime', 'hourly', 'daily', 'weekly', 'monthly'], default: 'daily' },
    lastRefreshedAt: Date,
    nextRefreshAt: Date,
    
    // Usage tracking
    usageCount: { type: Number, default: 0 },
    campaignsUsed: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' }],
    lastUsedAt: Date,
    
    // Metadata
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isPublic: { type: Boolean, default: false },
    isSystem: { type: Boolean, default: false },
    tags: [{ type: String, trim: true }],
    color: { type: String, default: '#C8A35A' },
    icon: { type: String, default: 'users' }
}, { timestamps: true });

segmentSchema.index({ slug: 1 }, { unique: true });
segmentSchema.index({ type: 1, createdBy: 1 });
segmentSchema.index({ 'metrics.totalMembers': -1 });
segmentSchema.index({ autoRefresh: 1, nextRefreshAt: 1 });
segmentSchema.index({ tags: 1 });

segmentSchema.pre('save', function(next) {
    if (this.isModified('name') && !this.slug) {
        this.slug = this.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    }
    if (this.isModified('filters') || this.isNew) {
        this.nextRefreshAt = this.autoRefresh ? this.calculateNextRefresh() : null;
    }
    next();
});

segmentSchema.methods.calculateNextRefresh = function() {
    const intervals = {
        realtime: 0,
        hourly: 3600000,
        daily: 86400000,
        weekly: 604800000,
        monthly: 2592000000
    };
    return new Date(Date.now() + (intervals[this.refreshInterval] || intervals.daily));
};

// Static method to evaluate segment membership
segmentSchema.statics.evaluateSegment = async function(segmentId, subscriberId) {
    const segment = await this.findById(segmentId);
    if (!segment) return false;
    
    const Subscriber = mongoose.model('Subscriber');
    const subscriber = await Subscriber.findById(subscriberId);
    if (!subscriber) return false;
    
    return segment.evaluateFilters(subscriber);
};

segmentSchema.methods.evaluateFilters = function(subscriber) {
    if (this.filters.length === 0) return true;
    
    const results = this.filters.map(filter => this.evaluateFilter(subscriber, filter));
    
    if (this.filterLogic === 'OR') {
        return results.some(r => r === true);
    }
    return results.every(r => r === true);
};

segmentSchema.methods.evaluateFilter = function(subscriber, filter) {
    const fieldValue = this.getNestedValue(subscriber, filter.field);
    const filterValue = filter.value;
    const filterValue2 = filter.value2;
    
    if (fieldValue === undefined || fieldValue === null) {
        return filter.operator === 'exists' ? false : filter.operator === 'not_exists' ? true : false;
    }
    
    switch (filter.operator) {
        case 'equals':
            return fieldValue === filterValue;
        case 'not_equals':
            return fieldValue !== filterValue;
        case 'contains':
            return String(fieldValue).toLowerCase().includes(String(filterValue).toLowerCase());
        case 'not_contains':
            return !String(fieldValue).toLowerCase().includes(String(filterValue).toLowerCase());
        case 'starts_with':
            return String(fieldValue).toLowerCase().startsWith(String(filterValue).toLowerCase());
        case 'ends_with':
            return String(fieldValue).toLowerCase().endsWith(String(filterValue).toLowerCase());
        case 'greater_than':
            return Number(fieldValue) > Number(filterValue);
        case 'less_than':
            return Number(fieldValue) < Number(filterValue);
        case 'greater_than_or_equal':
            return Number(fieldValue) >= Number(filterValue);
        case 'less_than_or_equal':
            return Number(fieldValue) <= Number(filterValue);
        case 'in':
            return Array.isArray(filterValue) && filterValue.includes(fieldValue);
        case 'not_in':
            return Array.isArray(filterValue) && !filterValue.includes(fieldValue);
        case 'between':
            return Number(fieldValue) >= Number(filterValue) && Number(fieldValue) <= Number(filterValue2);
        case 'exists':
            return fieldValue !== undefined && fieldValue !== null && fieldValue !== '';
        case 'not_exists':
            return fieldValue === undefined || fieldValue === null || fieldValue === '';
        case 'regex':
            return new RegExp(filterValue).test(String(fieldValue));
        case 'before':
            return new Date(fieldValue) < new Date(filterValue);
        case 'after':
            return new Date(fieldValue) > new Date(filterValue);
        case 'on_date':
            const date1 = new Date(fieldValue).toDateString();
            const date2 = new Date(filterValue).toDateString();
            return date1 === date2;
        case 'last_n_days':
            const cutoff = new Date(Date.now() - filterValue * 24 * 60 * 60 * 1000);
            return new Date(fieldValue) >= cutoff;
        case 'next_n_days':
            const future = new Date(Date.now() + filterValue * 24 * 60 * 60 * 1000);
            return new Date(fieldValue) <= future;
        default:
            return false;
    }
};

segmentSchema.methods.getNestedValue = function(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
};

// Static method to refresh all auto-refresh segments
segmentSchema.statics.refreshAllAuto = async function() {
    const segments = await this.find({ autoRefresh: true });
    for (const segment of segments) {
        await segment.refreshMembers();
    }
};

segmentSchema.methods.refreshMembers = async function() {
    const Subscriber = mongoose.model('Subscriber');
    
    // Build query from filters
    const query = this.buildSubscriberQuery();
    
    // Count members
    const totalMembers = await Subscriber.countDocuments(query);
    
    if (this.type === 'dynamic') {
        // For dynamic segments, just update count
        this.metrics.totalMembers = totalMembers;
    } else if (this.type === 'static' || this.type === 'imported') {
        // For static segments, we could update members but typically they're manual
    }
    
    // Calculate additional metrics
    if (totalMembers > 0) {
        const subscribers = await Subscriber.find(query).select('engagement');
        this.metrics.activeMembers = subscribers.filter(s => s.engagement?.lastEngagementAt && 
            (Date.now() - s.engagement.lastEngagementAt) < 30 * 24 * 60 * 60 * 1000).length;
        
        const engagementScores = subscribers.map(s => s.engagement?.engagementScore || 0);
        this.metrics.avgEngagementScore = engagementScores.length > 0 
            ? Math.round(engagementScores.reduce((a, b) => a + b, 0) / engagementScores.length) 
            : 0;
    }
    
    this.lastRefreshedAt = new Date();
    this.nextRefreshAt = this.calculateNextRefresh();
    
    await this.save();
    return this;
};

segmentSchema.methods.buildSubscriberQuery = function() {
    const query = { status: 'subscribed', confirmed: true };
    
    if (this.filters.length === 0) return query;
    
    const conditions = this.filters.map(filter => this.buildFilterCondition(filter));
    
    if (this.filterLogic === 'OR') {
        query.$or = conditions;
    } else {
        query.$and = conditions;
    }
    
    return query;
};

segmentSchema.methods.buildFilterCondition = function(filter) {
    const field = filter.field;
    const op = filter.operator;
    const val = filter.value;
    const val2 = filter.value2;
    
    // Map segment fields to subscriber fields
    const fieldMap = {
        'email': 'email',
        'firstName': 'firstName',
        'lastName': 'lastName',
        'status': 'status',
        'confirmed': 'confirmed',
        'createdAt': 'createdAt',
        'engagementScore': 'engagement.engagementScore',
        'lastOpenedAt': 'engagement.lastOpenedAt',
        'lastClickedAt': 'engagement.lastClickedAt',
        'lastEngagementAt': 'engagement.lastEngagementAt',
        'totalOpened': 'engagement.totalOpened',
        'totalClicked': 'engagement.totalClicked',
        'averageOpenRate': 'engagement.averageOpenRate',
        'averageClickRate': 'engagement.averageClickRate',
        'totalSent': 'engagement.totalSent',
        'totalDelivered': 'engagement.totalDelivered',
        'tags': 'tags',
        'segments': 'segments',
        'source': 'source',
        'country': 'country',
        'city': 'city',
        'status': 'status'
    };
    
    const mappedField = fieldMap[field] || field;
    const val = filter.value;
    const val2 = filter.value2;
    
    switch (op) {
        case 'equals': return { [mappedField]: val };
        case 'not_equals': return { [mappedField]: { $ne: val } };
        case 'contains': return { [mappedField]: { $regex: val, $options: 'i' } };
        case 'not_contains': return { [mappedField]: { $not: { $regex: val, $options: 'i' } } };
        case 'starts_with': return { [mappedField]: { $regex: `^${val}`, $options: 'i' } };
        case 'ends_with': return { [mappedField]: { $regex: `${val}$`, $options: 'i' } };
        case 'greater_than': return { [mappedField]: { $gt: val } };
        case 'less_than': return { [mappedField]: { $lt: val } };
        case 'greater_than_or_equal': return { [mappedField]: { $gte: val } };
        case 'less_than_or_equal': return { [mappedField]: { $lte: val } };
        case 'in': return { [mappedField]: { $in: val } };
        case 'not_in': return { [mappedField]: { $nin: val } };
        case 'between': return { [mappedField]: { $gte: val, $lte: val2 } };
        case 'exists': return { [mappedField]: { $exists: true, $ne: null, $ne: '' } };
        case 'not_exists': return { $or: [{ [mappedField]: { $exists: false } }, { [mappedField]: null }, { [mappedField]: '' }] };
        case 'regex': return { [mappedField]: { $regex: val, $options: 'i' } };
        case 'before': return { [mappedField]: { $lt: new Date(val) } };
        case 'after': return { [mappedField]: { $gt: new Date(val) } };
        case 'on_date': {
            const start = new Date(val);
            start.setHours(0, 0, 0, 0);
            const end = new Date(start);
            end.setDate(end.getDate() + 1);
            return { [mappedField]: { $gte: start, $lt: end } };
        }
        case 'last_n_days': {
            const cutoff = new Date(Date.now() - val * 24 * 60 * 60 * 1000);
            return { [mappedField]: { $gte: cutoff } };
        }
        case 'next_n_days': {
            const future = new Date(Date.now() + val * 24 * 60 * 60 * 1000);
            return { [mappedField]: { $lte: future } };
        }
        default: return {};
    }
};

module.exports = mongoose.model('CustomerSegment', segmentSchema);