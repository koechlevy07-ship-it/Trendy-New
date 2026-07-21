const express = require('express');
const router = express.Router();
const RecentlyViewed = require('../models/RecentlyViewed');
const { authenticateToken } = require('../middleware/auth');

// GET /api/recently-viewed – get recently viewed products
router.get('/', authenticateToken, async (req, res) => {
    try {
        const limit = Math.min(20, parseInt(req.query.limit) || 12);
        let rv = await RecentlyViewed.findOne({ user: req.user._id })
            .populate({ path: 'products.product', select: 'name slug price originalPrice images rating brand category gender stock inStock flashSale flashSalePrice' });

        if (!rv) return res.json({ success: true, data: [] });

        // Return most recent first, filtered to existing products
        const items = rv.products
            .filter(p => p.product)
            .sort((a, b) => new Date(b.viewedAt) - new Date(a.viewedAt))
            .slice(0, limit)
            .map(p => ({ ...p.product.toObject(), viewedAt: p.viewedAt }));

        res.json({ success: true, data: items });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// POST /api/recently-viewed – add product to recently viewed
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { productId } = req.body;
        if (!productId) return res.status(400).json({ success: false, message: 'Product ID required' });

        let rv = await RecentlyViewed.findOne({ user: req.user._id });
        if (!rv) {
            rv = new RecentlyViewed({ user: req.user._id, products: [] });
        }

        // Remove existing entry for this product (to move it to front)
        rv.products = rv.products.filter(p => p.product.toString() !== productId);

        // Add to front
        rv.products.unshift({ product: productId, viewedAt: new Date() });

        // Keep max 50 entries
        if (rv.products.length > 50) {
            rv.products = rv.products.slice(0, 50);
        }

        await rv.save();
        res.json({ success: true, message: 'Added to recently viewed' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// DELETE /api/recently-viewed – clear recently viewed
router.delete('/', authenticateToken, async (req, res) => {
    try {
        await RecentlyViewed.findOneAndDelete({ user: req.user._id });
        res.json({ success: true, message: 'Recently viewed cleared' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

module.exports = router;
