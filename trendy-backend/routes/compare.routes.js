const express = require('express');
const router = express.Router();
const Compare = require('../models/Compare');
const Product = require('../models/Product');
const { authenticateToken } = require('../middleware/auth');

// GET /api/compare – get user's comparison list
router.get('/', authenticateToken, async (req, res) => {
    try {
        let compare = await Compare.findOne({ user: req.user._id }).populate('products');
        if (!compare) {
            return res.json({ success: true, data: { products: [] } });
        }
        res.json({ success: true, data: compare });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// POST /api/compare – add product to compare
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { productId } = req.body;
        if (!productId) return res.status(400).json({ success: false, message: 'Product ID required' });

        const product = await Product.findById(productId);
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

        let compare = await Compare.findOne({ user: req.user._id });
        if (!compare) {
            compare = new Compare({ user: req.user._id, products: [] });
        }

        if (compare.products.length >= 4) {
            return res.status(400).json({ success: false, message: 'Maximum 4 products for comparison' });
        }

        if (compare.products.includes(productId)) {
            return res.status(400).json({ success: false, message: 'Product already in comparison' });
        }

        compare.products.push(productId);
        await compare.save();
        await compare.populate('products');

        res.json({ success: true, data: compare });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// DELETE /api/compare/:productId – remove product from compare
router.delete('/:productId', authenticateToken, async (req, res) => {
    try {
        let compare = await Compare.findOne({ user: req.user._id });
        if (!compare) return res.status(404).json({ success: false, message: 'Compare list not found' });

        compare.products = compare.products.filter(id => id.toString() !== req.params.productId);
        await compare.save();
        await compare.populate('products');

        res.json({ success: true, data: compare });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// DELETE /api/compare – clear comparison list
router.delete('/', authenticateToken, async (req, res) => {
    try {
        await Compare.findOneAndDelete({ user: req.user._id });
        res.json({ success: true, message: 'Comparison list cleared' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

module.exports = router;
