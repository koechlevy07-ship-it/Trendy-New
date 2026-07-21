const express = require('express');
const router = express.Router();
const Joi = require('joi');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Order = require('../models/Order');
const Review = require('../models/Review');
const Cart = require('../models/Cart');
const Wishlist = require('../models/Wishlist');
const Notification = require('../models/Notification');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

function escapeRegex(str) { return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

const passwordSchema = Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: Joi.string().min(6).max(100).required()
});

// ============================================================
// AUTHENTICATED USER ENDPOINTS (keep existing)
// ============================================================

// GET /api/users/profile – get own profile with stats
router.get('/profile', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        const [orderStats, wishlistCount, reviewCount, notificationCount] = await Promise.all([
            Order.aggregate([
                { $match: { user: user._id } },
                { $group: { _id: null, orderCount: { $sum: 1 }, totalSpent: { $sum: '$total' }, pendingOrders: { $sum: { $cond: [{ $in: ['$status', ['pending', 'confirmed', 'processing']] }, 1, 0] } }, deliveredOrders: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] } } } }
            ]),
            Wishlist.countDocuments({ user: user._id }),
            Review.countDocuments({ user: user._id }),
            Notification.countDocuments({ userId: user._id, read: false })
        ]);

        const stats = orderStats[0] || { orderCount: 0, totalSpent: 0, pendingOrders: 0, deliveredOrders: 0 };

        res.json({
            success: true,
            data: {
                ...user.toObject(),
                stats: {
                    orderCount: stats.orderCount,
                    totalSpent: stats.totalSpent,
                    pendingOrders: stats.pendingOrders,
                    deliveredOrders: stats.deliveredOrders,
                    wishlistCount,
                    reviewCount,
                    unreadNotifications: notificationCount
                }
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch profile' });
    }
});

// PUT /api/users/profile – update own profile
router.put('/profile', authenticateToken, async (req, res) => {
    try {
        const { name, email, phone, profilePhoto, dateOfBirth, gender, address } = req.body;
        const update = {};
        if (name !== undefined) update.name = name;
        if (email !== undefined) update.email = email;
        if (phone !== undefined) update.phone = phone;
        if (profilePhoto !== undefined) update.profilePhoto = profilePhoto;
        if (dateOfBirth !== undefined) update.dateOfBirth = dateOfBirth || null;
        if (gender !== undefined) update.gender = gender;
        if (address !== undefined) update.address = address;

        const user = await User.findByIdAndUpdate(req.user.id, update, { new: true }).select('-password');
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        res.json({ success: true, data: user });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to update profile' });
    }
});

