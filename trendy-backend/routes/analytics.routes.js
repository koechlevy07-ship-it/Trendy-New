const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const Review = require('../models/Review');
const Coupon = require('../models/Coupon');
const Contact = require('../models/Contact');
const Inventory = require('../models/Inventory');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// GET /api/analytics/dashboard — comprehensive KPI dashboard
router.get('/dashboard', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const thisWeek = new Date(today); thisWeek.setDate(thisWeek.getDate() - thisWeek.getDay());
        const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const thisYear = new Date(today.getFullYear(), 0, 1);

        const [
            totalRevenue, todayRevenue, weekRevenue, monthRevenue, yearRevenue,
            totalOrders, todayOrders, pendingOrders, processingOrders, shippedOrders,
            deliveredOrders, cancelledOrders, returnedOrders, refundRequests,
            totalCustomers, newCustomersToday, activeCustomers, repeatCustomers,
            totalProducts, activeProducts, outOfStock, lowStock,
            inventoryValueResult, inventoryCount,
            avgRating, totalReviews,
            couponUsage, couponsActive, totalNewsletter,
            contactTickets, contactResolved
        ] = await Promise.all([
            Order.aggregate([{ $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } }]),
            Order.aggregate([{ $match: { createdAt: { $gte: today } } }, { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } }]),
            Order.aggregate([{ $match: { createdAt: { $gte: thisWeek } } }, { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } }]),
            Order.aggregate([{ $match: { createdAt: { $gte: thisMonth } } }, { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } }]),
            Order.aggregate([{ $match: { createdAt: { $gte: thisYear } } }, { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } }]),
            Order.countDocuments(),
            Order.countDocuments({ createdAt: { $gte: today } }),
            Order.countDocuments({ status: { $in: ['pending', 'confirmed'] } }),
            Order.countDocuments({ status: 'processing' }),
            Order.countDocuments({ status: 'shipped' }),
            Order.countDocuments({ status: 'delivered' }),
            Order.countDocuments({ status: 'cancelled' }),
            Order.countDocuments({ status: 'returned' }),
            Order.countDocuments({ status: 'refunded' }),
            User.countDocuments({ role: 'customer' }),
            User.countDocuments({ role: 'customer', createdAt: { $gte: today } }),
            User.countDocuments({ role: 'customer', lastLogin: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }),
            Order.aggregate([{ $group: { _id: '$user' } }, { $match: { _id: { $ne: null } } }, { $group: { _id: null, count: { $sum: 1 } } }, { $project: { _id: 0, count: 1 } }]),
            Product.countDocuments(),
            Product.countDocuments({ status: 'published' }),
            Product.countDocuments({ $or: [{ stock: { $lte: 0 }, inStock: false }, { soldOut: true }] }),
            Product.countDocuments({ stock: { $gt: 0, $lte: 5 } }),
            Product.aggregate([{ $match: { stock: { $gte: 0 } } }, { $group: { _id: null, total: { $sum: { $multiply: ['$price', '$stock'] } } } }]),
            Product.countDocuments({}),
            Review.aggregate([{ $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } }]),
            Review.countDocuments(),
            Coupon.aggregate([{ $group: { _id: null, used: { $sum: '$timesUsed' }, revenue: { $sum: '$totalDiscountGiven' }, count: { $sum: 1 } } }]),
            Coupon.countDocuments({ status: 'active' }),
            (async()=>{try{const News=require('../models/Newsletter');return await News.countDocuments();}catch(e){return 0;}})(),
            Contact.countDocuments(),
            Contact.countDocuments({ status: 'resolved' })
        ]);

        const tr = totalRevenue[0] || { total: 0, count: 0 };
        const tod = todayRevenue[0] || { total: 0, count: 0 };
        const wk = weekRevenue[0] || { total: 0, count: 0 };
        const mo = monthRevenue[0] || { total: 0, count: 0 };
        const yr = yearRevenue[0] || { total: 0, count: 0 };
        const avgR = avgRating[0] || { avg: 0, count: 0 };
        const cp = couponUsage[0] || { used: 0, revenue: 0, count: 0 };
        const invVal = inventoryValueResult[0] || { total: 0 };
        const rp = repeatCustomers[0] || { count: 0 };

        res.json({ success: true, data: {
            revenue: {
                today: tod.total, week: wk.total, month: mo.total, year: yr.total,
                total: tr.total, avgOrderValue: tr.count > 0 ? Math.round(tr.total / tr.count) : 0,
                todayOrders: tod.count, monthOrders: mo.count
            },
            orders: {
                total: totalOrders, today: todayOrders,
                pending: pendingOrders, processing: processingOrders,
                shipped: shippedOrders, delivered: deliveredOrders,
                cancelled: cancelledOrders, returned: returnedOrders,
                refundRequests: refundRequests
            },
            customers: {
                total: totalCustomers, newToday: newCustomersToday,
                active: activeCustomers, returning: rp.count || 0
            },
            products: {
                total: totalProducts, active: activeProducts,
                outOfStock, lowStock, inventoryValue: invVal.total
            },
            reviews: {
                total: totalReviews, averageRating: Math.round(avgR.avg * 10) / 10 || 0
            },
            marketing: {
                couponCount: cp.count, couponUsage: cp.used, couponRevenue: cp.revenue,
                subscribers: totalNewsletter || 0
            },
            contact: {
                total: contactTickets, resolved: contactResolved,
                open: contactTickets - contactResolved
            }
        }});
    } catch (err) {
        console.error('Analytics dashboard error:', err);
        res.status(500).json({ success: false, message: 'Failed to load analytics' });
    }
});

