const express = require('express');
const router = express.Router();
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const FlashSale = require('../models/FlashSale');
const GiftCard = require('../models/GiftCard');
const PromoBanner = require('../models/PromoBanner');
const CouponUsage = require('../models/CouponUsage');
const PromoAnalytics = require('../models/PromoAnalytics');
const Coupon = require('../models/Coupon');
const Promotion = require('../models/Promotion');

// ============================================================
// FLASH SALES
// ============================================================
router.get('/flash-sales/stats', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const now = new Date();
        const [total, active, scheduled, ended, draft] = await Promise.all([
            FlashSale.countDocuments(),
            FlashSale.countDocuments({ status: 'active', startDate: { $lte: now }, endDate: { $gte: now } }),
            FlashSale.countDocuments({ status: 'scheduled' }),
            FlashSale.countDocuments({ status: 'ended' }),
            FlashSale.countDocuments({ status: 'draft' })
        ]);
        const totalRevenue = await FlashSale.aggregate([{ $group: { _id: null, total: { $sum: '$totalRevenue' } } }]);
        const bestFlash = await FlashSale.findOne({ status: 'active', totalSold: { $gt: 0 } }).sort({ totalSold: -1 }).select('name totalSold totalRevenue').lean();
        res.json({ success: true, data: { total, active, scheduled, ended, draft, totalRevenue: totalRevenue[0]?.total || 0, bestFlash } });
    } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

router.get('/flash-sales', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { status, search, page = 1, limit = 50 } = req.query;
        const filter = {};
        if (status && status !== 'all') filter.status = status;
        if (search) filter.name = { $regex: search, $options: 'i' };
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [sales, total] = await Promise.all([
            FlashSale.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).populate('createdBy', 'name').lean(),
            FlashSale.countDocuments(filter)
        ]);
        res.json({ success: true, data: sales, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
    } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

router.get('/flash-sales/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const sale = await FlashSale.findById(req.params.id).populate('products.product', 'name images price').populate('createdBy', 'name');
        if (!sale) return res.status(404).json({ success: false, message: 'Flash sale not found' });
        res.json({ success: true, data: sale });
    } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

router.post('/flash-sales', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const sale = new FlashSale({ ...req.body, createdBy: req.user._id });
        await sale.save();
        await sale.populate('createdBy', 'name');
        res.status(201).json({ success: true, data: sale });
    } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

router.put('/flash-sales/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const sale = await FlashSale.findByIdAndUpdate(req.params.id, { ...req.body, updatedBy: req.user._id }, { new: true, runValidators: true });
        if (!sale) return res.status(404).json({ success: false, message: 'Flash sale not found' });
        res.json({ success: true, data: sale });
    } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

router.delete('/flash-sales/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        await FlashSale.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Flash sale deleted' });
    } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

router.post('/flash-sales/:id/toggle', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const sale = await FlashSale.findById(req.params.id);
        if (!sale) return res.status(404).json({ success: false, message: 'Flash sale not found' });
        sale.status = sale.status === 'active' ? 'paused' : sale.status === 'paused' ? 'active' : sale.status === 'draft' ? 'active' : 'active';
        await sale.save();
        res.json({ success: true, data: sale });
    } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

// ============================================================
// GIFT CARDS
// ============================================================
router.get('/gift-cards/stats', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [total, active, exhausted, expired, totalValue, redeemedValue] = await Promise.all([
            GiftCard.countDocuments(),
            GiftCard.countDocuments({ status: { $in: ['active', 'partially_redeemed'] } }),
            GiftCard.countDocuments({ status: 'exhausted' }),
            GiftCard.countDocuments({ status: 'expired' }),
            GiftCard.aggregate([{ $group: { _id: null, total: { $sum: '$originalValue' } } }]),
            GiftCard.aggregate([{ $group: { _id: null, total: { $sum: { $subtract: ['$originalValue', '$currentBalance'] } } } }])
        ]);
        res.json({ success: true, data: { total, active, exhausted, expired, totalValue: totalValue[0]?.total || 0, redeemedValue: redeemedValue[0]?.total || 0 } });
    } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

