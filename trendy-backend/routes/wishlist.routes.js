const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Wishlist = require('../models/Wishlist');
const Product = require('../models/Product');
const Cart = require('../models/Cart');
const { authenticateToken } = require('../middleware/auth');
const crypto = require('crypto');

function isValidObjectId(id) {
    return mongoose.Types.ObjectId.isValid(id);
}

router.get('/', authenticateToken, async (req, res) => {
    try {
        let wishlist = await Wishlist.findOne({ user: req.user.id }).populate('items.productId');
        if (!wishlist) return res.json({ success: true, items: [] });
        const items = wishlist.items.filter(i => i.productId);
        if (items.length !== wishlist.items.length) {
            wishlist.items = items.map(i => ({ productId: i.productId._id, addedAt: i.addedAt }));
            await wishlist.save();
        }
        const count = items.length;
        const inStock = items.filter(i => i.productId && i.productId.stock > 0).length;
        const outOfStock = count - inStock;
        const estimatedValue = items.reduce((sum, i) => sum + (i.productId ? i.productId.price || 0 : 0), 0);
        res.json({ success: true, items, stats: { count, inStock, outOfStock, estimatedValue } });
    } catch (err) {
        console.error('GET /wishlist error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.get('/count', authenticateToken, async (req, res) => {
    try {
        const wishlist = await Wishlist.findOne({ user: req.user.id });
        res.json({ success: true, count: wishlist ? wishlist.items.length : 0 });
    } catch (err) {
        console.error('GET /wishlist/count error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.get('/check/:productId', authenticateToken, async (req, res) => {
    try {
        if (!isValidObjectId(req.params.productId)) {
            return res.json({ success: true, inWishlist: false });
        }
        const wishlist = await Wishlist.findOne({ user: req.user.id });
        const inWishlist = wishlist
            ? wishlist.items.some(item => item.productId.toString() === req.params.productId)
            : false;
        res.json({ success: true, inWishlist });
    } catch (err) {
        console.error('GET /wishlist/check error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.get('/check-batch', authenticateToken, async (req, res) => {
    try {
        const ids = req.query.ids ? req.query.ids.split(',') : [];
        if (!ids.length) return res.json({ success: true, results: {} });
        const wishlist = await Wishlist.findOne({ user: req.user.id });
        const results = {};
        ids.forEach(id => {
            results[id] = wishlist ? wishlist.items.some(item => item.productId.toString() === id) : false;
        });
        res.json({ success: true, results });
    } catch (err) {
        console.error('GET /wishlist/check-batch error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.post('/sync', authenticateToken, async (req, res) => {
    try {
        const { items } = req.body;
        if (!Array.isArray(items)) {
            return res.status(400).json({ success: false, message: 'Items must be an array' });
        }

        let wishlist = await Wishlist.findOne({ user: req.user.id });
        if (!wishlist) wishlist = new Wishlist({ user: req.user.id, items: [] });

        let added = 0;
        for (const item of items) {
            const productId = item.productId || item._id || item;
            if (!productId || !isValidObjectId(productId)) continue;
            const exists = wishlist.items.some(wi => wi.productId.toString() === productId.toString());
            if (!exists) {
                const product = await Product.findById(productId).select('_id');
                if (product) {
                    wishlist.items.push({
                        productId: product._id,
                        size: item.size || '',
                        color: item.color || '',
                        note: item.note || '',
                        priority: item.priority || 'medium'
                    });
                    added++;
                }
            }
        }

        await wishlist.save();
        const populated = await Wishlist.findOne({ user: req.user.id }).populate('items.productId');
        const valid = populated.items.filter(i => i.productId);
        res.json({ success: true, message: `Synced ${added} new items`, items: valid, count: valid.length });
    } catch (err) {
        console.error('POST /wishlist/sync error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.post('/', authenticateToken, async (req, res) => {
    try {
        const { productId, size, color, note, priority } = req.body;
        if (!productId) return res.status(400).json({ success: false, message: 'Product ID required' });
        if (!isValidObjectId(productId)) return res.status(400).json({ success: false, message: 'Invalid product ID' });

        const product = await Product.findById(productId).select('_id name price originalPrice images stock brand');
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

        let wishlist = await Wishlist.findOne({ user: req.user.id });
        if (!wishlist) wishlist = new Wishlist({ user: req.user.id, items: [] });

        const exists = wishlist.items.some(item => item.productId.toString() === productId);
        if (exists) {
            const item = wishlist.items.find(item => item.productId.toString() === productId);
            if (size !== undefined) item.size = size;
            if (color !== undefined) item.color = color;
            if (note !== undefined) item.note = note;
            if (priority !== undefined) item.priority = priority;
            await wishlist.save();
            const count = wishlist.items.length;
            return res.json({ success: true, message: 'Wishlist item updated', count, updated: true });
        }

        wishlist.items.push({ productId, size: size || '', color: color || '', note: note || '', priority: priority || 'medium' });
        await wishlist.save();

        const count = wishlist.items.length;
        res.json({ success: true, message: 'Added to wishlist', count, product: { name: product.name, price: product.price, image: (product.images || [])[0] || '' } });
    } catch (err) {
        console.error('POST /wishlist error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.put('/items/:itemId', authenticateToken, async (req, res) => {
    try {
        const { size, color, note, priority } = req.body;
        const wishlist = await Wishlist.findOne({ user: req.user.id });
        if (!wishlist) return res.status(404).json({ success: false, message: 'Wishlist not found' });

        const item = wishlist.items.id(req.params.itemId);
        if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

        if (size !== undefined) item.size = size;
        if (color !== undefined) item.color = color;
        if (note !== undefined) item.note = note;
        if (priority !== undefined) item.priority = priority;

        await wishlist.save();
        const populated = await Wishlist.findOne({ user: req.user.id }).populate('items.productId');
        const updatedItem = populated.items.id(req.params.itemId);
        res.json({ success: true, message: 'Item updated', item: updatedItem });
    } catch (err) {
        console.error('PUT /wishlist/items error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.post('/move-to-cart/:itemId', authenticateToken, async (req, res) => {
    try {
        const wishlist = await Wishlist.findOne({ user: req.user.id });
        if (!wishlist) return res.status(404).json({ success: false, message: 'Wishlist not found' });

        const item = wishlist.items.id(req.params.itemId);
        if (!item) return res.status(404).json({ success: false, message: 'Item not found in wishlist' });

        const product = await Product.findById(item.productId);
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
        if (product.stock < 1) return res.status(400).json({ success: false, message: 'Product is out of stock' });

        let cart = await Cart.findOne({ userId: req.user.id });
        if (!cart) cart = new Cart({ userId: req.user.id, items: [] });

        const existingCart = cart.items.find(i =>
            i.productId.toString() === item.productId.toString() &&
            i.size === item.size &&
            i.color === item.color
        );

        if (existingCart) {
            existingCart.quantity = Math.min(existingCart.quantity + 1, product.stock);
        } else {
            cart.items.push({
                productId: product._id,
                name: product.name,
                price: product.price,
                originalPrice: product.originalPrice || 0,
                quantity: 1,
                size: item.size || '',
                color: item.color || '',
                image: (product.images || [])[0] || ''
            });
        }

        await cart.save();
        wishlist.items = wishlist.items.filter(i => i._id.toString() !== req.params.itemId);
        await wishlist.save();

        res.json({ success: true, message: 'Moved to cart', wishlistCount: wishlist.items.length });
    } catch (err) {
        console.error('POST /wishlist/move-to-cart error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.post('/move-all-to-cart', authenticateToken, async (req, res) => {
    try {
        const wishlist = await Wishlist.findOne({ user: req.user.id });
        if (!wishlist || !wishlist.items.length) return res.status(400).json({ success: false, message: 'Wishlist is empty' });

        let cart = await Cart.findOne({ userId: req.user.id });
        if (!cart) cart = new Cart({ userId: req.user.id, items: [] });

        let moved = 0;
        let failed = 0;
        const remaining = [];

        for (const item of wishlist.items) {
            const product = await Product.findById(item.productId);
            if (!product || product.stock < 1) {
                failed++;
                remaining.push(item);
                continue;
            }

            const existingCart = cart.items.find(i =>
                i.productId.toString() === item.productId.toString() &&
                i.size === item.size &&
                i.color === item.color
            );

            if (existingCart) {
                existingCart.quantity = Math.min(existingCart.quantity + 1, product.stock);
            } else {
                cart.items.push({
                    productId: product._id,
                    name: product.name,
                    price: product.price,
                    originalPrice: product.originalPrice || 0,
                    quantity: 1,
                    size: item.size || '',
                    color: item.color || '',
                    image: (product.images || [])[0] || ''
                });
            }
            moved++;
        }

        await cart.save();
        wishlist.items = remaining;
        await wishlist.save();

        res.json({
            success: true,
            message: `Moved ${moved} item${moved !== 1 ? 's' : ''} to cart${failed ? `, ${failed} item${failed !== 1 ? 's' : ''} could not be moved` : ''}`,
            moved,
            failed,
            wishlistCount: wishlist.items.length
        });
    } catch (err) {
        console.error('POST /wishlist/move-all-to-cart error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.post('/share', authenticateToken, async (req, res) => {
    try {
        let wishlist = await Wishlist.findOne({ user: req.user.id });
        if (!wishlist || !wishlist.items.length) return res.status(400).json({ success: false, message: 'Wishlist is empty' });

        if (!wishlist.shareId) {
            wishlist.shareId = crypto.randomBytes(16).toString('hex');
        }
        wishlist.isPublic = true;
        await wishlist.save();

        const shareUrl = `${req.protocol}://${req.get('host')}/shared-wishlist.html?id=${wishlist.shareId}`;
        res.json({ success: true, shareUrl, shareId: wishlist.shareId });
    } catch (err) {
        console.error('POST /wishlist/share error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.delete('/share', authenticateToken, async (req, res) => {
    try {
        const wishlist = await Wishlist.findOne({ user: req.user.id });
        if (wishlist) {
            wishlist.isPublic = false;
            await wishlist.save();
        }
        res.json({ success: true, message: 'Wishlist sharing disabled' });
    } catch (err) {
        console.error('DELETE /wishlist/share error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.get('/shared/:shareId', async (req, res) => {
    try {
        const wishlist = await Wishlist.findOne({ shareId: req.params.shareId, isPublic: true }).populate('items.productId');
        if (!wishlist) return res.status(404).json({ success: false, message: 'Shared wishlist not found or no longer public' });

        const user = await mongoose.model('User').findById(wishlist.user).select('name email');
        const items = wishlist.items.filter(i => i.productId);

        res.json({
            success: true,
            wishlist: {
                user: user ? { name: user.name } : { name: 'Someone' },
                items,
                createdAt: wishlist.createdAt,
                totalItems: items.length
            }
        });
    } catch (err) {
        console.error('GET /wishlist/shared error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.delete('/clear', authenticateToken, async (req, res) => {
    try {
        const wishlist = await Wishlist.findOne({ user: req.user.id });
        if (!wishlist) return res.json({ success: true, message: 'Wishlist already empty', count: 0 });
        wishlist.items = [];
        await wishlist.save();
        res.json({ success: true, message: 'Wishlist cleared', count: 0 });
    } catch (err) {
        console.error('DELETE /wishlist/clear error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.delete('/items/:itemId', authenticateToken, async (req, res) => {
    try {
        const wishlist = await Wishlist.findOne({ user: req.user.id });
        if (!wishlist) return res.json({ success: true, message: 'Removed from wishlist', count: 0 });

        wishlist.items = wishlist.items.filter(item => item._id.toString() !== req.params.itemId);
        await wishlist.save();
        res.json({ success: true, message: 'Removed from wishlist', count: wishlist.items.length });
    } catch (err) {
        console.error('DELETE /wishlist/items error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.delete('/:productId', authenticateToken, async (req, res) => {
    try {
        const { productId } = req.params;
        if (!isValidObjectId(productId)) return res.status(400).json({ success: false, message: 'Invalid product ID' });
        const wishlist = await Wishlist.findOne({ user: req.user.id });
        if (!wishlist) return res.json({ success: true, message: 'Removed from wishlist', count: 0 });

        wishlist.items = wishlist.items.filter(item => item.productId.toString() !== productId);
        await wishlist.save();
        res.json({ success: true, message: 'Removed from wishlist', count: wishlist.items.length });
    } catch (err) {
        console.error('DELETE /wishlist error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