// PUT /api/users/password – change password
router.put('/password', authenticateToken, async (req, res) => {
    try {
        const { error } = passwordSchema.validate(req.body);
        if (error) return res.status(400).json({ success: false, message: error.details[0].message });

        const { currentPassword, newPassword } = req.body;
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) return res.status(400).json({ success: false, message: 'Current password is incorrect' });

        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();

        res.json({ success: true, message: 'Password changed successfully' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to change password' });
    }
});

// DELETE /api/users/account – delete own account (soft delete)
router.delete('/account', authenticateToken, async (req, res) => {
    try {
        const { password } = req.body;
        if (!password) return res.status(400).json({ success: false, message: 'Password is required' });

        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        if (user.role === 'admin') return res.status(400).json({ success: false, message: 'Admin accounts cannot be deleted via this endpoint' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ success: false, message: 'Password is incorrect' });

        user.status = 'deleted';
        user.email = `deleted-${user._id}@trendy-wardrobe.com`;
        await user.save();

        res.json({ success: true, message: 'Account deactivated successfully' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to delete account' });
    }
});

// ============================================================
// NOTIFICATIONS (keep existing)
// ============================================================

router.get('/notifications', authenticateToken, async (req, res) => {
    try {
        const notifications = await Notification.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(50);
        const unreadCount = await Notification.countDocuments({ userId: req.user.id, read: false });
        res.json({ success: true, data: notifications, unreadCount });
    } catch (err) { res.status(500).json({ success: false, message: 'Failed to fetch notifications' }); }
});

router.put('/notifications/:id/read', authenticateToken, async (req, res) => {
    try {
        const notification = await Notification.findOneAndUpdate(
            { _id: req.params.id, userId: req.user.id }, { read: true }, { new: true }
        );
        if (!notification) return res.status(404).json({ success: false, message: 'Notification not found' });
        res.json({ success: true, data: notification });
    } catch (err) { res.status(500).json({ success: false, message: 'Failed to update notification' }); }
});

router.put('/notifications/read-all', authenticateToken, async (req, res) => {
    try {
        await Notification.updateMany({ userId: req.user.id, read: false }, { read: true });
        res.json({ success: true, message: 'All notifications marked as read' });
    } catch (err) { res.status(500).json({ success: false, message: 'Failed to update notifications' }); }
});

router.delete('/notifications/:id', authenticateToken, async (req, res) => {
    try {
        const result = await Notification.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
        if (!result) return res.status(404).json({ success: false, message: 'Notification not found' });
        res.json({ success: true, message: 'Notification deleted' });
    } catch (err) { res.status(500).json({ success: false, message: 'Failed to delete notification' }); }
});

// ============================================================
// NOTIFICATION PREFERENCES (keep existing)
// ============================================================

router.get('/notification-preferences', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('notificationPreferences');
        res.json({ success: true, data: user?.notificationPreferences || {} });
    } catch (err) { res.status(500).json({ success: false, message: 'Failed to fetch preferences' }); }
});

router.put('/notification-preferences', authenticateToken, async (req, res) => {
    try {
        const { orderUpdates, promotions, wishlistStock, priceDrops, newsletter } = req.body;
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        if (orderUpdates !== undefined) user.notificationPreferences.orderUpdates = orderUpdates;
        if (promotions !== undefined) user.notificationPreferences.promotions = promotions;
        if (wishlistStock !== undefined) user.notificationPreferences.wishlistStock = wishlistStock;
        if (priceDrops !== undefined) user.notificationPreferences.priceDrops = priceDrops;
        if (newsletter !== undefined) user.notificationPreferences.newsletter = newsletter;

        await user.save();
        res.json({ success: true, data: user.notificationPreferences });
    } catch (err) { res.status(500).json({ success: false, message: 'Failed to update preferences' }); }
});

// ============================================================
// REVIEWS (keep existing)
// ============================================================

router.get('/reviews', authenticateToken, async (req, res) => {
    try {
        const reviews = await Review.find({ user: req.user.id })
            .populate('product', 'name images price')
            .sort({ createdAt: -1 });
        res.json({ success: true, data: reviews });
    } catch (err) { res.status(500).json({ success: false, message: 'Failed to fetch reviews' }); }
});

// ============================================================
// ADDRESSES (keep existing)
// ============================================================

router.get('/addresses', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('addresses');
        res.json({ success: true, data: user?.addresses || [] });
    } catch (err) { res.status(500).json({ success: false, message: 'Failed to fetch addresses' }); }
});

router.post('/addresses', authenticateToken, async (req, res) => {
    try {
        const { label, fullName, phone, county, city, street, apartment, postalCode, deliveryInstructions, isDefault } = req.body;
        if (!fullName || !city) return res.status(400).json({ success: false, message: 'Full name and city are required' });

        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        if (isDefault) user.addresses.forEach(a => { a.isDefault = false; });

        const isFirst = user.addresses.length === 0;
        user.addresses.push({
            label: label || 'Home', fullName, phone: phone || '', county: county || '',
            city, street: street || '', apartment: apartment || '', postalCode: postalCode || '',
            deliveryInstructions: deliveryInstructions || '', isDefault: isDefault || isFirst
        });

        await user.save();
        res.status(201).json({ success: true, data: user.addresses });
    } catch (err) { res.status(500).json({ success: false, message: 'Failed to add address' }); }
});

router.put('/addresses/:addressId', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        const addr = user.addresses.id(req.params.addressId);
        if (!addr) return res.status(404).json({ success: false, message: 'Address not found' });

        const { label, fullName, phone, county, city, street, apartment, postalCode, deliveryInstructions, isDefault } = req.body;
        if (fullName) addr.fullName = fullName;
        if (label) addr.label = label;
        if (phone !== undefined) addr.phone = phone;
        if (county !== undefined) addr.county = county;
        if (city) addr.city = city;
        if (street !== undefined) addr.street = street;
        if (apartment !== undefined) addr.apartment = apartment;
        if (postalCode !== undefined) addr.postalCode = postalCode;
        if (deliveryInstructions !== undefined) addr.deliveryInstructions = deliveryInstructions;

        if (isDefault) { user.addresses.forEach(a => { a.isDefault = false; }); addr.isDefault = true; }
        await user.save();
        res.json({ success: true, data: user.addresses });
    } catch (err) { res.status(500).json({ success: false, message: 'Failed to update address' }); }
});