router.get('/gift-cards', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { status, search, page = 1, limit = 50 } = req.query;
        const filter = {};
        if (status && status !== 'all') filter.status = status;
        if (search) filter.$or = [{ code: { $regex: search, $options: 'i' } }, { recipient: { $regex: search, $options: 'i' } }, { recipientEmail: { $regex: search, $options: 'i' } }];
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [cards, total] = await Promise.all([
            GiftCard.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).populate('customer', 'name email').lean(),
            GiftCard.countDocuments(filter)
        ]);
        res.json({ success: true, data: cards, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
    } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

router.get('/gift-cards/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const card = await GiftCard.findById(req.params.id).populate('customer', 'name email').populate('redemptions.order', 'orderNumber total');
        if (!card) return res.status(404).json({ success: false, message: 'Gift card not found' });
        res.json({ success: true, data: card });
    } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

router.post('/gift-cards', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const code = req.body.code || 'GIFT' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase();
        const existing = await GiftCard.findOne({ code });
        if (existing) return res.status(400).json({ success: false, message: 'Gift card code already exists' });
        const card = new GiftCard({ ...req.body, code, currentBalance: req.body.originalValue || req.body.value || 0 });
        await card.save();
        res.status(201).json({ success: true, data: card });
    } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

router.put('/gift-cards/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const card = await GiftCard.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!card) return res.status(404).json({ success: false, message: 'Gift card not found' });
        res.json({ success: true, data: card });
    } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

router.delete('/gift-cards/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        await GiftCard.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Gift card deleted' });
    } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

router.post('/gift-cards/:id/send-email', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const card = await GiftCard.findById(req.params.id);
        if (!card) return res.status(404).json({ success: false, message: 'Gift card not found' });
        card.emailSent = true;
        card.emailSentAt = new Date();
        await card.save();
        res.json({ success: true, message: 'Gift card email sent' });
    } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

// ============================================================
// PROMOTIONAL BANNERS
// ============================================================
router.get('/banners/stats', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [total, active, scheduled, expired] = await Promise.all([
            PromoBanner.countDocuments(),
            PromoBanner.countDocuments({ status: 'active' }),
            PromoBanner.countDocuments({ status: 'scheduled' }),
            PromoBanner.countDocuments({ status: 'expired' })
        ]);
        const totalViews = await PromoBanner.aggregate([{ $group: { _id: null, total: { $sum: '$tracking.views' } } }]);
        res.json({ success: true, data: { total, active, scheduled, expired, totalViews: totalViews[0]?.total || 0 } });
    } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

router.get('/banners', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { location, status, search, page = 1, limit = 50 } = req.query;
        const filter = {};
        if (location && location !== 'all') filter.location = location;
        if (status && status !== 'all') filter.status = status;
        if (search) filter.name = { $regex: search, $options: 'i' };
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [banners, total] = await Promise.all([
            PromoBanner.find(filter).sort({ displayOrder: 1, createdAt: -1 }).skip(skip).limit(parseInt(limit)).lean(),
            PromoBanner.countDocuments(filter)
        ]);
        res.json({ success: true, data: banners, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
    } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

router.get('/banners/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const banner = await PromoBanner.findById(req.params.id);
        if (!banner) return res.status(404).json({ success: false, message: 'Banner not found' });
        res.json({ success: true, data: banner });
    } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

router.post('/banners', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const banner = new PromoBanner({ ...req.body, createdBy: req.user._id });
        await banner.save();
        res.status(201).json({ success: true, data: banner });
    } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

router.put('/banners/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const banner = await PromoBanner.findByIdAndUpdate(req.params.id, { ...req.body, updatedBy: req.user._id }, { new: true, runValidators: true });
        if (!banner) return res.status(404).json({ success: false, message: 'Banner not found' });
        res.json({ success: true, data: banner });
    } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

router.put('/banners/:id/toggle', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const banner = await PromoBanner.findById(req.params.id);
        if (!banner) return res.status(404).json({ success: false, message: 'Banner not found' });
        banner.status = banner.status === 'active' ? 'paused' : banner.status === 'paused' ? 'active' : 'active';
        await banner.save();
        res.json({ success: true, data: banner });
    } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

router.delete('/banners/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        await PromoBanner.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Banner deleted' });
    } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

router.post('/banners/reorder', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { orders } = req.body;
        if (!Array.isArray(orders)) return res.status(400).json({ success: false, message: 'Orders array required' });
        for (const item of orders) {
            await PromoBanner.findByIdAndUpdate(item.id, { displayOrder: item.order });
        }
        res.json({ success: true, message: 'Banners reordered' });
    } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

