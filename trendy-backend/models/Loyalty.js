const mongoose = require('mongoose');

const loyaltyTransactionSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: [
            'earn_purchase', 'earn_review', 'earn_referral', 'earn_signup',
            'earn_profile_complete', 'earn_newsletter', 'earn_birthday',
            'earn_promotion', 'redeem_reward', 'redeem_coupon',
            'manual_adjustment', 'expired', 'refund'
        ],
        required: true
    },
    points: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    description: { type: String, default: '' },
    reference: {
        type: { type: String, enum: ['order', 'review', 'referral', 'reward', 'coupon', 'manual'] },
        id: { type: mongoose.Schema.Types.ObjectId, refPath: 'reference.type' }
    },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { _id: true, timestamps: true });

const loyaltyRewardSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    pointsCost: { type: Number, required: true, min: 1 },
    type: {
        type: String,
        enum: [
            'discount_coupon', 'free_shipping', 'gift_card',
            'exclusive_product', 'vip_access', 'limited_edition'
        ],
        required: true
    },
    value: { type: mongoose.Schema.Types.Mixed, default: {} },
    tierRestriction: {
        type: String,
        enum: ['bronze', 'silver', 'gold', 'platinum', 'diamond', 'all'],
        default: 'all'
    },
    stock: { type: Number, default: 0 },
    maxPerCustomer: { type: Number, default: 1 },
    isActive: { type: Boolean, default: true },
    startDate: { type: Date },
    endDate: { type: Date },
    image: { type: String, default: '' },
    terms: { type: String, default: '' }
}, { timestamps: true });

const referralSchema = new mongoose.Schema({
    referrer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    referee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    referralCode: { type: String, required: true, uppercase: true, trim: true },
    status: {
        type: String,
        enum: ['pending', 'completed', 'expired', 'cancelled'],
        default: 'pending'
    },
    referrerReward: { type: Number, default: 0 },
    refereeReward: { type: Number, default: 0 },
    referrerPointsAwarded: { type: Boolean, default: false },
    refereePointsAwarded: { type: Boolean, default: false },
    completedAt: { type: Date },
    expiresAt: { type: Date }
}, { timestamps: true });

const achievementSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    icon: { type: String, default: '' },
    badgeColor: { type: String, default: '#C8A35A' },
    criteria: {
        type: { type: String, enum: ['orders', 'spent', 'reviews', 'referrals', 'points', 'tier', 'custom'] },
        value: { type: Number },
        customCheck: { type: String }
    },
    pointsReward: { type: Number, default: 0 },
    tierRequirement: { type: String, enum: ['bronze', 'silver', 'gold', 'platinum', 'diamond', 'any'], default: 'any' },
    isActive: { type: Boolean, default: true },
    isHidden: { type: Boolean, default: false }
}, { timestamps: true });

const userAchievementSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    achievement: { type: mongoose.Schema.Types.ObjectId, ref: 'Achievement', required: true },
    unlockedAt: { type: Date, default: Date.now },
    progress: { type: Number, default: 0 },
    notified: { type: Boolean, default: false }
}, { timestamps: true });

const loyaltyTierSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true, trim: true },
    key: { type: String, required: true, unique: true, lowercase: true, trim: true },
    displayOrder: { type: Number, required: true },
    minPoints: { type: Number, required: true, default: 0 },
    maxPoints: { type: Number, default: null },
    badge: { type: String, default: '' },
    badgeColor: { type: String, default: '#C8A35A' },
    badgeIcon: { type: String, default: 'fas fa-crown' },
    benefits: {
        discountPercentage: { type: Number, default: 0, min: 0, max: 100 },
        freeShipping: { type: Boolean, default: false },
        earlyAccess: { type: Boolean, default: false },
        birthdayReward: { type: Number, default: 0 },
        anniversaryReward: { type: Number, default: 0 },
        prioritySupport: { type: Boolean, default: false },
        exclusiveProducts: { type: Boolean, default: false },
        personalShopper: { type: Boolean, default: false }
    },
    color: { type: String, default: '#C8A35A' },
    gradient: { type: String, default: '' },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

const loyaltySettingsSchema = new mongoose.Schema({
    pointsPerCurrency: { type: Number, default: 1 },
    minOrderForPoints: { type: Number, default: 0 },
    pointsExpiryDays: { type: Number, default: 365 },
    signupBonus: { type: Number, default: 100 },
    firstPurchaseBonus: { type: Number, default: 500 },
    reviewPoints: { type: Number, default: 50 },
    profileCompletePoints: { type: Number, default: 100 },
    newsletterPoints: { type: Number, default: 50 },
    birthdayPoints: { type: Number, default: 500 },
    referralReferrerPoints: { type: Number, default: 500 },
    referralRefereePoints: { type: Number, default: 200 },
    referralExpiryDays: { type: Number, default: 30 },
    pointsForKsh: { type: Number, default: 100 },
    enableReferralProgram: { type: Boolean, default: true },
    enableReviews: { type: Boolean, default: true },
    enableAchievements: { type: Boolean, default: true },
    pointsRounding: { type: String, enum: ['floor', 'ceil', 'round'], default: 'floor' }
}, { timestamps: true });

const LoyaltyTransaction = mongoose.model('LoyaltyTransaction', loyaltyTransactionSchema);
const LoyaltyReward = mongoose.model('LoyaltyReward', loyaltyRewardSchema);
const Referral = mongoose.model('Referral', referralSchema);
const Achievement = mongoose.model('Achievement', achievementSchema);
const UserAchievement = mongoose.model('UserAchievement', userAchievementSchema);
const LoyaltyTier = mongoose.model('LoyaltyTier', loyaltyTierSchema);
const LoyaltySettings = mongoose.model('LoyaltySettings', loyaltySettingsSchema);

module.exports = {
    LoyaltyTransaction,
    LoyaltyReward,
    Referral,
    Achievement,
    UserAchievement,
    LoyaltyTier,
    LoyaltySettings
};