router.delete('/addresses/:addressId', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        user.addresses.pull({ _id: req.params.addressId });
        await user.save();
        res.json({ success: true, data: user.addresses });
    } catch (err) { res.status(500).json({ success: false, message: 'Failed to delete address' }); }
});

router.put('/addresses/:addressId/default', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        const addr = user.addresses.id(req.params.addressId);
        if (!addr) return res.status(404).json({ success: false, message: 'Address not found' });
        user.addresses.forEach(a => { a.isDefault = false; });
        addr.isDefault = true;
        await user.save();
        res.json({ success: true, data: user.addresses });
    } catch (err) { res.status(500).json({ success: false, message: 'Failed to set default address' }); }
});

// ============================================================
// ADMIN ENDPOINTS – Static paths before parameterized
// ============================================================

// GET /api/users/admin/statistics – enhanced customer analytics
router.get('/admin/statistics', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);

        const [
            totalCustomers, newToday, activeCount, blockedCount, suspendedCount,
            pendingVerification, verifiedCount, guestCount, returningCount,
            revenueResult, avgOrderResult
        ] = await Promise.all([
            User.countDocuments({ role: 'customer', status: { $ne: 'deleted' } }),
            User.countDocuments({ role: 'customer', createdAt: { $gte: todayStart } }),
            User.countDocuments({ role: 'customer', status: 'active' }),
            User.countDocuments({ role: 'customer', status: 'blocked' }),
            User.countDocuments({ role: 'customer', status: 'suspended' }),
            User.countDocuments({ role: 'customer', status: 'pending_verification' }),
            User.countDocuments({ role: 'customer', emailVerified: true }),
            User.countDocuments({ role: 'customer', isGuest: true }),
            User.countDocuments({ role: 'customer', loginCount: { $gt: 1 } }),
            Order.aggregate([
                { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'u' } },
                { $match: { 'u.role': 'customer', 'u.status': { $ne: 'deleted' } } },
                { $group: { _id: null, total: { $sum: '$total' } } }
            ]),
            Order.aggregate([
                { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'u' } },
                { $match: { 'u.role': 'customer' } },
                { $group: { _id: null, avg: { $avg: '$total' }, count: { $sum: 1 } } }
            ])
        ]);

        const totalRevenue = revenueResult.length > 0 ? revenueResult[0].total : 0;
        const avgOrderValue = avgOrderResult.length > 0 ? Math.round(avgOrderResult[0].avg || 0) : 0;
        const avgLifetimeValue = totalCustomers > 0 ? Math.round(totalRevenue / totalCustomers) : 0;

        // Top spending customers
        const topSpenders = await Order.aggregate([
            { $group: { _id: '$user', totalSpent: { $sum: '$total' }, orderCount: { $sum: 1 } } },
            { $sort: { totalSpent: -1 } },
            { $limit: 10 },
            { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
            { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
            { $project: { name: '$user.name', email: '$user.email', totalSpent: 1, orderCount: 1 } }
        ]);

        // Growth by day (last 30 days)
        const growth = await User.aggregate([
            { $match: { role: 'customer', createdAt: { $gte: thirtyDaysAgo } } },
            { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
            { $sort: { _id: 1 } }
        ]);

        res.json({
            success: true, data: {
                totalCustomers: totalCustomers || 0, newToday: newToday || 0,
                active: activeCount || 0, blocked: blockedCount || 0,
                suspended: suspendedCount || 0, pendingVerification: pendingVerification || 0,
                verified: verifiedCount || 0, guests: guestCount || 0,
                returning: returningCount || 0, totalRevenue, avgOrderValue,
                avgLifetimeValue, topSpenders, growth
            }
        });
    } catch (err) {
        console.error('Customer stats error:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch statistics' });
    }
});