// ============================================================
// COUPON USAGE
// ============================================================
router.get('/usage', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { coupon, code, customer, page = 1, limit = 50, days = 30 } = req.query;
        const filter = {};
        if (coupon) filter.coupon = coupon;
        if (code) filter.code = { $regex: code, $options: 'i' };
        if (customer) filter.customer = customer;
        if (days) filter.usedAt = { $gte: new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000) };
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [usage, total] = await Promise.all([
            CouponUsage.find(filter).sort({ usedAt: -1 }).skip(skip).limit(parseInt(limit)).populate('customer', 'name email').populate('order', 'orderNumber total').lean(),
            CouponUsage.countDocuments(filter)
        ]);
        res.json({ success: true, data: usage, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
    } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

// ============================================================
// PROMO ANALYTICS
// ============================================================
router.get('/analytics/dashboard', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const [couponStats, promoStats, flashStats, usageTrends, topCoupons, topCategories, dailyRedemptions] = await Promise.all([
            Coupon.aggregate([
                { $match: { createdAt: { $gte: startDate } } },
                { $group: { _id: null, totalCoupons: { $sum: 1 }, activeCoupons: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } }, totalRedemptions: { $sum: '$timesUsed' }, totalRevenue: { $sum: '$revenueGenerated' }, avgDiscount: { $avg: '$discountValue' } } }
            ]),
            Promotion.aggregate([
                { $match: { createdAt: { $gte: startDate } } },
                { $group: { _id: null, totalPromos: { $sum: 1 }, activePromos: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } }, totalTriggers: { $sum: '$timesTriggered' }, totalDiscount: { $sum: '$totalDiscountGiven' } } }
            ]),
            FlashSale.aggregate([
                { $match: { createdAt: { $gte: startDate } } },
                { $group: { _id: null, totalSales: { $sum: 1 }, activeSales: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } }, totalSold: { $sum: '$totalSold' }, totalRev: { $sum: '$totalRevenue' } } }
            ]),
            CouponUsage.aggregate([
                { $match: { usedAt: { $gte: startDate } } },
                { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$usedAt' } }, count: { $sum: 1 }, discount: { $sum: '$discountAmount' } } },
                { $sort: { _id: 1 } }
            ]),
            CouponUsage.aggregate([
                { $match: { usedAt: { $gte: startDate } } },
                { $group: { _id: '$code', count: { $sum: 1 }, discount: { $sum: '$discountAmount' } } },
                { $sort: { count: -1 } },
                { $limit: 10 }
            ]),
            CouponUsage.aggregate([
                { $match: { usedAt: { $gte: startDate } } },
                { $group: { _id: '$usageType', count: { $sum: 1 }, discount: { $sum: '$discountAmount' } } }
            ]),
            PromoAnalytics.find({ date: { $gte: startDate } }).sort({ date: 1 }).lean()
        ]);
        res.json({ success: true, data: {
            coupons: couponStats[0] || { totalCoupons: 0, activeCoupons: 0, totalRedemptions: 0, totalRevenue: 0, avgDiscount: 0 },
            promotions: promoStats[0] || { totalPromos: 0, activePromos: 0, totalTriggers: 0, totalDiscount: 0 },
            flashSales: flashStats[0] || { totalSales: 0, activeSales: 0, totalSold: 0, totalRev: 0 },
            usageTrends, topCoupons, topCategories, dailyRedemptions
        } });
    } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

