const express = require('express');
const router = express.Router();
const Coupon = require('../models/Coupon');
const Promotion = require('../models/Promotion');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Order = require('../models/Order');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================================
// COUPON ROUTES
// ============================================================

// POST /api/coupons/validate – validate coupon for cart (customer)
router.post('/validate', authenticateToken, async (req, res) => {
    try {
        const { code, subtotal, items, customerId } = req.body;
        if (!code) return res.status(400).json({ success: false, message: 'Coupon code required' });
        
        const coupon = await Coupon.findOne({ code: code.toUpperCase().trim() });
        if (!coupon) return res.status(404).json({ success: false, message: 'Invalid coupon code' });
        
        // Build cart object for validation
        const cart = {
            subtotal: subtotal || 0,
            items: items || [],
            shipping: 500
        };
        
        // Get customer for eligibility checks
        const customer = customerId ? await User.findById(customerId).select('isNewCustomer loyaltyTier lastLogin') : null;
        
        const validation = coupon.isValid(cart, customer);
        if (!validation.valid) {
            return res.status(400).json({ success: false, message: validation.message });
        }
        
        const discount = coupon.calculateDiscount(cart);
        
        // Update daily usage
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        let dailyUsage = coupon.dailyUsage.find(u => u.date.toDateString() === today.toDateString());
        if (!dailyUsage) {
            coupon.dailyUsage.push({ date: today, count: 0 });
            dailyUsage = coupon.dailyUsage[coupon.dailyUsage.length - 1];
        }
        dailyUsage.count += 1;
        await coupon.save();
        
        res.json({
            success: true,
            data: {
                code: coupon.code,
                discount,
                discountType: coupon.discountType,
                discountValue: coupon.discountValue,
                minCartValue: coupon.minCartValue,
                maxDiscount: coupon.maxDiscount,
                description: coupon.description,
                valid: true
            }
        });
    } catch (err) {
        console.error('Coupon validate error:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// POST /api/coupons/apply – apply coupon to cart (customer)
router.post('/apply', authenticateToken, async (req, res) => {
    try {
        const { code, cartId } = req.body;
        if (!code) return res.status(400).json({ success: false, message: 'Coupon code required' });
        
        // This endpoint would integrate with cart
        // For now return validation result
        const coupon = await Coupon.findOne({ code: code.toUpperCase().trim() });
        if (!coupon) return res.status(404).json({ success: false, message: 'Invalid coupon code' });
        
        const validation = coupon.isValid({ subtotal: 0, items: [] }, req.user);
        if (!validation.valid) {
            return res.status(400).json({ success: false, message: validation.message });
        }
        
        res.json({ success: true, message: 'Coupon applied', data: { code: coupon.code } });
    } catch (err) {
        console.error('Coupon apply error:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ============================================================
// ADMIN COUPON ROUTES
// ============================================================

// GET /api/coupons/admin/stats – coupon statistics
router.get('/admin/stats', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        
        const [
            total, active, scheduled, paused, expired, draft,
            usedToday, usedThisMonth, totalDiscountGiven,
            avgDiscount, bestCoupon, failedAttempts
        ] = await Promise.all([
            Coupon.countDocuments(),
            Coupon.countDocuments({ status: 'active' }),
            Coupon.countDocuments({ status: 'scheduled' }),
            Coupon.countDocuments({ status: 'paused' }),
            Coupon.countDocuments({ status: 'expired' }),
            Coupon.countDocuments({ status: 'draft' }),
            Coupon.aggregate([
                { $match: { 'dailyUsage.date': { $gte: todayStart } } },
                { $unwind: '$dailyUsage' },
                { $match: { 'dailyUsage.date': { $gte: todayStart } } },
                { $group: { _id: null, total: { $sum: '$dailyUsage.count' } } }
            ]),
            Coupon.aggregate([
                { $match: { 'dailyUsage.date': { $gte: monthStart } } },
                { $unwind: '$dailyUsage' },
                { $match: { 'dailyUsage.date': { $gte: monthStart } } },
                { $group: { _id: null, total: { $sum: '$dailyUsage.count' } } }
            ]),
            Coupon.aggregate([
                { $group: { _id: null, total: { $sum: '$totalDiscountGiven' } } }
            ]),
            Coupon.aggregate([
                { $match: { timesUsed: { $gt: 0 } } },
                { $group: { _id: null, avg: { $avg: '$discountValue' } } }
            ]),
            Coupon.findOne({ timesUsed: { $gt: 0 } }).sort({ timesUsed: -1 }).select('code discountValue timesUsed'),
            Coupon.aggregate([
                { $group: { _id: null, total: { $sum: '$failedAttempts' } } }
            ])
        ]);
        
        res.json({
            success: true,
            data: {
                total, active, scheduled, paused, expired, draft,
                usedToday: usedToday[0]?.total || 0,
                usedThisMonth: usedThisMonth[0]?.total || 0,
                totalDiscountGiven: totalDiscountGiven[0]?.total || 0,
                avgDiscount: avgDiscount[0]?.avg ? Math.round(avgDiscount[0].avg * 100) / 100 : 0,
                bestCoupon: bestCoupon || null,
                failedAttempts: failedAttempts[0]?.total || 0
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// GET /api/coupons/admin/analytics – detailed analytics
router.get('/admin/analytics', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [byType, byMonth, topCoupons, customerUsage, conversionData] = await Promise.all([
            Coupon.aggregate([
                { $group: { _id: '$discountType', count: { $sum: 1 }, used: { $sum: '$timesUsed' }, revenue: { $sum: '$totalDiscountGiven' } } },
                { $sort: { count: -1 } }
            ]),
            Coupon.aggregate([
                { $match: { createdAt: { $gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) } } },
                { $unwind: '$dailyUsage' },
                { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$dailyUsage.date' } }, count: { $sum: '$dailyUsage.count' }, discount: { $sum: { $multiply: ['$dailyUsage.count', '$discountValue'] } } } },
                { $sort: { _id: 1 } }
            ]),
            Coupon.find({ timesUsed: { $gt: 0 } }).sort({ timesUsed: -1 }).limit(10).select('code discountType discountValue timesUsed totalDiscountGiven status'),
            Coupon.aggregate([
                { $unwind: '$usedBy' },
                { $group: { _id: '$usedBy.customer', count: { $sum: '$usedBy.count' }, discount: { $sum: { $multiply: ['$usedBy.count', '$discountValue'] } } } },
                { $sort: { count: -1 } },
                { $limit: 20 },
                { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'customer' } },
                { $unwind: '$customer' },
                { $project: { _id: 1, count: 1, discount: 1, 'customer.name': 1, 'customer.email': 1 } }
            ]),
            Coupon.aggregate([
                { $group: { _id: null, totalCreated: { $sum: 1 }, totalUsed: { $sum: '$timesUsed' } } }
            ])
        ]);
        
        const conversionRate = conversionData[0] ? (conversionData[0].totalUsed / conversionData[0].totalCreated * 100) : 0;
        
        res.json({
            success: true,
            data: {
                byType,
                byMonth,
                topCoupons,
                customerUsage,
                conversionRate: Math.round(conversionRate * 100) / 100
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// GET /api/coupons/admin – list with filters, search, pagination
router.get('/admin', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { status, discountType, search, page = 1, limit = 50, sort } = req.query;
        const filter = {};
        
        if (status && status !== 'all') filter.status = status;
        if (discountType && discountType !== 'all') filter.discountType = discountType;
        if (search) {
            const safe = escapeRegex(search);
            filter.$or = [
                { code: { $regex: safe, $options: 'i' } },
                { name: { $regex: safe, $options: 'i' } },
                { description: { $regex: safe, $options: 'i' } }
            ];
        }
        
        let sortObj = { createdAt: -1 };
        if (sort === 'usage') sortObj = { timesUsed: -1 };
        else if (sort === 'revenue') sortObj = { totalDiscountGiven: -1 };
        else if (sort === 'expiry') sortObj = { endDate: 1 };
        else if (sort === 'alpha') sortObj = { code: 1 };
        
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [coupons, total] = await Promise.all([
            Coupon.find(filter).sort(sortObj).skip(skip).limit(parseInt(limit)).populate('createdBy', 'name'),
            Coupon.countDocuments(filter)
        ]);
        
        res.json({
            success: true,
            data: coupons,
            total,
            page: parseInt(page),
            pages: Math.ceil(total / parseInt(limit))
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// GET /api/coupons/admin/export – CSV export
router.get('/admin/export', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { status, discountType, dateFrom, dateTo } = req.query;
        const filter = {};
        if (status && status !== 'all') filter.status = status;
        if (discountType && discountType !== 'all') filter.discountType = discountType;
        if (dateFrom || dateTo) {
            filter.createdAt = {};
            if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
            if (dateTo) {
                const end = new Date(dateTo);
                end.setHours(23, 59, 59, 999);
                filter.createdAt.$lte = end;
            }
        }
        
        const coupons = await Coupon.find(filter).sort({ createdAt: -1 }).populate('createdBy', 'name').lean();
        
        const header = 'Code,Name,Discount Type,Discount Value,Min Cart Value,Max Discount,Usage Limit,Per Customer Limit,One Time Use,Times Used,Total Discount Given,Start Date,End Date,Status,Created By,Created At';
        const rows = coupons.map(c => {
            const start = c.startDate ? new Date(c.startDate).toISOString() : '';
            const end = c.endDate ? new Date(c.endDate).toISOString() : '';
            const created = c.createdAt ? new Date(c.createdAt).toISOString() : '';
            return `"${c.code}","${c.name || ''}","${c.discountType}","${c.discountValue}","${c.minCartValue || 0}","${c.maxDiscount || 0}","${c.usageLimit || 0}","${c.usageLimitPerCustomer || 0}","${c.oneTimeUse ? 'Yes' : 'No'}","${c.timesUsed || 0}","${c.totalDiscountGiven || 0}","${start}","${end}","${c.status}","${c.createdBy?.name || ''}","${created}"`;
        }).join('\n');
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=coupons-export.csv');
        res.send(header + '\n' + rows);
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// POST /api/coupons/admin/bulk – bulk operations
router.post('/admin/bulk', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { ids, action, value } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, message: 'No IDs provided' });
        }
        const validActions = ['activate', 'pause', 'expire', 'delete', 'duplicate', 'set-status'];
        if (!validActions.includes(action)) {
            return res.status(400).json({ success: false, message: 'Invalid action' });
        }
        
        let result;
        switch (action) {
            case 'activate':
                result = await Coupon.updateMany({ _id: { $in: ids } }, { status: 'active' });
                break;
            case 'pause':
                result = await Coupon.updateMany({ _id: { $in: ids } }, { status: 'paused' });
                break;
            case 'expire':
                result = await Coupon.updateMany({ _id: { $in: ids } }, { status: 'expired' });
                break;
            case 'delete':
                result = await Coupon.deleteMany({ _id: { $in: ids } });
                break;
            case 'duplicate':
                const coupons = await Coupon.find({ _id: { $in: ids } }).lean();
                const duplicates = coupons.map(c => {
                    const { _id, code, timesUsed, totalDiscountGiven, usedBy, dailyUsage, createdAt, updatedAt, ...rest } = c;
                    return { ...rest, code: `${c.code}-COPY-${Date.now()}`, status: 'draft', timesUsed: 0, totalDiscountGiven: 0, usedBy: [], dailyUsage: [] };
                });
                result = await Coupon.insertMany(duplicates);
                break;
            case 'set-status':
                if (!value || !['active', 'paused', 'expired', 'draft'].includes(value)) {
                    return res.status(400).json({ success: false, message: 'Invalid status value' });
                }
                result = await Coupon.updateMany({ _id: { $in: ids } }, { status: value });
                break;
        }
        
        res.json({ success: true, message: `Bulk ${action} applied`, modified: result.modifiedCount || result.deletedCount || result.length });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// GET /api/coupons/:id – single coupon (admin)
router.get('/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const coupon = await Coupon.findById(req.params.id).populate('createdBy', 'name email').populate('eligibleProducts', 'name sku').populate('eligibleCategories', 'name').populate('excludedProducts', 'name').populate('excludedCategories', 'name').populate('eligibleCustomers', 'name email');
        if (!coupon) return res.status(404).json({ success: false, message: 'Coupon not found' });
        res.json({ success: true, data: coupon });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// POST /api/coupons – create coupon (admin)
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const coupon = new Coupon({
            ...req.body,
            createdBy: req.user._id
        });
        
        // Generate unique code if not provided
        if (!coupon.code) {
            const timestamp = Date.now().toString(36).toUpperCase();
            const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
            coupon.code = `COUPON-${timestamp}${rand}`;
        } else {
            coupon.code = coupon.code.toUpperCase().trim();
        }
        
        // Check for duplicate code
        const existing = await Coupon.findOne({ code: coupon.code });
        if (existing) {
            return res.status(400).json({ success: false, message: 'Coupon code already exists' });
        }
        
        await coupon.save();
        await coupon.populate('createdBy', 'name');
        res.status(201).json({ success: true, message: 'Coupon created', data: coupon });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ success: false, message: 'Coupon code already exists' });
        }
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// PUT /api/coupons/:id – update coupon (admin)
router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const allowed = [
            'name', 'description', 'code', 'discountType', 'discountValue',
            'minCartValue', 'maxDiscount', 'minQuantity', 'usageLimit',
            'usageLimitPerCustomer', 'oneTimeUse', 'usageLimitDaily',
            'startDate', 'endDate', 'status', 'customerEligibility',
            'eligibleProducts', 'excludedProducts', 'eligibleCategories',
            'excludedCategories', 'eligibleCustomers', 'maxDiscount'
        ];
        
        const updates = {};
        for (const key of allowed) {
            if (req.body[key] !== undefined) updates[key] = req.body[key];
        }
        
        if (updates.code) updates.code = updates.code.toUpperCase().trim();
        
        // Check for duplicate code
        if (updates.code) {
            const existing = await Coupon.findOne({ code: updates.code, _id: { $ne: req.params.id } });
            if (existing) return res.status(400).json({ success: false, message: 'Coupon code already exists' });
        }
        
        const coupon = await Coupon.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true })
            .populate('createdBy', 'name')
            .populate('eligibleProducts', 'name sku')
            .populate('eligibleCategories', 'name');
        
        if (!coupon) return res.status(404).json({ success: false, message: 'Coupon not found' });
        
        res.json({ success: true, message: 'Coupon updated', data: coupon });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ success: false, message: 'Coupon code already exists' });
        }
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// POST /api/coupons/:id/duplicate – duplicate coupon
router.post('/:id/duplicate', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const coupon = await Coupon.findById(req.params.id).lean();
        if (!coupon) return res.status(404).json({ success: false, message: 'Coupon not found' });
        
        const { _id, code, timesUsed, totalDiscountGiven, usedBy, dailyUsage, createdAt, updatedAt, ...rest } = coupon;
        const newCoupon = new Coupon({
            ...rest,
            code: `${coupon.code}-COPY-${Date.now().toString(36).toUpperCase()}`,
            status: 'draft',
            timesUsed: 0,
            totalDiscountGiven: 0,
            usedBy: [],
            dailyUsage: []
        });
        
        await newCoupon.save();
        res.status(201).json({ success: true, message: 'Coupon duplicated', data: newCoupon });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// DELETE /api/coupons/:id – delete coupon
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const coupon = await Coupon.findByIdAndDelete(req.params.id);
        if (!coupon) return res.status(404).json({ success: false, message: 'Coupon not found' });
        res.json({ success: true, message: 'Coupon deleted' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ============================================================
// PROMOTION ROUTES
// ============================================================

// GET /api/promotions/admin/stats – promotion statistics
router.get('/promotions/admin/stats', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const now = new Date();
        const [total, active, scheduled, paused, expired, draft, totalRevenue, activeCount] = await Promise.all([
            Promotion.countDocuments(),
            Promotion.countDocuments({ status: 'active' }),
            Promotion.countDocuments({ status: 'scheduled' }),
            Promotion.countDocuments({ status: 'paused' }),
            Promotion.countDocuments({ status: 'expired' }),
            Promotion.countDocuments({ status: 'draft' }),
            Promotion.aggregate([{ $group: { _id: null, total: { $sum: '$totalDiscountGiven' } } }]),
            Promotion.countDocuments({ status: 'active', startDate: { $lte: new Date() }, endDate: { $gte: new Date() } })
        ]);
        
        res.json({
            success: true,
            data: {
                total,
                active: activeCount,
                scheduled,
                paused,
                expired,
                draft,
                totalRevenue: totalRevenue[0]?.total || 0
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// GET /api/promotions/admin/analytics – promotion analytics
router.get('/promotions/admin/analytics', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [byType, byMonth, topPromotions, productImpact] = await Promise.all([
            Promotion.aggregate([
                { $group: { _id: '$type', count: { $sum: 1 }, triggered: { $sum: '$timesTriggered' }, revenue: { $sum: '$totalDiscountGiven' } } },
                { $sort: { count: -1 } }
            ]),
            Promotion.aggregate([
                { $match: { createdAt: { $gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) } } },
                { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }, count: { $sum: 1 }, triggered: { $sum: '$timesTriggered' } } },
                { $sort: { _id: 1 } }
            ]),
            Promotion.find({ timesTriggered: { $gt: 0 } }).sort({ timesTriggered: -1 }).limit(10).select('name type discountValue timesTriggered totalDiscountGiven status'),
            Promotion.aggregate([
                { $match: { timesTriggered: { $gt: 0 } } },
                { $unwind: '$rules' },
                { $unwind: '$rules.products' },
                { $group: { _id: '$rules.products', triggers: { $sum: 1 }, discount: { $sum: '$totalDiscountGiven' } } },
                { $sort: { triggers: -1 } },
                { $limit: 20 },
                { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
                { $unwind: '$product' },
                { $project: { _id: 1, triggers: 1, discount: 1, 'product.name': 1, 'product.slug': 1 } }
            ])
        ]);
        
        res.json({
            success: true,
            data: { byType, byMonth, topPromotions, productImpact }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// GET /api/promotions/admin – list promotions
router.get('/promotions/admin', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { status, type, search, page = 1, limit = 50, sort } = req.query;
        const filter = {};
        if (status && status !== 'all') filter.status = status;
        if (type && type !== 'all') filter.type = type;
        if (search) {
            const safe = escapeRegex(search);
            filter.$or = [
                { name: { $regex: safe, $options: 'i' } },
                { description: { $regex: safe, $options: 'i' } },
                { couponCode: { $regex: safe, $options: 'i' } }
            ];
        }
        
        let sortObj = { createdAt: -1 };
        if (sort === 'priority') sortObj = { priority: -1, createdAt: -1 };
        else if (sort === 'triggered') sortObj = { timesTriggered: -1 };
        else if (sort === 'revenue') sortObj = { totalDiscountGiven: -1 };
        
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [promotions, total] = await Promise.all([
            Promotion.find(filter).sort(sortObj).skip(skip).limit(parseInt(limit)).populate('createdBy', 'name'),
            Promotion.countDocuments(filter)
        ]);
        
        res.json({
            success: true,
            data: promotions,
            total,
            page: parseInt(page),
            pages: Math.ceil(total / parseInt(limit))
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// GET /api/promotions/admin/export – CSV export
router.get('/promotions/admin/export', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { status, type, dateFrom, dateTo } = req.query;
        const filter = {};
        if (status && status !== 'all') filter.status = status;
        if (type && type !== 'all') filter.type = type;
        if (dateFrom || dateTo) {
            filter.createdAt = {};
            if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
            if (dateTo) {
                const end = new Date(dateTo);
                end.setHours(23, 59, 59, 999);
                filter.createdAt.$lte = end;
            }
        }
        
        const promotions = await Promotion.find(filter).sort({ createdAt: -1 }).populate('createdBy', 'name').lean();
        
        const header = 'Name,Type,Status,Priority,Start Date,End Date,Coupon Code,Times Triggered,Total Discount,Created By,Created At';
        const rows = promotions.map(p => {
            const start = p.startDate ? new Date(p.startDate).toISOString() : '';
            const end = p.endDate ? new Date(p.endDate).toISOString() : '';
            const created = p.createdAt ? new Date(p.createdAt).toISOString() : '';
            return `"${p.name}","${p.type}","${p.status}","${p.priority}","${start}","${end}","${p.couponCode || ''}","${p.timesTriggered || 0}","${p.totalDiscountGiven || 0}","${p.createdBy?.name || ''}","${created}"`;
        }).join('\n');
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=promotions-export.csv');
        res.send(header + '\n' + rows);
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// POST /api/promotions/admin/bulk – bulk actions
router.post('/promotions/admin/bulk', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { ids, action } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, message: 'No IDs provided' });
        }
        const validActions = ['activate', 'pause', 'expire', 'delete', 'duplicate'];
        if (!['activate', 'pause', 'expire', 'delete', 'duplicate'].includes(action)) {
            return res.status(400).json({ success: false, message: 'Invalid action' });
        }
        
        let result;
        switch (action) {
            case 'activate':
                result = await Promotion.updateMany({ _id: { $in: ids } }, { status: 'active' });
                break;
            case 'pause':
                result = await Promotion.updateMany({ _id: { $in: ids } }, { status: 'paused' });
                break;
            case 'expire':
                result = await Promotion.updateMany({ _id: { $in: ids } }, { status: 'expired' });
                break;
            case 'delete':
                result = await Promotion.deleteMany({ _id: { $in: ids } });
                break;
            case 'duplicate':
                const promos = await Promotion.find({ _id: { $in: ids } }).lean();
                const duplicates = promos.map(p => {
                    const { _id, timesTriggered, totalDiscountGiven, createdAt, updatedAt, ...rest } = p;
                    return { ...rest, name: `${p.name} (Copy)`, status: 'draft', timesTriggered: 0, totalDiscountGiven: 0 };
                });
                result = await Promotion.insertMany(duplicates);
                break;
        }
        
        res.json({ success: true, message: `Bulk ${action} applied`, modified: result.modifiedCount || result.deletedCount || result.length });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// GET /api/promotions/:id – single promotion
router.get('/promotions/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const promotion = await Promotion.findById(req.params.id).populate('createdBy', 'name').populate('rules.products', 'name').populate('rules.categories', 'name').populate('createdBy', 'name').populate('updatedBy', 'name');
        if (!promotion) return res.status(404).json({ success: false, message: 'Promotion not found' });
        res.json({ success: true, data: promotion });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// POST /api/promotions – create promotion
router.post('/promotions', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const promotion = new Promotion({
            ...req.body,
            createdBy: req.user._id
        });
        await promotion.save();
        await promotion.populate('createdBy', 'name');
        res.status(201).json({ success: true, message: 'Promotion created', data: promotion });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// PUT /api/promotions/:id – update promotion
router.put('/promotions/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const allowed = [
            'name', 'description', 'type', 'rules', 'maxUsesPerCustomer',
            'maxTotalUses', 'requiresCoupon', 'couponCode', 'startDate',
            'endDate', 'timezone', 'recurring', 'badgeText', 'badgeColor',
            'showCountdown', 'priority', 'stackable', 'exclusive', 'status', 'tags'
        ];
        
        const updates = {};
        for (const key of allowed) {
            if (req.body[key] !== undefined) updates[key] = req.body[key];
        }
        updates.updatedBy = req.user._id;
        
        if (updates.couponCode) updates.couponCode = updates.couponCode.toUpperCase().trim();
        
        const promotion = await Promotion.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true }).populate('createdBy', 'name');
        if (!promotion) return res.status(404).json({ success: false, message: 'Promotion not found' });
        res.json({ success: true, message: 'Promotion updated', data: promotion });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// PUT /api/promotions/:id/toggle – toggle promotion status
router.put('/promotions/:id/toggle', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const promotion = await Promotion.findById(req.params.id);
        if (!promotion) return res.status(404).json({ success: false, message: 'Promotion not found' });
        const statusMap = { active: 'paused', paused: 'active', draft: 'active', scheduled: 'active' };
        promotion.status = statusMap[promotion.status] || 'active';
        promotion.updatedBy = req.user._id;
        await promotion.save();
        res.json({ success: true, message: 'Promotion status toggled', data: promotion });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// DELETE /api/promotions/:id – delete promotion
router.delete('/promotions/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const promotion = await Promotion.findByIdAndDelete(req.params.id);
        if (!promotion) return res.status(404).json({ success: false, message: 'Promotion not found' });
        res.json({ success: true, message: 'Promotion deleted' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ============================================================
// PUBLIC CUSTOMER ROUTES
// ============================================================

// GET /api/coupons/my – customer's available coupons
router.get('/my', authenticateToken, async (req, res) => {
    try {
        const now = new Date();
        const coupons = await Coupon.find({
            status: 'active',
            startDate: { $lte: now },
            endDate: { $gte: now },
            $or: [
                { customerEligibility: 'all' },
                { customerEligibility: 'new', 'eligibleCustomers': { $in: [req.user._id] } },
                { customerEligibility: 'returning', 'eligibleCustomers': { $nin: [req.user._id] } },
                { customerEligibility: 'specific', eligibleCustomers: req.user._id }
            ]
        }).select('code name description discountType discountValue minCartValue maxDiscount').lean();
        
        // Filter out ones user already used (if one-time)
        const available = coupons.filter(c => {
            if (!c.oneTimeUse) return true;
            return !c.usedBy.some(u => u.customer.equals(req.user._id));
        });
        
        res.json({ success: true, data: available });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// GET /api/promotions/active – active promotions for storefront
router.get('/promotions/active', async (req, res) => {
    try {
        const now = new Date();
        const promotions = await Promotion.find({
            status: 'active',
            startDate: { $lte: now },
            endDate: { $gte: now }
        }).sort({ priority: -1, startDate: 1 })
        .select('name type badgeText badgeColor showCountdown startDate endDate rules couponCode');
        
        res.json({ success: true, data: promotions });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// POST /api/promotions/apply – apply automatic promotions to cart
router.post('/promotions/apply', authenticateToken, async (req, res) => {
    try {
        const { cart } = req.body;
        if (!cart || !cart.items) {
            return res.status(400).json({ success: false, message: 'Cart data required' });
        }
        
        const now = new Date();
        const promotions = await Promotion.find({
            status: 'active',
            startDate: { $lte: now },
            endDate: { $gte: now }
        }).sort({ priority: -1 });
        
        const applicable = promotions.filter(p => p.matchesCart(req.body.cart, req.user));
        const discounts = applicable.map(p => ({
            promotionId: p._id,
            name: p.name,
            type: p.type,
            discount: p.calculateDiscount(req.body.cart)
        })).filter(d => d.discount > 0);
        
        // Apply highest priority discount (or stack if allowed)
        let totalDiscount = 0;
        const applied = [];
        
        for (const discount of discounts.sort((a, b) => b.promotionId - a.promotionId)) {
            if (discount.stackable || applied.length === 0) {
                applied.push(discount);
                totalDiscount += discount.discount;
            } else if (!discount.exclusive) {
                // Allow stacking if not exclusive
                totalDiscount += discount.discount;
                applied.push(discount);
            }
        }
        
        res.json({ success: true, data: { discounts: applied, totalDiscount } });
    } catch (err) {
        console.error('Promotion apply error:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

module.exports = router;