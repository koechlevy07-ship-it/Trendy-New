const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { LoyaltyTransaction, LoyaltyReward, Referral, Achievement, UserAchievement, LoyaltyTier, LoyaltySettings } = require('../models/Loyalty');
const User = require('../models/User');
const Order = require('../models/Order');
const Review = require('../models/Review');
const Coupon = require('../models/Coupon');

// Helper: Get or create user's referral code
async function getOrCreateReferralCode(userId) {
    const user = await User.findById(userId);
    if (!user.loyalty.referralCode) {
        const code = 'TW' + user.customerId?.slice(-4).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase();
        user.loyalty.referralCode = code;
        await user.save();
    }
    return user.loyalty.referralCode;
}

// Helper: Get loyalty settings
async function getLoyaltySettings() {
    let settings = await LoyaltySettings.findOne({});
    if (!settings) {
        settings = await LoyaltySettings.create({});
    }
    return settings;
}

// Helper: Get user's current tier and progress
async function getUserTierProgress(user) {
    const tiers = await LoyaltyTier.find({ isActive: true }).sort({ displayOrder: 1 });
    const currentPoints = user.loyalty?.currentPoints || 0;
    const lifetimePoints = user.loyalty?.lifetimePoints || 0;
    
    let currentTier = tiers.find(t => t.key === (user.loyalty?.currentTier || 'bronze')) || tiers[0];
    let nextTier = null;
    let progress = 0;
    
    for (let i = 0; i < tiers.length; i++) {
        if (tiers[i].key === currentTier.key && i < tiers.length - 1) {
            nextTier = tiers[i + 1];
            const minPoints = currentTier.minPoints;
            const maxPoints = nextTier.minPoints;
            progress = maxPoints > minPoints ? Math.min(100, Math.round(((currentPoints - minPoints) / (maxPoints - minPoints)) * 100)) : 100;
            break;
        }
    }
    
    if (!nextTier) {
        progress = 100;
    }
    
    return { currentTier, nextTier, progress, tiers };
}

// ========== CUSTOMER ROUTES ==========