router.get('/analytics/export', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { days = 30, type = 'coupon' } = req.query;
        const startDate = new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000);
        let data, header;
        if (type === 'coupon') {
            data = await CouponUsage.find({ usedAt: { $gte: startDate } }).sort({ usedAt: -1 }).lean();
            header = 'Code,Customer Email,Discount Amount,Order Subtotal,Order Total,Usage Type,Used At';
        } else if (type === 'flash') {
            data = await FlashSale.find({ createdAt: { $gte: startDate } }).sort({ createdAt: -1 }).lean();
            header = 'Name,Status,Total Sold,Total Revenue,Start Date,End Date';
        } else if (type === 'banner') {
            data = await PromoBanner.find({ createdAt: { $gte: startDate } }).sort({ createdAt: -1 }).lean();
            header = 'Name,Location,Status,Views,Clicks,Conversions';
        } else {
            return res.status(400).json({ success: false, message: 'Invalid type' });
        }
        const csv = [header];
        data.forEach(d => {
            if (type === 'coupon') csv.push(`"${d.code}","${d.customerEmail || ''}",${d.discountAmount},${d.orderSubtotal},${d.orderTotal},"${d.usageType}","${d.usedAt}"`);
            else if (type === 'flash') csv.push(`"${d.name}","${d.status}",${d.totalSold},${d.totalRevenue},"${d.startDate}","${d.endDate}"`);
            else csv.push(`"${d.name}","${d.location}","${d.status}",${d.tracking?.views||0},${d.tracking?.clicks||0},${d.tracking?.conversions||0}`);
        });
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=promo-${type}-analytics.csv`);
        res.send(csv.join('\n'));
    } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

// ============================================================
// PUBLIC CUSTOMER ENDPOINTS
// ============================================================

const { authenticateToken } = require('../middleware/auth');

// GET /api/promo/flash-sales/active – active flash sales for storefront
router.get('/flash-sales/active/public', async (req, res) => {
    try {
        const now = new Date();
        const sales = await FlashSale.find({
            status: 'active',
            startDate: { $lte: now },
            endDate: { $gte: now }
        }).select('name description bannerImage products startDate endDate displaySettings').sort({ priority: -1 }).lean();
        res.json({ success: true, data: sales });
    } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

// POST /api/promo/gift-cards/validate – validate & apply gift card
router.post('/gift-cards/validate', authenticateToken, async (req, res) => {
    try {
        const { code, amount } = req.body;
        if (!code) return res.status(400).json({ success: false, message: 'Code required' });
        const card = await GiftCard.findOne({ code: code.toUpperCase().trim() });
        if (!card) return res.status(404).json({ success: false, message: 'Invalid gift card' });
        if (card.status !== 'active' && card.status !== 'partially_redeemed') {
            return res.status(400).json({ success: false, message: 'Gift card is not usable' });
        }
        if (card.endDate && card.endDate < new Date()) {
            return res.status(400).json({ success: false, message: 'Gift card has expired' });
        }
        const applyAmount = Math.min(amount || card.currentBalance, card.currentBalance);
        res.json({ success: true, data: { code: card.code, balance: card.currentBalance, applyAmount } });
    } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

// GET /api/promo/banners/public – get visible banners for storefront
router.get('/banners/public', async (req, res) => {
    try {
        const { location } = req.query;
        const now = new Date();
        const filter = { status: 'active' };
        if (location) filter.location = location;
        const banners = await PromoBanner.find(filter).sort({ displayOrder: 1 }).lean();
        const visible = banners.filter(b => {
            if (!b.scheduling?.enabled) return true;
            if (b.scheduling.startDate && b.scheduling.startDate > now) return false;
            if (b.scheduling.endDate && b.scheduling.endDate < now) return false;
            return true;
        });
        res.json({ success: true, data: visible });
    } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

// POST /api/promo/banners/:id/track – track banner view/click
router.post('/banners/:id/track', async (req, res) => {
    try {
        const { event } = req.body;
        const update = {};
        if (event === 'view') update['tracking.views'] = 1;
        else if (event === 'click') { update['tracking.clicks'] = 1; update['tracking.conversionRate'] = 1; }
        else if (event === 'conversion') update['tracking.conversions'] = 1;
        await PromoBanner.findByIdAndUpdate(req.params.id, { $inc: update });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

// POST /api/promo/coupon-usage/track – record coupon usage
router.post('/coupon-usage/track', authenticateToken, async (req, res) => {
    try {
        const { couponId, code, orderId, orderNumber, subtotal, total, discountAmount, discountType, items } = req.body;
        const usage = new CouponUsage({
            coupon: couponId,
            code: code,
            customer: req.user._id,
            customerEmail: req.user.email,
            customerName: req.user.name,
            order: orderId,
            orderNumber,
            orderSubtotal: subtotal || 0,
            orderTotal: total || 0,
            discountAmount: discountAmount || 0,
            discountType: discountType || 'percentage',
            items: items || [],
            usageType: 'checkout'
        });
        await usage.save();

        if (couponId) {
            await Coupon.findByIdAndUpdate(couponId, {
                $inc: { timesUsed: 1, revenueGenerated: total || 0, totalDiscountGiven: discountAmount || 0 },
                $push: { usedBy: { customer: req.user._id, count: 1, lastUsed: new Date() } }
            });
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

module.exports = router;