// GET /api/analytics/revenue — revenue breakdown with daily/monthly data
router.get('/revenue', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const [daily, monthly, byStatus] = await Promise.all([
            Order.aggregate([
                { $match: { createdAt: { $gte: since } } },
                { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, revenue: { $sum: '$total' }, orders: { $sum: 1 } } },
                { $sort: { _id: 1 } }
            ]),
            Order.aggregate([
                { $match: { createdAt: { $gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) } } },
                { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, revenue: { $sum: '$total' }, orders: { $sum: 1 } } },
                { $sort: { '_id.year': 1, '_id.month': 1 } }
            ]),
            Order.aggregate([
                { $group: { _id: '$status', revenue: { $sum: '$total' }, count: { $sum: 1 } } }
            ])
        ]);
        res.json({ success: true, data: { daily, monthly, byStatus } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed' });
    }
});

// GET /api/analytics/products — product performance
router.get('/products', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const [bestSellers, topRevenue, categoryStats] = await Promise.all([
            Product.find({ status: 'published' }).sort({ totalSold: -1 }).limit(limit).select('name price totalSold stock images category').lean(),
            Product.find({ status: 'published' }).sort({ totalRevenue: -1 }).limit(limit).select('name price totalRevenue stock images category').lean(),
            Product.aggregate([
                { $group: { _id: '$category', count: { $sum: 1 }, avgPrice: { $avg: '$price' }, totalStock: { $sum: '$stock' } } },
                { $sort: { count: -1 } }
            ])
        ]);
        res.json({ success: true, data: { bestSellers, topRevenue, categoryStats } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed' });
    }
});

// GET /api/analytics/customers — customer analytics
router.get('/customers', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 90;
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const [registrationTrend, topCustomers] = await Promise.all([
            User.aggregate([
                { $match: { role: 'customer', createdAt: { $gte: since } } },
                { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
                { $sort: { _id: 1 } }
            ]),
            User.find({ role: 'customer' }).sort({ totalSpent: -1 }).limit(10)
                .select('name email totalSpent orderCount createdAt').lean()
        ]);
        res.json({ success: true, data: { registrationTrend, topCustomers } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed' });
    }
});

// GET /api/analytics/orders — order trends
router.get('/orders', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const [dailyOrders, statusDist] = await Promise.all([
            Order.aggregate([
                { $match: { createdAt: { $gte: since } } },
                { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 }, revenue: { $sum: '$total' } } },
                { $sort: { _id: 1 } }
            ]),
            Order.aggregate([
                { $group: { _id: '$status', count: { $sum: 1 } } }
            ])
        ]);
        res.json({ success: true, data: { dailyOrders, statusDist } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed' });
    }
});