// GET /api/loyalty/profile - Get customer's loyalty profile
router.get('/profile', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id)
            .populate('achievements')
            .lean();
        
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const { currentTier, nextTier, progress, tiers } = await getUserTierProgress(user);
        const referralCode = await getOrCreateReferralCode(user._id);
        
        // Get recent transactions
        const transactions = await LoyaltyTransaction.find({ user: user._id })
            .sort({ createdAt: -1 })
            .limit(20)
            .lean();

        // Get available rewards
        const rewards = await LoyaltyReward.find({ 
            isActive: true,
            $or: [
                { tierRestriction: 'all' },
                { tierRestriction: user.loyalty?.currentTier || 'bronze' }
            ],
            $and: [
                { $or: [{ startDate: { $exists: false } }, { startDate: { $lte: new Date() } }] },
                { $or: [{ endDate: { $exists: false } }, { endDate: { $gte: new Date() } }] }
            ]
        }).sort({ pointsCost: 1 }).lean();

        // Get referrals
        const referrals = await Referral.find({ referrer: user._id })
            .populate('referee', 'name email createdAt')
            .sort({ createdAt: -1 })
            .lean();

        // Get achievements
        const userAchievements = await UserAchievement.find({ user: user._id })
            .populate('achievement')
            .lean();

        const allAchievements = await Achievement.find({ isActive: true }).lean();
        const earnedAchievementIds = userAchievements.map(ua => ua.achievement?._id?.toString() || '');
        
        // Calculate stats
        const stats = {
            currentPoints: user.loyalty?.currentPoints || 0,
            lifetimePoints: user.loyalty?.lifetimePoints || 0,
            redeemedPoints: user.loyalty?.redeemedPoints || 0,
            currentTier: currentTier.key,
            tierName: currentTier.name,
            tierColor: currentTier.color,
            tierBadge: currentTier.badge,
            tierIcon: currentTier.badgeIcon,
            nextTier: nextTier ? { key: nextTier.key, name: nextTier.name, minPoints: nextTier.minPoints } : null,
            tierProgress: progress,
            totalReferrals: user.loyalty?.totalReferrals || 0,
            successfulReferrals: user.loyalty?.successfulReferrals || 0,
            referralRewardsEarned: user.loyalty?.referralRewardsEarned || 0,
            referralCode,
            achievementsCount: userAchievements.length,
            totalAchievements: allAchievements.length,
            transactions: transactions.map(t => ({
                type: t.type,
                points: t.points,
                balanceAfter: t.balanceAfter,
                description: t.description,
                createdAt: t.createdAt,
                reference: t.reference
            })),
            availableRewards: rewards,
            referrals: referrals,
            achievements: allAchievements.map(a => ({
                ...a,
                earned: earnedAchievementIds.includes(a._id.toString()),
                progress: userAchievements.find(ua => ua.achievement?._id?.toString() === a._id.toString())?.progress || 0,
                unlockedAt: userAchievements.find(ua => ua.achievement?._id?.toString() === a._id.toString())?.unlockedAt
            }))
        };

        res.json({ success: true, data: stats });
    } catch (err) {
        console.error('Loyalty profile error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/loyalty/history - Get loyalty transaction history with pagination
router.get('/history', authenticateToken, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const type = req.query.type;
        const skip = (page - 1) * limit;

        const query = { user: req.user.id };
        if (type) query.type = type;

        const [transactions, total] = await Promise.all([
            LoyaltyTransaction.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            LoyaltyTransaction.countDocuments(query)
        ]);

        res.json({
            success: true,
            data: {
                transactions: transactions.map(t => ({
                    type: t.type,
                    points: t.points,
                    balanceAfter: t.balanceAfter,
                    description: t.description,
                    createdAt: t.createdAt,
                    reference: t.reference
                })),
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit)
                }
            }
        });
    } catch (err) {
        console.error('Loyalty history error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/loyalty/rewards - Get available rewards
router.get('/rewards', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        const tier = user.loyalty?.currentTier || 'bronze';

        const rewards = await LoyaltyReward.find({ 
            isActive: true,
            $or: [
                { tierRestriction: 'all' },
                { tierRestriction: tier }
            ],
            $and: [
                { $or: [{ startDate: { $exists: false } }, { startDate: { $lte: new Date() } }] },
                { $or: [{ endDate: { $exists: false } }, { endDate: { $gte: new Date() } }] }
            ]
        }).sort({ pointsCost: 1 }).lean();

        res.json({ 
            success: true, 
            data: rewards.map(r => ({
                ...r,
                canAfford: (user.loyalty?.currentPoints || 0) >= r.pointsCost
            }))
        });
    } catch (err) {
        console.error('Get rewards error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// POST /api/loyalty/redeem - Redeem a reward
router.post('/redeem', authenticateToken, async (req, res) => {
    try {
        const { rewardId } = req.body;
        if (!rewardId) {
            return res.status(400).json({ success: false, message: 'Reward ID is required' });
        }

        const user = await User.findById(req.user.id);
        const reward = await LoyaltyReward.findById(rewardId);

        if (!reward) {
            return res.status(404).json({ success: false, message: 'Reward not found' });
        }

        if (!reward.isActive) {
            return res.status(400).json({ success: false, message: 'Reward is not active' });
        }

        const currentPoints = user.loyalty?.currentPoints || 0;
        if (currentPoints < reward.pointsCost) {
            return res.status(400).json({ success: false, message: 'Insufficient points' });
        }

        const tier = user.loyalty?.currentTier || 'bronze';
        if (reward.tierRestriction !== 'all' && reward.tierRestriction !== tier) {
            return res.status(400).json({ success: false, message: 'This reward is not available for your tier' });
        }

        if (reward.stock > 0 && reward.stock <= 0) {
            return res.status(400).json({ success: false, message: 'Reward out of stock' });
        }

        // Check max per customer
        const existingRedemptions = await LoyaltyTransaction.countDocuments({
            user: user._id,
            type: 'redeem_reward',
            'reference.id': reward._id
        });
        if (existingRedemptions >= reward.maxPerCustomer) {
            return res.status(400).json({ success: false, message: 'You have reached the maximum redemption limit for this reward' });
        }

        // Create the reward based on type
        let redemptionResult = { success: true, data: {} };
        
        if (reward.type === 'discount_coupon') {
            // Create a unique coupon for this user
            const couponCode = `LOYAL${user.customerId?.slice(-4).toUpperCase() || 'USER'}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
            const coupon = await Coupon.create({
                name: `Loyalty Reward - ${reward.name}`,
                code: couponCode,
                description: `Loyalty reward: ${reward.description}`,
                discountType: 'percentage',
                discountValue: reward.value.discountPercentage || 10,
                maxDiscount: reward.value.maxDiscount || 0,
                minCartValue: reward.value.minCartValue || 0,
                usageLimit: 1,
                usageLimitPerCustomer: 1,
                customerEligibility: 'specific',
                eligibleCustomers: [user._id],
                status: 'active',
                startDate: new Date(),
                endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
                tags: ['loyalty', 'reward']
            });
            redemptionResult.data = { couponCode: coupon.code, couponId: coupon._id };
        } else if (reward.type === 'free_shipping') {
            const couponCode = `FREESHIP${user.customerId?.slice(-4).toUpperCase() || 'USER'}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
            const coupon = await Coupon.create({
                name: `Loyalty Reward - ${reward.name}`,
                code: couponCode,
                description: `Loyalty reward: ${reward.description}`,
                discountType: 'free_shipping',
                discountValue: 0,
                usageLimit: 1,
                usageLimitPerCustomer: 1,
                customerEligibility: 'specific',
                eligibleCustomers: [user._id],
                status: 'active',
                startDate: new Date(),
                endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                tags: ['loyalty', 'reward']
            });
            redemptionResult.data = { couponCode: coupon.code, couponId: coupon._id };
        } else if (reward.type === 'gift_card') {
            // Generate a gift card code
            const giftCardCode = `GC${user.customerId?.slice(-4).toUpperCase() || 'USER'}${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
            redemptionResult.data = { giftCardCode, value: reward.value.amount };
        }

        // Deduct points
        const newPoints = currentPoints - reward.pointsCost;
        const newLifetimePoints = user.loyalty.lifetimePoints;
        const newRedeemedPoints = (user.loyalty.redeemedPoints || 0) + reward.pointsCost;

        user.loyalty.currentPoints = newPoints;
        user.loyalty.redeemedPoints = newRedeemedPoints;
        await user.save();

        // Create transaction record
        await LoyaltyTransaction.create({
            user: user._id,
            type: 'redeem_reward',
            points: -reward.pointsCost,
            balanceAfter: newPoints,
            description: `Redeemed: ${reward.name}`,
            reference: { type: 'reward', id: reward._id }
        });

        // Update reward stock
        if (reward.stock > 0) {
            reward.stock -= 1;
            await reward.save();
        }

        res.json({ 
            success: true, 
            message: 'Reward redeemed successfully!',
            data: {
                ...redemptionResult.data,
                newPointsBalance: newPoints,
                reward: {
                    id: reward._id,
                    name: reward.name,
                    type: reward.type
                }
            }
        });
    } catch (err) {
        console.error('Redeem reward error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/loyalty/referrals - Get referral info
router.get('/referrals', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        const referralCode = await getOrCreateReferralCode(user._id);

        const referrals = await Referral.find({ referrer: user._id })
            .populate('referee', 'name email createdAt')
            .sort({ createdAt: -1 })
            .lean();

        const stats = {
            referralCode,
            totalReferrals: referrals.length,
            pendingReferrals: referrals.filter(r => r.status === 'pending').length,
            completedReferrals: referrals.filter(r => r.status === 'completed').length,
            totalRewardsEarned: user.loyalty?.referralRewardsEarned || 0,
            referrals: referrals.map(r => ({
                id: r._id,
                referee: r.referee,
                status: r.status,
                referrerReward: r.referrerReward,
                refereeReward: r.refereeReward,
                createdAt: r.createdAt,
                completedAt: r.completedAt
            }))
        };

        res.json({ success: true, data: stats });
    } catch (err) {
        console.error('Get referrals error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// POST /api/loyalty/referrals - Create referral (for new user signup)
router.post('/referrals', async (req, res) => {
    try {
        const { referralCode, userId } = req.body;
        
        if (!referralCode || !userId) {
            return res.status(400).json({ success: false, message: 'Referral code and user ID are required' });
        }

        // Find referrer
        const referrer = await User.findOne({ 'loyalty.referralCode': referralCode.toUpperCase() });
        if (!referrer) {
            return res.status(404).json({ success: false, message: 'Invalid referral code' });
        }

        // Check if user already has a referral
        const existingReferral = await Referral.findOne({ referee: userId });
        if (existingReferral) {
            return res.status(400).json({ success: false, message: 'User already has a referral' });
        }

        // Can't refer yourself
        if (referrer._id.toString() === userId) {
            return res.status(400).json({ success: false, message: 'Cannot refer yourself' });
        }

        const settings = await getLoyaltySettings();

        const referral = await Referral.create({
            referrer: referrer._id,
            referee: userId,
            referralCode: referralCode.toUpperCase(),
            status: 'pending',
            referrerReward: settings.referralReferrerPoints,
            refereeReward: settings.referralRefereePoints,
            expiresAt: new Date(Date.now() + settings.referralExpiryDays * 24 * 60 * 60 * 1000)
        });

        // Update referrer stats
        referrer.loyalty.totalReferrals = (referrer.loyalty.totalReferrals || 0) + 1;
        await referrer.save();

        res.json({ success: true, message: 'Referral created successfully', data: referral });
    } catch (err) {
        console.error('Create referral error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// POST /api/loyalty/referrals/complete - Complete referral (when referee makes first purchase)
router.post('/referrals/complete', authenticateToken, async (req, res) => {
    try {
        // This should be called when a referred user completes their first order
        // The user making the request is the referee
        const userId = req.user.id;
        
        const referral = await Referral.findOne({ referee: userId, status: 'pending' });
        if (!referral) {
            return res.status(404).json({ success: false, message: 'No pending referral found' });
        }

        if (referral.expiresAt < new Date()) {
            referral.status = 'expired';
            await referral.save();
            return res.status(400).json({ success: false, message: 'Referral has expired' });
        }

        const settings = await getLoyaltySettings();
        const referrer = await User.findById(referral.referrer);
        const referee = await User.findById(userId);

        // Award points to referrer
        if (!referral.referrerPointsAwarded) {
            referrer.loyalty.currentPoints = (referrer.loyalty.currentPoints || 0) + settings.referralReferrerPoints;
            referrer.loyalty.lifetimePoints = (referrer.loyalty.lifetimePoints || 0) + settings.referralReferrerPoints;
            referrer.loyalty.referralRewardsEarned = (referrer.loyalty.referralRewardsEarned || 0) + settings.referralReferrerPoints;
            referrer.loyalty.successfulReferrals = (referrer.loyalty.successfulReferrals || 0) + 1;
            
            await LoyaltyTransaction.create({
                user: referrer._id,
                type: 'earn_referral',
                points: settings.referralReferrerPoints,
                balanceAfter: referrer.loyalty.currentPoints,
                description: `Referral bonus: ${referee.name} made their first purchase`,
                reference: { type: 'referral', id: referral._id }
            });
            
            await referrer.save();
            referral.referrerPointsAwarded = true;
        }

        // Award points to referee
        if (!referral.refereePointsAwarded) {
            referee.loyalty.currentPoints = (referee.loyalty.currentPoints || 0) + settings.referralRefereePoints;
            referee.loyalty.lifetimePoints = (referee.loyalty.lifetimePoints || 0) + settings.referralRefereePoints;
            
            await LoyaltyTransaction.create({
                user: referee._id,
                type: 'earn_referral',
                points: settings.referralRefereePoints,
                balanceAfter: referee.loyalty.currentPoints,
                description: `Welcome bonus from referral by ${referrer.name}`,
                reference: { type: 'referral', id: referral._id }
            });
            
            await referee.save();
            referral.refereePointsAwarded = true;
        }

        referral.status = 'completed';
        referral.completedAt = new Date();
        await referral.save();

        res.json({ success: true, message: 'Referral completed successfully' });
    } catch (err) {
        console.error('Complete referral error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ========== ADMIN ROUTES ==========

// Admin middleware
const requireAdmin = async (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    next();
};

// GET /api/admin/loyalty - Get loyalty dashboard stats
router.get('/admin/loyalty', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [
            totalMembers,
            totalPointsIssued,
            totalPointsRedeemed,
            tierDistribution,
            topCustomers,
            referralStats,
            recentTransactions
        ] = await Promise.all([
            User.countDocuments({ role: 'customer' }),
            LoyaltyTransaction.aggregate([
                { $match: { points: { $gt: 0 } } },
                { $group: { _id: null, total: { $sum: '$points' } } }
            ]),
            LoyaltyTransaction.aggregate([
                { $match: { points: { $lt: 0 } } },
                { $group: { _id: null, total: { $sum: { $abs: '$points' } } } }
            ]),
            User.aggregate([
                { $match: { role: 'customer' } },
                { $group: { _id: '$loyalty.currentTier', count: { $sum: 1 } } }
            ]),
            User.find({ role: 'customer', 'loyalty.currentPoints': { $gt: 0 } })
                .sort({ 'loyalty.currentPoints': -1 })
                .limit(10)
                .select('name email loyalty.currentPoints loyalty.lifetimePoints loyalty.currentTier')
                .lean(),
            Referral.aggregate([
                { $group: { _id: '$status', count: { $sum: 1 } } }
            ]),
            LoyaltyTransaction.find()
                .sort({ createdAt: -1 })
                .limit(20)
                .populate('user', 'name email')
                .lean()
        ]);

        // Get tier info
        const tiers = await LoyaltyTier.find({ isActive: true }).sort({ displayOrder: 1 }).lean();

        // Get rewards stats
        const rewardsStats = await LoyaltyReward.aggregate([
            { $group: { 
                _id: '$type', 
                count: { $sum: 1 },
                totalStock: { $sum: '$stock' }
            }}
        ]);

        res.json({ 
            success: true, 
            data: {
                totalMembers,
                totalPointsIssued: totalPointsIssued[0]?.total || 0,
                totalPointsRedeemed: totalPointsRedeemed[0]?.total || 0,
                tierDistribution: tierDistribution.map(t => {
                    const tierInfo = tiers.find(ti => ti.key === t._id);
                    return { tier: t._id, count: t.count, tierName: tierInfo?.name, color: tierInfo?.color };
                }),
                topCustomers,
                referralStats: referralStats.reduce((acc, r) => { acc[r._id] = r.count; return acc; }, {}),
                recentTransactions,
                tiers,
                rewardsStats
            }
        });
    } catch (err) {
        console.error('Admin loyalty dashboard error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/admin/loyalty/tiers - Get all tiers
router.get('/admin/loyalty/tiers', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const tiers = await LoyaltyTier.find().sort({ displayOrder: 1 }).lean();
        res.json({ success: true, data: tiers });
    } catch (err) {
        console.error('Get tiers error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// POST /api/admin/loyalty/tiers - Create tier
router.post('/admin/loyalty/tiers', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const tier = await LoyaltyTier.create(req.body);
        res.status(201).json({ success: true, data: tier });
    } catch (err) {
        console.error('Create tier error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// PUT /api/admin/loyalty/tiers/:id - Update tier
router.put('/admin/loyalty/tiers/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const tier = await LoyaltyTier.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!tier) return res.status(404).json({ success: false, message: 'Tier not found' });
        res.json({ success: true, data: tier });
    } catch (err) {
        console.error('Update tier error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// DELETE /api/admin/loyalty/tiers/:id - Delete tier
router.delete('/admin/loyalty/tiers/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        await LoyaltyTier.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Tier deleted' });
    } catch (err) {
        console.error('Delete tier error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/admin/loyalty/rewards - Get all rewards
router.get('/admin/loyalty/rewards', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        
        const [rewards, total] = await Promise.all([
            LoyaltyReward.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
            LoyaltyReward.countDocuments()
        ]);
        
        res.json({ 
            success: true, 
            data: rewards, 
            pagination: { page, limit, total, pages: Math.ceil(total / limit) }
        });
    } catch (err) {
        console.error('Get rewards error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// POST /api/admin/loyalty/rewards - Create reward
router.post('/admin/loyalty/rewards', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const reward = await LoyaltyReward.create(req.body);
        res.status(201).json({ success: true, data: reward });
    } catch (err) {
        console.error('Create reward error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// PUT /api/admin/loyalty/rewards/:id - Update reward
router.put('/admin/loyalty/rewards/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const reward = await LoyaltyReward.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!reward) return res.status(404).json({ success: false, message: 'Reward not found' });
        res.json({ success: true, data: reward });
    } catch (err) {
        console.error('Update reward error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// DELETE /api/admin/loyalty/rewards/:id - Delete reward
router.delete('/admin/loyalty/rewards/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        await LoyaltyReward.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Reward deleted' });
    } catch (err) {
        console.error('Delete reward error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/admin/loyalty/settings - Get loyalty settings
router.get('/admin/loyalty/settings', authenticateToken, requireAdmin, async (req, res) => {
    try {
        let settings = await LoyaltySettings.findOne({});
        if (!settings) {
            settings = await LoyaltySettings.create({});
        }
        res.json({ success: true, data: settings });
    } catch (err) {
        console.error('Get loyalty settings error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// PUT /api/admin/loyalty/settings - Update loyalty settings
router.put('/admin/loyalty/settings', authenticateToken, requireAdmin, async (req, res) => {
    try {
        let settings = await LoyaltySettings.findOne({});
        if (!settings) {
            settings = await LoyaltySettings.create(req.body);
        } else {
            Object.assign(settings, req.body);
            await settings.save();
        }
        res.json({ success: true, data: settings });
    } catch (err) {
        console.error('Update loyalty settings error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// POST /api/admin/loyalty/adjust-points - Manual point adjustment
router.post('/admin/loyalty/adjust-points', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { userId, points, reason, type } = req.body;
        
        if (!userId || !points || !reason) {
            return res.status(400).json({ success: false, message: 'User ID, points, and reason are required' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const currentPoints = user.loyalty?.currentPoints || 0;
        const newPoints = Math.max(0, currentPoints + points);
        
        user.loyalty.currentPoints = newPoints;
        if (points > 0) {
            user.loyalty.lifetimePoints = (user.loyalty.lifetimePoints || 0) + points;
        }
        await user.save();

        await LoyaltyTransaction.create({
            user: user._id,
            type: type || 'manual_adjustment',
            points,
            balanceAfter: newPoints,
            description: `Manual adjustment by admin: ${reason}`,
            reference: { type: 'manual', id: req.user.id }
        });

        // Check tier update
        const tiers = await LoyaltyTier.find({ isActive: true }).sort({ minPoints: 1 });
        let newTier = user.loyalty.currentTier || 'bronze';
        for (const tier of tiers) {
            if (newPoints >= tier.minPoints) {
                newTier = tier.key;
            }
        }
        
        if (newTier !== user.loyalty.currentTier) {
            user.loyalty.currentTier = newTier;
            await user.save();
            
            await LoyaltyTransaction.create({
                user: user._id,
                type: 'manual_adjustment',
                points: 0,
                balanceAfter: newPoints,
                description: `Tier upgraded to ${newTier}`,
                reference: { type: 'manual', id: req.user.id }
            });
        }

        res.json({ 
            success: true, 
            message: 'Points adjusted successfully',
            data: { newPoints, newTier }
        });
    } catch (err) {
        console.error('Adjust points error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;