// GET /api/users/admin – customer list with stats (admin)
router.get('/admin', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { search, status, sort, page, limit, startDate, endDate, verified } = req.query;
        const filter = { role: 'customer', status: { $ne: 'deleted' } };
        if (status) filter.status = status;
        if (verified === 'true') filter.emailVerified = true;
        if (verified === 'false') filter.emailVerified = false;
        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) filter.createdAt.$gte = new Date(startDate);
            if (endDate) filter.createdAt.$lte = new Date(endDate);
        }
        if (search) {
            const safeSearch = escapeRegex(search);
            filter.$or = [
                { name: { $regex: safeSearch, $options: 'i' } },
                { email: { $regex: safeSearch, $options: 'i' } },
                { phone: { $regex: safeSearch, $options: 'i' } },
                { customerId: { $regex: safeSearch, $options: 'i' } }
            ];
        }

        let sortOption = { createdAt: -1 };
        if (sort === 'name') sortOption = { name: 1 };
        if (sort === '-name') sortOption = { name: -1 };
        if (sort === 'oldest') sortOption = { createdAt: 1 };
        if (sort === 'lastLogin') sortOption = { lastLogin: -1 };
        if (sort === 'spent') sortOption = { totalSpent: -1 }; // will be overridden after aggregation

        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.min(200, Math.max(1, parseInt(limit) || 50));

        const users = await User.find(filter).select('-password').sort(sortOption).skip((pageNum - 1) * limitNum).limit(limitNum);
        const total = await User.countDocuments(filter);

        const userIds = users.map(u => u._id);
        const [orderStats, reviewCounts, wishlistCounts] = await Promise.all([
            Order.aggregate([
                { $match: { user: { $in: userIds } } },
                { $group: { _id: '$user', orderCount: { $sum: 1 }, totalSpent: { $sum: '$total' }, lastOrder: { $max: '$createdAt' } } }
            ]),
            Review.aggregate([{ $match: { user: { $in: userIds } } }, { $group: { _id: '$user', count: { $sum: 1 } } }]),
            Wishlist.aggregate([{ $match: { user: { $in: userIds } } }, { $group: { _id: '$user', count: { $sum: 1 } } }])
        ]);

        const statsMap = {}, reviewMap = {}, wishlistMap = {};
        orderStats.forEach(s => { statsMap[s._id.toString()] = s; });
        reviewCounts.forEach(s => { reviewMap[s._id.toString()] = s.count; });
        wishlistCounts.forEach(s => { wishlistMap[s._id.toString()] = s.count; });

        const enriched = users.map(u => {
            const st = statsMap[u._id.toString()] || {};
            return {
                ...u.toObject(),
                orderCount: st.orderCount || 0,
                totalSpent: st.totalSpent || 0,
                lastOrder: st.lastOrder || null,
                reviewCount: reviewMap[u._id.toString()] || 0,
                wishlistCount: wishlistMap[u._id.toString()] || 0
            };
        });

        // Sort by spent if requested
        if (sort === 'spent') enriched.sort((a, b) => (b.totalSpent || 0) - (a.totalSpent || 0));

        res.json({ success: true, data: enriched, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } });
    } catch (err) {
        console.error('Admin customer list error:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch customer list' });
    }
});

// GET /api/users – list all users (admin)
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { role, status, page, limit } = req.query;
        const filter = {};
        if (role) filter.role = role;
        if (status) filter.status = status;
        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.min(200, Math.max(1, parseInt(limit) || 50));
        const [users, total] = await Promise.all([
            User.find(filter).select('-password').sort({ createdAt: -1 }).skip((pageNum - 1) * limitNum).limit(limitNum),
            User.countDocuments(filter)
        ]);
        res.json({ success: true, data: users, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } });
    } catch (err) { res.status(500).json({ success: false, message: 'Failed to fetch users' }); }
});

// POST /api/users/admin/bulk – bulk actions
router.post('/admin/bulk', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { userIds, action, value, note } = req.body;
        if (!userIds || !Array.isArray(userIds) || !userIds.length || !action)
            return res.status(400).json({ success: false, message: 'userIds and action required' });

        const results = { updated: 0, errors: [] };
        for (const id of userIds) {
            try {
                const user = await User.findById(id);
                if (!user || user.role === 'admin') { results.errors.push({ id, message: 'Invalid user' }); continue; }

                if (action === 'update-status') {
                    const validStatuses = ['active', 'suspended', 'blocked', 'pending_verification'];
                    if (!value || !validStatuses.includes(value)) { results.errors.push({ id, message: 'Invalid status' }); continue; }
                    user.status = value;
                } else if (action === 'activate') { user.status = 'active'; }
                else if (action === 'suspend') { user.status = 'suspended'; }
                else if (action === 'block') { user.status = 'blocked'; }
                else if (action === 'add-note') { user.notes = note || ''; }
                else if (action === 'verify-email') { user.emailVerified = true; }
                else { results.errors.push({ id, message: `Unknown action: ${action}` }); continue; }

                await user.save();
                results.updated++;
            } catch (err) { results.errors.push({ id, message: err.message }); }
        }
        res.json({ success: true, data: results, message: `${results.updated} updated, ${results.errors.length} errors` });
    } catch (err) { res.status(500).json({ success: false, message: 'Bulk action failed' }); }
});