// GET /api/analytics/reviews — review analytics
router.get('/reviews', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [ratingDist, recent, topReviewed] = await Promise.all([
            Review.aggregate([
                { $group: { _id: '$rating', count: { $sum: 1 } } },
                { $sort: { _id: -1 } }
            ]),
            Review.find().sort({ createdAt: -1 }).limit(10).populate('user', 'name').select('rating comment product createdAt').lean(),
            Review.aggregate([
                { $group: { _id: '$product', count: { $sum: 1 }, avgRating: { $avg: '$rating' } } },
                { $sort: { count: -1 } },
                { $limit: 10 },
                { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
                { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
                { $project: { count: 1, avgRating: { $round: ['$avgRating', 1] }, productName: '$product.name' } }
            ])
        ]);
        res.json({ success: true, data: { ratingDist, recent, topReviewed } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed' });
    }
});

// GET /api/analytics/coupons — coupon analytics
router.get('/coupons', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [usage, topCoupons] = await Promise.all([
            Coupon.aggregate([
                { $group: { _id: '$discountType', count: { $sum: 1 }, used: { $sum: '$timesUsed' }, revenue: { $sum: '$totalDiscountGiven' }, failed: { $sum: '$failedAttempts' } } }
            ]),
            Coupon.find().sort({ timesUsed: -1 }).limit(10).select('name code discountType discountValue timesUsed totalDiscountGiven failedAttempts').lean()
        ]);
        res.json({ success: true, data: { usage, topCoupons } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed' });
    }
});

// GET /api/analytics/inventory — inventory analytics
router.get('/inventory', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [stockDist, lowStockItems] = await Promise.all([
            Product.aggregate([
                { $group: { _id: null, totalValue: { $sum: { $multiply: ['$price', '$stock'] } }, totalItems: { $sum: '$stock' }, productCount: { $sum: 1 }, outOfStock: { $sum: { $cond: [{ $or: [{ $lte: ['$stock', 0] }, { $eq: ['$inStock', false] }] }, 1, 0] } }, lowStock: { $sum: { $cond: [{ $and: [{ $gt: ['$stock', 0] }, { $lte: ['$stock', 5] }] }, 1, 0] } } } }
            ]),
            Product.find({ stock: { $gt: 0, $lte: 5 } }).sort({ stock: 1 }).limit(20).select('name sku price stock images category').lean()
        ]);
        res.json({ success: true, data: { summary: stockDist[0] || {}, lowStockItems } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed' });
    }
});

// GET /api/analytics/contact — contact/ support analytics
router.get('/contact', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [total, statusDist, monthly] = await Promise.all([
            Contact.countDocuments(),
            Contact.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
            Contact.aggregate([
                { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }, count: { $sum: 1 } } },
                { $sort: { _id: 1 } },
                { $limit: 12 }
            ])
        ]);
        res.json({ success: true, data: { total, statusDist, monthly } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed' });
    }
});

// POST /api/analytics/reports/export — generate and return CSV data
router.post('/reports/export', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { type, startDate, endDate, filters } = req.body;
        const match = {};
        if (startDate || endDate) {
            match.createdAt = {};
            if (startDate) match.createdAt.$gte = new Date(startDate);
            if (endDate) match.createdAt.$lte = new Date(endDate);
        }

        let data, headers, rows;

        switch (type) {
            case 'sales': {
                const query = Order.find(match).sort({ createdAt: -1 }).lean();
                if (filters?.status) query.where('status').equals(filters.status);
                const orders = await query;
                headers = ['Order #', 'Date', 'Customer', 'Items', 'Total', 'Discount', 'Shipping', 'Status', 'Payment'];
                rows = orders.map(o => [
                    o.orderNumber || o._id.toString().slice(-6),
                    new Date(o.createdAt).toISOString().split('T')[0],
                    o.shippingAddress?.name || 'N/A',
                    (o.items || []).reduce((s, i) => s + (i.quantity || 0), 0),
                    o.total || 0, o.discount || 0, o.shippingCost || 0,
                    o.status, o.paymentMethod || 'N/A'
                ]);
                break;
            }
            case 'products': {
                const products = await Product.find(match).sort({ totalSold: -1 }).lean();
                headers = ['Name', 'SKU', 'Category', 'Price', 'Stock', 'Total Sold', 'Revenue', 'Status'];
                rows = products.map(p => [p.name, p.sku||'', p.category||'', p.price, p.stock, p.totalSold||0, p.totalRevenue||0, p.status]);
                break;
            }
            case 'customers': {
                const users = await User.find({ role: 'customer', ...match }).sort({ totalSpent: -1 }).lean();
                headers = ['Name', 'Email', 'Phone', 'Orders', 'Total Spent', 'Joined'];
                rows = users.map(u => [u.name, u.email, u.phone||'', u.orderCount||0, u.totalSpent||0, new Date(u.createdAt).toISOString().split('T')[0]]);
                break;
            }
            case 'inventory': {
                const inv = await Product.find({}).sort({ stock: 1 }).lean();
                headers = ['Name', 'SKU', 'Stock', 'Price', 'Value', 'Category', 'Status'];
                rows = inv.map(p => [p.name, p.sku||'', p.stock, p.price, (p.price||0)*(p.stock||0), p.category||'', p.status]);
                break;
            }
            default: {
                const orders = await Order.find(match).sort({ createdAt: -1 }).lean();
                headers = ['Order #', 'Date', 'Total', 'Status'];
                rows = orders.map(o => [o.orderNumber || o._id.toString().slice(-6), new Date(o.createdAt).toISOString().split('T')[0], o.total||0, o.status]);
            }
        }

        res.json({ success: true, data: { headers, rows } });
    } catch (err) {
        console.error('Export error:', err);
        res.status(500).json({ success: false, message: 'Export failed' });
    }
});

module.exports = router;
