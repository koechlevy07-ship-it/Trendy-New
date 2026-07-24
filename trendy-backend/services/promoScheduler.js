const Coupon = require('../models/Coupon');
const Promotion = require('../models/Promotion');
const FlashSale = require('../models/FlashSale');
const PromoBanner = require('../models/PromoBanner');
const GiftCard = require('../models/GiftCard');
const AbandonedCart = require('../models/AbandonedCart');

async function sendAbandonedCartEmails() {
    try {
        const carts = await AbandonedCart.findNeedingRecoveryEmail().limit(50);
        let sent = 0;
        for (const cart of carts) {
            try {
                const { sendCheckoutAbandoned } = require('./emailService');
                await sendCheckoutAbandoned(cart);
                cart.recovery = cart.recovery || {};
                cart.recovery.emailsSent = (cart.recovery.emailsSent || 0) + 1;
                cart.recovery.lastEmailSentAt = new Date();
                if (cart.status === 'active') cart.status = 'recovering';
                await cart.save();
                sent++;
            } catch (e) { /* skip individual */ }
        }
        return sent;
    } catch (e) { return 0; }
}

async function cleanupExpiredCarts() {
    try {
        return await AbandonedCart.cleanupExpired(30);
    } catch (e) { return null; }
}

async function runPromoScheduler() {
    const now = new Date();
    const results = { coupons: 0, promotions: 0, flashSales: 0, banners: 0, giftCards: 0 };

    try {
        const couponResult = await Coupon.updateMany(
            { status: 'active', endDate: { $lt: now } },
            { $set: { status: 'expired' } }
        );
        results.coupons = couponResult.modifiedCount || 0;

        const couponScheduled = await Coupon.updateMany(
            { status: 'draft', startDate: { $lte: now }, endDate: { $gt: now }, usageLimit: { $gt: 0 }, $expr: { $lt: ['$timesUsed', '$usageLimit'] } },
            { $set: { status: 'active' } }
        );
        results.coupons += couponScheduled.modifiedCount || 0;
    } catch (e) { /* ignore */ }

    try {
        const promoExpired = await Promotion.updateMany(
            { status: 'active', endDate: { $lt: now } },
            { $set: { status: 'expired' } }
        );
        results.promotions = promoExpired.modifiedCount || 0;

        const promoScheduled = await Promotion.updateMany(
            { status: 'draft', startDate: { $lte: now }, endDate: { $gt: now } },
            { $set: { status: 'active' } }
        );
        results.promotions += promoScheduled.modifiedCount || 0;
    } catch (e) { /* ignore */ }

    try {
        const flashExpired = await FlashSale.updateMany(
            { status: 'active', endDate: { $lt: now } },
            { $set: { status: 'ended' } }
        );
        results.flashSales = flashExpired.modifiedCount || 0;

        const flashScheduled = await FlashSale.updateMany(
            { status: 'scheduled', startDate: { $lte: now }, endDate: { $gt: now } },
            { $set: { status: 'active' } }
        );
        results.flashSales += flashScheduled.modifiedCount || 0;
    } catch (e) { /* ignore */ }

    try {
        const bannerExpired = await PromoBanner.updateMany(
            { 'scheduling.enabled': true, 'scheduling.endDate': { $lt: now }, status: { $in: ['active', 'scheduled'] } },
            { $set: { status: 'expired' } }
        );
        results.banners = bannerExpired.modifiedCount || 0;

        const bannerScheduled = await PromoBanner.updateMany(
            { 'scheduling.enabled': true, 'scheduling.startDate': { $lte: now }, 'scheduling.endDate': { $gt: now }, status: 'scheduled' },
            { $set: { status: 'active' } }
        );
        results.banners += bannerScheduled.modifiedCount || 0;
    } catch (e) { /* ignore */ }

    try {
        const gcExpired = await GiftCard.updateMany(
            { status: { $in: ['active', 'partially_redeemed'] }, endDate: { $lt: now } },
            { $set: { status: 'expired' } }
        );
        results.giftCards = gcExpired.modifiedCount || 0;
    } catch (e) { /* ignore */ }

    let abandonedSent = 0;
    try { abandonedSent = await sendAbandonedCartEmails(); } catch (e) { /* ignore */ }
    try { await cleanupExpiredCarts(); } catch (e) { /* ignore */ }

    return results;
}

let schedulerInterval = null;

function startScheduler(intervalMs) {
    const interval = intervalMs || 5 * 60 * 1000;
    if (schedulerInterval) clearInterval(schedulerInterval);
    runPromoScheduler().catch(() => {});
    schedulerInterval = setInterval(() => {
        runPromoScheduler().catch(() => {});
    }, interval);
    console.log(`Promo scheduler started (every ${interval / 1000}s)`);
}

function stopScheduler() {
    if (schedulerInterval) {
        clearInterval(schedulerInterval);
        schedulerInterval = null;
        console.log('Promo scheduler stopped');
    }
}

module.exports = { runPromoScheduler, startScheduler, stopScheduler };