// POST /api/users/export – export customers
router.post('/export', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { status, search, startDate, endDate, format = 'json' } = req.body;
        const filter = { role: 'customer', status: { $ne: 'deleted' } };
        if (status) filter.status = status;
        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) filter.createdAt.$gte = new Date(startDate);
            if (endDate) filter.createdAt.$lte = new Date(endDate);
        }
        if (search) {
            const s = escapeRegex(search);
            filter.$or = [{ name: { $regex: s, $options: 'i' } }, { email: { $regex: s, $options: 'i' } }];
        }

        const users = await User.find(filter).select('-password').sort({ createdAt: -1 });

        // Get aggregate stats for all users
        const userIds = users.map(u => u._id);
        const orderStats = await Order.aggregate([
            { $match: { user: { $in: userIds } } },
            { $group: { _id: '$user', orderCount: { $sum: 1 }, totalSpent: { $sum: '$total' } } }
        ]);
        const statsMap = {};
        orderStats.forEach(s => { statsMap[s._id.toString()] = s; });

        if (format === 'csv') {
            const headers = 'Name,Email,Phone,Customer ID,Status,Orders,Total Spent,Joined,Last Login,Verified';
            const csv = users.map(u => {
                const st = statsMap[u._id.toString()] || {};
                return `"${u.name}","${u.email}","${u.phone || ''}","${u.customerId || ''}","${u.status || 'active'}",${st.orderCount || 0},${st.totalSpent || 0},"${u.createdAt ? new Date(u.createdAt).toISOString() : ''}","${u.lastLogin ? new Date(u.lastLogin).toISOString() : ''}","${u.emailVerified ? 'Yes' : 'No'}"`;
            }).join('\n');
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=customers-${Date.now()}.csv`);
            return res.send(headers + '\n' + csv);
        }

        const data = users.map(u => {
            const st = statsMap[u._id.toString()] || {};
            return { name: u.name, email: u.email, phone: u.phone || '', customerId: u.customerId || '', status: u.status || 'active', orderCount: st.orderCount || 0, totalSpent: st.totalSpent || 0, joined: u.createdAt, lastLogin: u.lastLogin, verified: u.emailVerified };
        });
        res.json({ success: true, data, total: data.length });
    } catch (err) { res.status(500).json({ success: false, message: 'Export failed' }); }
});

// ============================================================
// PARAMETER-BASED ADMIN ENDPOINTS
// ============================================================

// GET /api/users/:id – single customer with full stats (admin)
router.get('/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-password');
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        const [orders, reviewCount, wishlistCount, cartItems] = await Promise.all([
            Order.find({ user: user._id }).sort({ createdAt: -1 }).limit(10).select('orderNumber total status createdAt items'),
            Review.countDocuments({ user: user._id }),
            Wishlist.countDocuments({ user: user._id }),
            Cart.findOne({ userId: user._id }).select('items')
        ]);

        const totals = await Order.aggregate([
            { $match: { user: user._id } },
            { $group: { _id: null, totalSpent: { $sum: '$total' }, orderCount: { $sum: 1 } } }
        ]);

        res.json({
            success: true,
            data: {
                ...user.toObject(),
                orderCount: totals[0]?.orderCount || 0,
                totalSpent: totals[0]?.totalSpent || 0,
                reviewCount,
                wishlistCount,
                cartItemsCount: (cartItems?.items || []).length,
                recentOrders: orders
            }
        });
    } catch (err) { res.status(500).json({ success: false, message: 'Failed to fetch user details' }); }
});

// GET /api/users/:id/orders – customer orders (admin)
router.get('/:id/orders', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        const [orders, total] = await Promise.all([
            Order.find({ user: req.params.id }).sort({ createdAt: -1 }).skip((pageNum - 1) * limitNum).limit(limitNum),
            Order.countDocuments({ user: req.params.id })
        ]);
        res.json({ success: true, data: orders, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } });
    } catch (err) { res.status(500).json({ success: false, message: 'Failed to fetch orders' }); }
});

// GET /api/users/:id/wishlist – customer wishlist (admin)
router.get('/:id/wishlist', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const wishlist = await Wishlist.findOne({ user: req.params.id }).populate('items.productId', 'name price images sku');
        res.json({ success: true, data: wishlist?.items || [] });
    } catch (err) { res.status(500).json({ success: false, message: 'Failed to fetch wishlist' }); }
});

// GET /api/users/:id/activity – customer activity (admin)
router.get('/:id/activity', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [reviews, cart, wishlistItems, recentOrders] = await Promise.all([
            Review.find({ user: req.params.id }).populate('product', 'name images price').sort({ createdAt: -1 }).limit(10),
            Cart.findOne({ userId: req.params.id }).select('items'),
            Wishlist.findOne({ user: req.params.id }).populate('items.productId', 'name price images').limit(10),
            Order.find({ user: req.params.id }).sort({ createdAt: -1 }).limit(5).select('orderNumber total status createdAt')
        ]);

        res.json({
            success: true, data: {
                reviews: reviews || [],
                cartItems: (cart?.items || []).map(i => ({ productId: i.productId, name: i.name, quantity: i.quantity, price: i.price })),
                wishlist: (wishlistItems?.items || []).slice(0, 10).map(i => ({ productId: i.productId, name: i.name, price: i.price })),
                recentOrders: recentOrders || []
            }
        });
    } catch (err) { res.status(500).json({ success: false, message: 'Failed to fetch activity' }); }
});

// GET /api/users/:id/reviews – customer reviews (admin)
router.get('/:id/reviews', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const reviews = await Review.find({ user: req.params.id }).populate('product', 'name images price').sort({ createdAt: -1 });
        res.json({ success: true, data: reviews });
    } catch (err) { res.status(500).json({ success: false, message: 'Failed to fetch reviews' }); }
});

// PUT /api/users/:id – update customer (admin)
router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const allowed = ['name', 'email', 'phone', 'profilePhoto', 'dateOfBirth', 'gender', 'status', 'notes', 'address', 'addresses'];
        const update = {};
        for (const field of allowed) {
            if (req.body[field] !== undefined) update[field] = req.body[field];
        }
        const user = await User.findByIdAndUpdate(req.params.id, update, { new: true }).select('-password');
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        res.json({ success: true, data: user });
    } catch (err) { res.status(500).json({ success: false, message: 'Failed to update user' }); }
});

// PUT /api/users/:id/status – update user status (admin)
router.put('/:id/status', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { status } = req.body;
        const validStatuses = ['active', 'suspended', 'blocked', 'pending_verification'];
        if (!status || !validStatuses.includes(status))
            return res.status(400).json({ success: false, message: `Invalid status. Valid: ${validStatuses.join(', ')}` });
        const user = await User.findByIdAndUpdate(req.params.id, { status }, { new: true }).select('-password');
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        res.json({ success: true, data: user });
    } catch (err) { res.status(500).json({ success: false, message: 'Failed to update status' }); }
});

// PUT /api/users/:id/approve – approve seller (admin)
router.put('/:id/approve', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(req.params.id, { status: 'active', emailVerified: true }, { new: true }).select('-password');
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        res.json({ success: true, data: user });
    } catch (err) { res.status(500).json({ success: false, message: 'Failed to approve user' }); }
});

// POST /api/users/:id/notify – send notification to customer (admin)
router.post('/:id/notify', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { title, message, type } = req.body;
        if (!title || !message) return res.status(400).json({ success: false, message: 'Title and message required' });

        const notification = new Notification({
            userId: req.params.id, title, message, type: type || 'admin',
            adminName: req.user?.name || req.user?.email || 'Admin'
        });
        await notification.save();
        res.status(201).json({ success: true, data: notification });
    } catch (err) { res.status(500).json({ success: false, message: 'Failed to send notification' }); }
});

// DELETE /api/users/:id – soft delete customer (admin)
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        if (user.role === 'admin') return res.status(400).json({ success: false, message: 'Cannot delete admin accounts' });
        user.status = 'deleted';
        await user.save();
        res.json({ success: true, message: 'Customer deactivated' });
    } catch (err) { res.status(500).json({ success: false, message: 'Failed to deactivate user' }); }
});

module.exports = router;
