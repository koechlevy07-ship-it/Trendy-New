const express = require('express');
const router = express.Router();
const Review = require('../models/Review');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Notification = require('../models/Notification');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================================
// PUBLIC / CUSTOMER ROUTES
// ============================================================

// GET /api/reviews/top – public endpoint for testimonials
router.get('/top', async (req, res) => {
    try {
        const limit = Math.min(10, Math.max(1, parseInt(req.query.limit) || 3));
        const reviews = await Review.find({ status: 'approved', rating: { $gte: 4 } })
            .populate('user', 'name')
            .populate('product', 'name slug images')
            .sort({ rating: -1, helpful: -1 })
            .limit(limit)
            .lean();
        res.json({ success: true, data: reviews });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// GET /api/reviews/product/:productId – approved reviews for a product
router.get('/product/:productId', async (req, res) => {
    try {
        const { page = 1, limit = 20, sort = 'newest', verified } = req.query;
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(50, Math.max(1, parseInt(limit)));

        let sortOption = { createdAt: -1 };
        if (sort === 'helpful') sortOption = { helpful: -1 };
        else if (sort === 'highest') sortOption = { rating: -1 };
        else if (sort === 'lowest') sortOption = { rating: 1 };
        else if (sort === 'oldest') sortOption = { createdAt: 1 };

        const filter = { product: req.params.productId, status: 'approved' };
        if (verified === 'true') filter.verifiedPurchase = true;

        const [reviews, total, stats] = await Promise.all([
            Review.find(filter)
                .populate('user', 'name')
                .sort(sortOption)
                .skip((pageNum - 1) * limitNum)
                .limit(limitNum)
                .lean(),
            Review.countDocuments(filter),
            Review.aggregate([
                { $match: { product: require('mongoose').Types.ObjectId.createFromHexString(req.params.productId), status: 'approved' } },
                { $group: {
                    _id: null,
                    avgRating: { $avg: '$rating' },
                    totalReviews: { $sum: 1 },
                    fiveStar: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } },
                    fourStar: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
                    threeStar: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
                    twoStar: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
                    oneStar: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } }
                }}
            ])
        ]);

        res.json({
            success: true,
            data: reviews,
            stats: stats[0] || { avgRating: 0, totalReviews: 0, fiveStar: 0, fourStar: 0, threeStar: 0, twoStar: 0, oneStar: 0 },
            pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// POST /api/reviews – create review (authenticated, verified purchase check)
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { productId, rating, comment, title, images, videos, orderId, recommended, reviewAttributes } = req.body;
        if (!productId || !rating) {
            return res.status(400).json({ success: false, message: 'Product ID and rating required' });
        }
        if (!comment || comment.trim().length < 10) {
            return res.status(400).json({ success: false, message: 'Review must be at least 10 characters' });
        }

        const product = await Product.findById(productId);
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

        // Check if user already reviewed this product
        const existing = await Review.findOne({ product: productId, user: req.user._id });
        if (existing) {
            return res.status(400).json({ success: false, message: 'You have already reviewed this product' });
        }

        // Verify purchase if orderId provided
        let verifiedPurchase = false;
        if (orderId) {
            const order = await Order.findOne({ _id: orderId, user: req.user._id, status: { $in: ['delivered', 'shipped', 'out-for-delivery'] } });
            if (order) {
                const hasProduct = order.items.some(item => item.productId.toString() === productId);
                if (hasProduct) verifiedPurchase = true;
            }
        }

        const review = new Review({
            product: productId,
            user: req.user._id,
            order: orderId || null,
            rating: parseInt(rating),
            comment: comment.trim(),
            title: title?.trim() || '',
            images: images || [],
            videos: videos || [],
            verifiedPurchase,
            recommended: recommended || false,
            reviewAttributes: reviewAttributes || new Map()
        });
        await review.save();
        await review.populate('user', 'name');

        res.status(201).json({ success: true, data: review });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// PUT /api/reviews/:id/helpful – mark review as helpful
router.put('/:id/helpful', authenticateToken, async (req, res) => {
    try {
        const review = await Review.findById(req.params.id);
        if (!review) return res.status(404).json({ success: false, message: 'Review not found' });
        if (review.user && review.user.toString() === req.user.id) {
            return res.status(400).json({ success: false, message: 'Cannot mark your own review as helpful' });
        }
        if (!review.helpfulBy) review.helpfulBy = [];
        if (review.helpfulBy.includes(req.user.id)) {
            return res.status(400).json({ success: false, message: 'Already marked as helpful' });
        }
        review.helpfulBy.push(req.user.id);
        review.helpful = (review.helpful || 0) + 1;
        await review.save();
        res.json({ success: true, data: { helpful: review.helpful } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// POST /api/reviews/:id/report – report a review
router.post('/:id/report', authenticateToken, async (req, res) => {
    try {
        const { reason, details } = req.body;
        if (!reason) return res.status(400).json({ success: false, message: 'Reason is required' });
        const review = await Review.findById(req.params.id);
        if (!review) return res.status(404).json({ success: false, message: 'Review not found' });
        if (review.user && review.user.toString() === req.user.id) {
            return res.status(400).json({ success: false, message: 'Cannot report your own review' });
        }
        review.reports.push({ userId: req.user._id, reason, details: details || '' });
        await review.save();
        res.json({ success: true, message: 'Review reported successfully' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// GET /api/reviews/my – customer's own reviews
router.get('/my', authenticateToken, async (req, res) => {
    try {
        const reviews = await Review.find({ user: req.user._id })
            .populate('product', 'name slug images price')
            .sort({ createdAt: -1 })
            .lean();
        res.json({ success: true, data: reviews });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ============================================================
// ADMIN ROUTES
// ============================================================

// GET /api/reviews/admin/stats – review statistics
router.get('/admin/stats', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [total, pending, approved, hidden, rejected, reported, avgRating] = await Promise.all([
            Review.countDocuments(),
            Review.countDocuments({ status: 'pending' }),
            Review.countDocuments({ status: 'approved' }),
            Review.countDocuments({ status: 'hidden' }),
            Review.countDocuments({ status: 'rejected' }),
            Review.countDocuments({ status: 'reported' }),
            Review.aggregate([
                { $match: { status: 'approved' } },
                { $group: { _id: null, avg: { $avg: '$rating' } } }
            ])
        ]);
        res.json({
            success: true,
            data: {
                total, pending, approved, hidden, rejected, reported,
                avgRating: avgRating[0]?.avg ? Math.round(avgRating[0].avg * 10) / 10 : 0
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// GET /api/reviews/admin/analytics – detailed analytics
router.get('/admin/analytics', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [byRating, byMonth, byCategory, topProducts, recentActivity] = await Promise.all([
            Review.aggregate([
                { $match: { status: 'approved' } },
                { $group: { _id: '$rating', count: { $sum: 1 } } },
                { $sort: { _id: -1 } }
            ]),
            Review.aggregate([
                { $match: { status: 'approved', createdAt: { $gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) } } },
                { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }, count: { $sum: 1 }, avgRating: { $avg: '$rating' } } },
                { $sort: { _id: 1 } }
            ]),
            Review.aggregate([
                { $match: { status: 'approved' } },
                { $lookup: { from: 'products', localField: 'product', foreignField: '_id', as: 'product' } },
                { $unwind: '$product' },
                { $group: { _id: '$product.category', count: { $sum: 1 }, avgRating: { $avg: '$rating' } } },
                { $sort: { count: -1 } }
            ]),
            Review.aggregate([
                { $match: { status: 'approved' } },
                { $group: { _id: '$product', count: { $sum: 1 }, avgRating: { $avg: '$rating' } } },
                { $sort: { count: -1 } },
                { $limit: 10 },
                { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
                { $unwind: '$product' },
                { $project: { _id: 1, count: 1, avgRating: 1, 'product.name': 1, 'product.slug': 1, 'product.images': 1 } }
            ]),
            Review.find({ status: { $in: ['pending', 'reported'] } })
                .populate('product', 'name')
                .populate('user', 'name')
                .sort({ createdAt: -1 })
                .limit(20)
                .lean()
        ]);

        res.json({
            success: true,
            data: {
                ratingDistribution: byRating,
                monthlyTrend: byMonth,
                categoryStats: byCategory,
                topReviewedProducts: topProducts,
                recentPending: recentActivity
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// GET /api/reviews/admin/all – all reviews with filters
router.get('/admin/all', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { status, rating, search, product, user, verified, featured, page = 1, limit = 50, sort } = req.query;
        const filter = {};
        if (status) filter.status = status;
        if (rating) filter.rating = parseInt(rating);
        if (verified === 'true') filter.verifiedPurchase = true;
        if (featured === 'true') filter.featured = true;

        if (search) {
            const safe = escapeRegex(search);
            filter.$or = [
                { title: { $regex: safe, $options: 'i' } },
                { comment: { $regex: safe, $options: 'i' } }
            ];
        }
        if (product) filter.product = product;
        if (user) filter.user = user;

        let sortOption = { createdAt: -1 };
        if (sort === 'rating') sortOption = { rating: -1, createdAt: -1 };
        else if (sort === 'helpful') sortOption = { helpful: -1 };
        else if (sort === 'oldest') sortOption = { createdAt: 1 };

        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

        const [reviews, total] = await Promise.all([
            Review.find(filter)
                .populate('product', 'name slug images price')
                .populate('user', 'name email')
                .sort(sortOption)
                .skip((pageNum - 1) * limitNum)
                .limit(limitNum)
                .lean(),
            Review.countDocuments(filter)
        ]);

        res.json({
            success: true,
            data: reviews,
            pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// GET /api/reviews/admin/export – CSV export
router.get('/admin/export', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { status, rating, dateFrom, dateTo } = req.query;
        const filter = {};
        if (status) filter.status = status;
        if (rating) filter.rating = parseInt(rating);
        if (dateFrom || dateTo) {
            filter.createdAt = {};
            if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
            if (dateTo) {
                const end = new Date(dateTo);
                end.setHours(23, 59, 59, 999);
                filter.createdAt.$lte = end;
            }
        }

        const reviews = await Review.find(filter)
            .populate('product', 'name')
            .populate('user', 'name email')
            .sort({ createdAt: -1 })
            .lean();

        const header = 'ID,Product,Customer,Email,Rating,Title,Comment,Verified Purchase,Status,Featured,Helpful,Reports,Created At,Updated At';
        const rows = reviews.map(r => {
            const created = r.createdAt ? new Date(r.createdAt).toISOString() : '';
            const updated = r.updatedAt ? new Date(r.updatedAt).toISOString() : '';
            const comment = (r.comment || '').replace(/"/g, '""');
            const title = (r.title || '').replace(/"/g, '""');
            return `"${r._id}","${r.product?.name || ''}","${r.user?.name || ''}","${r.user?.email || ''}","${r.rating}","${title}","${comment}","${r.verifiedPurchase ? 'Yes' : 'No'}","${r.status}","${r.featured ? 'Yes' : 'No'}","${r.helpful || 0}","${r.reportCount || 0}","${created}","${updated}"`;
        }).join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=reviews-export.csv');
        res.send(header + '\n' + rows);
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// POST /api/reviews/admin/bulk – bulk actions
router.post('/admin/bulk', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { ids, action, value } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, message: 'No IDs provided' });
        }
        const validActions = ['approve', 'reject', 'hide', 'delete', 'feature', 'unfeature'];
        if (!validActions.includes(action)) {
            return res.status(400).json({ success: false, message: 'Invalid action' });
        }

        let result;
        switch (action) {
            case 'approve':
                result = await Review.updateMany({ _id: { $in: ids } }, { status: 'approved' });
                break;
            case 'reject':
                result = await Review.updateMany({ _id: { $in: ids } }, { status: 'rejected' });
                break;
            case 'hide':
                result = await Review.updateMany({ _id: { $in: ids } }, { status: 'hidden' });
                break;
            case 'delete':
                result = await Review.deleteMany({ _id: { $in: ids } });
                break;
            case 'feature':
                result = await Review.updateMany({ _id: { $in: ids } }, { featured: true });
                break;
            case 'unfeature':
                result = await Review.updateMany({ _id: { $in: ids } }, { featured: false });
                break;
        }

        // Update product ratings if status changed to approved
        if (['approve', 'reject', 'hide', 'delete'].includes(action)) {
            const affectedReviews = await Review.find({ _id: { $in: ids } }).select('product status').lean();
            const productIds = [...new Set(affectedReviews.map(r => r.product.toString()))];
            for (const pid of productIds) {
                const stats = await Review.aggregate([
                    { $match: { product: require('mongoose').Types.ObjectId.createFromHexString(pid), status: 'approved' } },
                    { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } }
                ]);
                if (stats[0]) {
                    await Product.findByIdAndUpdate(pid, {
                        rating: Math.round(stats[0].avg * 10) / 10,
                        totalReviews: stats[0].count
                    });
                } else {
                    await Product.findByIdAndUpdate(pid, { rating: 0, totalReviews: 0 });
                }
            }
        }

        res.json({ success: true, message: `Bulk ${action} applied`, modified: result.modifiedCount || result.deletedCount });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// GET /api/reviews/:id – single review detail (admin)
router.get('/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const review = await Review.findById(req.params.id)
            .populate('product', 'name slug images price category')
            .populate('user', 'name email customerId')
            .populate('order', 'orderNumber')
            .populate('adminReply.adminId', 'name')
            .lean();
        if (!review) return res.status(404).json({ success: false, message: 'Review not found' });
        res.json({ success: true, data: review });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// PUT /api/reviews/:id/status – update review status (admin)
router.put('/:id/status', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { status } = req.body;
        const validStatuses = ['pending', 'approved', 'hidden', 'rejected', 'reported'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }
        const review = await Review.findByIdAndUpdate(req.params.id, { status }, { new: true });
        if (!review) return res.status(404).json({ success: false, message: 'Review not found' });

        // Update product rating
        const stats = await Review.aggregate([
            { $match: { product: review.product, status: 'approved' } },
            { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } }
        ]);
        if (stats[0]) {
            await Product.findByIdAndUpdate(review.product, {
                rating: Math.round(stats[0].avg * 10) / 10,
                totalReviews: stats[0].count
            });
        } else {
            await Product.findByIdAndUpdate(review.product, { rating: 0, totalReviews: 0 });
        }

        res.json({ success: true, data: review });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// PUT /api/reviews/:id/featured – toggle featured
router.put('/:id/featured', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { featured } = req.body;
        const review = await Review.findByIdAndUpdate(req.params.id, { featured: !!featured }, { new: true });
        if (!review) return res.status(404).json({ success: false, message: 'Review not found' });
        res.json({ success: true, data: review });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// POST /api/reviews/:id/reply – admin reply
router.post('/:id/reply', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { text } = req.body;
        if (!text || !text.trim()) {
            return res.status(400).json({ success: false, message: 'Reply text is required' });
        }
        const review = await Review.findById(req.params.id);
        if (!review) return res.status(404).json({ success: false, message: 'Review not found' });

        review.adminReply = {
            text: text.trim(),
            adminId: req.user._id,
            adminName: req.user.name || 'Admin'
        };
        await review.save();

        // Notify customer
        if (review.user) {
            await Notification.create({
                userId: review.user,
                type: 'review',
                title: 'Admin replied to your review',
                message: `Admin replied to your review for ${review.product ? (await Product.findById(review.product).select('name')).name : 'a product'}: ${text.trim().substring(0, 100)}`,
                data: { reviewId: review._id, productId: review.product }
            });
        }

        res.json({ success: true, message: 'Reply sent', data: review });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// DELETE /api/reviews/:id – delete review (admin)
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const review = await Review.findByIdAndDelete(req.params.id);
        if (!review) return res.status(404).json({ success: false, message: 'Review not found' });

        // Update product rating
        const stats = await Review.aggregate([
            { $match: { product: review.product, status: 'approved' } },
            { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } }
        ]);
        if (stats[0]) {
            await Product.findByIdAndUpdate(review.product, {
                rating: Math.round(stats[0].avg * 10) / 10,
                totalReviews: stats[0].count
            });
        } else {
            await Product.findByIdAndUpdate(review.product, { rating: 0, totalReviews: 0 });
        }

        res.json({ success: true, message: 'Review deleted' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// PUT /api/reviews/:id – generic update (admin)
router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const allowed = ['title', 'comment', 'rating', 'status', 'verifiedPurchase', 'recommended', 'featured', 'reviewAttributes'];
        const updates = {};
        for (const key of allowed) {
            if (req.body[key] !== undefined) updates[key] = req.body[key];
        }
        const review = await Review.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
        if (!review) return res.status(404).json({ success: false, message: 'Review not found' });
        res.json({ success: true, data: review });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// GET /api/reviews/statistics – overall statistics
router.get('/statistics', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [totalProducts, reviewedProducts, avgRating, totalReviews, ratingDist] = await Promise.all([
            Product.countDocuments({ status: 'published' }),
            Product.countDocuments({ status: 'published', totalReviews: { $gt: 0 } }),
            Review.aggregate([{ $match: { status: 'approved' } }, { $group: { _id: null, avg: { $avg: '$rating' } } }]),
            Review.countDocuments({ status: 'approved' }),
            Review.aggregate([
                { $match: { status: 'approved' } },
                { $group: { _id: '$rating', count: { $sum: 1 } } },
                { $sort: { _id: -1 } }
            ])
        ]);
        res.json({
            success: true,
            data: {
                totalProducts,
                reviewedProducts,
                avgRating: avgRating[0]?.avg ? Math.round(avgRating[0].avg * 10) / 10 : 0,
                totalReviews,
                ratingDistribution: ratingDist
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

module.exports = router;