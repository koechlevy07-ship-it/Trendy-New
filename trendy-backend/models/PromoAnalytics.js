const mongoose = require('mongoose');

const promoAnalyticsSchema = new mongoose.Schema({
    date: { type: Date, required: true },

    coupons: {
        totalActive: { type: Number, default: 0 },
        totalRedemptions: { type: Number, default: 0 },
        totalDiscount: { type: Number, default: 0 },
        revenue: { type: Number, default: 0 },
        newCouponsCreated: { type: Number, default: 0 },
        failedAttempts: { type: Number, default: 0 },
        topCoupon: { type: String, default: '' }
    },

    promotions: {
        totalActive: { type: Number, default: 0 },
        totalTriggered: { type: Number, default: 0 },
        totalDiscount: { type: Number, default: 0 },
        ordersAffected: { type: Number, default: 0 }
    },

    flashSales: {
        totalActive: { type: Number, default: 0 },
        totalSold: { type: Number, default: 0 },
        totalRevenue: { type: Number, default: 0 },
        totalDiscount: { type: Number, default: 0 }
    },

    giftCards: {
        totalActive: { type: Number, default: 0 },
        totalRedeemed: { type: Number, default: 0 },
        totalValue: { type: Number, default: 0 },
        newCreated: { type: Number, default: 0 }
    },

    banners: {
        totalActive: { type: Number, default: 0 },
        totalViews: { type: Number, default: 0 },
        totalClicks: { type: Number, default: 0 },
        totalConversions: { type: Number, default: 0 }
    },

    loyalty: {
        totalMembers: { type: Number, default: 0 },
        pointsIssued: { type: Number, default: 0 },
        pointsRedeemed: { type: Number, default: 0 },
        newEnrollments: { type: Number, default: 0 }
    },

    referrals: {
        totalReferrals: { type: Number, default: 0 },
        completedReferrals: { type: Number, default: 0 },
        totalRewardsIssued: { type: Number, default: 0 }
    },

    overview: {
        totalPromoRevenue: { type: Number, default: 0 },
        totalDiscountsGiven: { type: Number, default: 0 },
        ordersWithPromos: { type: Number, default: 0 },
        averageOrderValue: { type: Number, default: 0 },
        conversionRate: { type: Number, default: 0 },
        returnOnInvestment: { type: Number, default: 0 }
    }
}, { timestamps: true });

promoAnalyticsSchema.index({ date: -1 });
promoAnalyticsSchema.index({ date: 1 }, { unique: true });

module.exports = mongoose.model('PromoAnalytics', promoAnalyticsSchema);
