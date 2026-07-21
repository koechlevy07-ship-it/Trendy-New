const express = require('express');
const router = express.Router();
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const Coupon = require('../models/Coupon');
const { authenticateToken } = require('../middleware/auth');

// Helper: refresh cart items with live product data
async function refreshCartItems(cart) {
    const updated = [];
    for (const item of cart.items) {
        const product = await Product.findById(item.productId);
        if (product) {
            updated.push({
                ...item.toObject(),
                price: product.price,
                originalPrice: product.originalPrice || item.originalPrice || 0,
                name: product.name,
                image: product.images?.[0] || item.image || '',
                brand: product.brand || '',
                category: product.category || '',
                sku: product.sku || '',
                inStock: product.stock > 0,
                stock: product.stock,
                deliveryEstimate: product.deliveryEstimate || '2-5 business days',
                material: product.material || ''
            });
        }
    }
    cart.items = updated;
    return cart;
}

// GET /api/cart – get current user's cart with refreshed product data
router.get('/', authenticateToken, async (req, res) => {
    try {
        let cart = await Cart.findOne({ userId: req.user._id });
        if (!cart) {
            cart = new Cart({ userId: req.user._id, items: [] });
            await cart.save();
        }
        cart = await refreshCartItems(cart);
        const activeItems = cart.items.filter(i => !i.savedForLater);
        const savedItems = cart.items.filter(i => i.savedForLater);
        const subtotal = activeItems.reduce((s, i) => s + (i.price || 0) * i.quantity, 0);
        const savings = activeItems.reduce((s, i) => s + ((i.originalPrice && i.originalPrice > i.price ? i.originalPrice - i.price : 0) * i.quantity), 0);
        const totalItems = activeItems.reduce((s, i) => s + i.quantity, 0);
        const shipping = subtotal >= 15000 ? 0 : 500;
        const couponDiscount = cart.couponDiscount || 0;
        const grandTotal = Math.max(0, subtotal - couponDiscount + shipping);

        await cart.save();
        res.json({
            success: true,
            data: {
                items: activeItems,
                savedForLater: savedItems,
                summary: {
                    totalItems,
                    subtotal,
                    savings,
                    shipping,
                    couponCode: cart.couponCode || '',
                    couponDiscount,
                    grandTotal
                }
            }
        });
    } catch (err) {
        console.error('Cart GET error:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// GET /api/cart/count – get current user's cart item count
router.get('/count', authenticateToken, async (req, res) => {
    try {
        const cart = await Cart.findOne({ userId: req.user._id });
        const count = cart ? cart.items.filter(i => !i.savedForLater).reduce((sum, item) => sum + item.quantity, 0) : 0;
        res.json({ success: true, count });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// POST /api/cart – add item to cart
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { productId, quantity, size, color } = req.body;
        const product = await Product.findById(productId);
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
        if (product.stock < (quantity || 1)) return res.status(400).json({ success: false, message: 'Not enough stock' });

        let cart = await Cart.findOne({ userId: req.user._id });
        if (!cart) {
            cart = new Cart({ userId: req.user._id, items: [] });
        }

        const existing = cart.items.find(i =>
            i.productId.toString() === productId &&
            i.size === (size || '') &&
            i.color === (color || '')
        );

        if (existing) {
            existing.quantity += quantity || 1;
            if (product.stock < existing.quantity) {
                return res.status(400).json({ success: false, message: 'Not enough stock' });
            }
            existing.savedForLater = false;
        } else {
            cart.items.push({
                productId: product._id,
                name: product.name,
                price: product.price,
                originalPrice: product.originalPrice || 0,
                quantity: quantity || 1,
                size: size || '',
                color: color || '',
                image: product.images?.[0] || '',
                savedForLater: false
            });
        }

        await cart.save();
        const updatedCart = await refreshCartItems(cart);
        res.json({ success: true, data: updatedCart });
    } catch (err) {
        console.error('Cart POST error:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// PUT /api/cart/:itemId – update item quantity
router.put('/:itemId', authenticateToken, async (req, res) => {
    try {
        const { quantity } = req.body;
        let cart = await Cart.findOne({ userId: req.user._id });
        if (!cart) return res.status(404).json({ success: false, message: 'Cart not found' });

        const item = cart.items.id(req.params.itemId);
        if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

        const product = await Product.findById(item.productId);
        if (product && product.stock < quantity) {
            return res.status(400).json({ success: false, message: 'Not enough stock' });
        }

        item.quantity = quantity;
        if (item.quantity <= 0) {
            cart.items.pull({ _id: req.params.itemId });
        }
        item.savedForLater = false;
        await cart.save();
        const updatedCart = await refreshCartItems(cart);
        res.json({ success: true, data: updatedCart });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// POST /api/cart/save-for-later – toggle item savedForLater
router.post('/save-for-later/:itemId', authenticateToken, async (req, res) => {
    try {
        let cart = await Cart.findOne({ userId: req.user._id });
        if (!cart) return res.status(404).json({ success: false, message: 'Cart not found' });

        const item = cart.items.id(req.params.itemId);
        if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

        item.savedForLater = !item.savedForLater;
        await cart.save();
        const updatedCart = await refreshCartItems(cart);
        res.json({ success: true, data: updatedCart });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// POST /api/cart/move-to-wishlist – move item from cart to wishlist
router.post('/move-to-wishlist/:itemId', authenticateToken, async (req, res) => {
    try {
        const Wishlist = require('../models/Wishlist');
        let cart = await Cart.findOne({ userId: req.user._id });
        if (!cart) return res.status(404).json({ success: false, message: 'Cart not found' });

        const item = cart.items.id(req.params.itemId);
        if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

        let wishlist = await Wishlist.findOne({ user: req.user._id });
        if (!wishlist) {
            wishlist = new Wishlist({ user: req.user._id, items: [] });
        }
        const existsInWishlist = wishlist.items.some(w => w.productId.toString() === item.productId.toString());
        if (!existsInWishlist) {
            wishlist.items.push({
                productId: item.productId,
                size: item.size || '',
                color: item.color || ''
            });
            await wishlist.save();
        }

        // Remove from cart
        cart.items.pull({ _id: req.params.itemId });
        await cart.save();
        res.json({ success: true, message: 'Item moved to wishlist' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// POST /api/cart/apply-coupon – apply a coupon code
router.post('/apply-coupon', authenticateToken, async (req, res) => {
    try {
        const { code } = req.body;
        if (!code) return res.status(400).json({ success: false, message: 'Coupon code required' });

        const coupon = await Coupon.findOne({ code: code.toUpperCase().trim() });
        if (!coupon) return res.status(404).json({ success: false, message: 'Invalid or expired coupon' });

        let cart = await Cart.findOne({ userId: req.user._id });
        if (!cart) return res.status(404).json({ success: false, message: 'Cart not found' });

        // Build cart object for validation
        const activeItems = cart.items.filter(i => !i.savedForLater);
        const cartObj = {
            subtotal: activeItems.reduce((s, i) => s + (i.price || 0) * i.quantity, 0),
            items: activeItems.map(i => ({
                productId: i.productId,
                quantity: i.quantity,
                price: i.price,
                category: i.category,
                brand: i.brand
            })),
            shipping: 500
        };

        const validation = coupon.isValid(cartObj, req.user);
        if (!validation.valid) {
            return res.status(400).json({ success: false, message: validation.message });
        }

        const discount = coupon.calculateDiscount(cartObj);
        
        // Update daily usage
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        let dailyUsage = coupon.dailyUsage.find(u => u.date.toDateString() === today.toDateString());
        if (!dailyUsage) {
            coupon.dailyUsage.push({ date: today, count: 0 });
            dailyUsage = coupon.dailyUsage[coupon.dailyUsage.length - 1];
        }
        dailyUsage.count += 1;
        
        // Track usage by customer
        let customerUsage = coupon.usedBy.find(u => u.customer.equals(req.user._id));
        if (!customerUsage) {
            coupon.usedBy.push({ customer: req.user._id, count: 0, lastUsed: new Date() });
            customerUsage = coupon.usedBy[coupon.usedBy.length - 1];
        }
        customerUsage.count += 1;
        customerUsage.lastUsed = new Date();

        coupon.timesUsed += 1;
        coupon.totalDiscountGiven += discount;
        await coupon.save();

        cart.couponCode = code.toUpperCase();
        cart.couponDiscount = discount;
        await cart.save();

        const updatedCart = await refreshCartItems(cart);
        const activeItemsUpdated = updatedCart.items.filter(i => !i.savedForLater);
        const newSubtotal = activeItemsUpdated.reduce((s, i) => s + (i.price || 0) * i.quantity, 0);
        const shipping = newSubtotal >= 15000 ? 0 : 500;
        const grandTotal = Math.max(0, newSubtotal - discount + shipping);

        res.json({
            success: true,
            data: {
                coupon: { code: code.toUpperCase(), discount, discountType: coupon.discountType, discountValue: coupon.discountValue },
                summary: { subtotal: newSubtotal, couponDiscount: discount, shipping, grandTotal }
            }
        });
    } catch (err) {
        console.error('Coupon apply error:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// DELETE /api/cart/coupon – remove applied coupon
router.delete('/coupon', authenticateToken, async (req, res) => {
    try {
        let cart = await Cart.findOne({ userId: req.user._id });
        if (cart) {
            cart.couponCode = '';
            cart.couponDiscount = 0;
            await cart.save();
        }
        res.json({ success: true, message: 'Coupon removed' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// DELETE /api/cart/:itemId – remove item from cart
router.delete('/:itemId', authenticateToken, async (req, res) => {
    try {
        let cart = await Cart.findOne({ userId: req.user._id });
        if (!cart) return res.status(404).json({ success: false, message: 'Cart not found' });

        cart.items.pull({ _id: req.params.itemId });
        await cart.save();
        const updatedCart = await refreshCartItems(cart);
        res.json({ success: true, data: updatedCart });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// DELETE /api/cart – clear entire cart
router.delete('/', authenticateToken, async (req, res) => {
    try {
        let cart = await Cart.findOne({ userId: req.user._id });
        if (cart) {
            cart.items = [];
            cart.couponCode = '';
            cart.couponDiscount = 0;
            await cart.save();
        }
        res.json({ success: true, data: { items: [], summary: { totalItems: 0, subtotal: 0, savings: 0, shipping: 500, couponDiscount: 0, grandTotal: 0 } } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// POST /api/cart/validate-stock – validate all cart items stock before checkout
router.post('/validate-stock', authenticateToken, async (req, res) => {
    try {
        let cart = await Cart.findOne({ userId: req.user._id });
        if (!cart) return res.json({ success: true, data: { valid: true, issues: [] } });

        const issues = [];
        for (const item of cart.items) {
            if (item.savedForLater) continue;
            const product = await Product.findById(item.productId);
            if (!product) {
                issues.push({ itemId: item._id, name: item.name, issue: 'Product no longer exists' });
                continue;
            }
            if (product.stock < 1) {
                issues.push({ itemId: item._id, name: item.name, issue: 'Out of stock', stock: 0 });
                continue;
            }
            if (product.stock < item.quantity) {
                issues.push({ itemId: item._id, name: item.name, issue: `Only ${product.stock} available`, stock: product.stock, requested: item.quantity });
            }
            if (product.price !== item.price) {
                issues.push({ itemId: item._id, name: item.name, issue: 'Price changed', oldPrice: item.price, newPrice: product.price });
            }
        }

        res.json({
            success: true,
            data: {
                valid: issues.length === 0,
                issues
            }
        });
    } catch (err) {
        console.error('Cart validate-stock error:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// POST /api/cart/sync – sync/merge local cart to server
router.post('/sync', authenticateToken, async (req, res) => {
    try {
        const { items } = req.body;
        if (!items || !Array.isArray(items)) {
            return res.status(400).json({ success: false, message: 'Items array required' });
        }

        let cart = await Cart.findOne({ userId: req.user._id });
        if (!cart) {
            cart = new Cart({ userId: req.user._id, items: [] });
        }

        for (const incoming of items) {
            const product = await Product.findById(incoming.productId || incoming.id);
            if (!product || product.stock < 1) continue;

            const existing = cart.items.find(i =>
                i.productId.toString() === (incoming.productId || incoming.id) &&
                i.size === (incoming.size || '') &&
                i.color === (incoming.color || '') &&
                !i.savedForLater
            );

            if (existing) {
                existing.quantity = Math.min(existing.quantity + (incoming.quantity || 1), product.stock);
            } else {
                cart.items.push({
                    productId: product._id,
                    name: product.name,
                    price: product.price,
                    originalPrice: product.originalPrice || 0,
                    quantity: Math.min(incoming.quantity || 1, product.stock),
                    size: incoming.size || '',
                    color: incoming.color || '',
                    image: product.images?.[0] || '',
                    savedForLater: false
                });
            }
        }

        await cart.save();
        const updatedCart = await refreshCartItems(cart);
        const activeItems = updatedCart.items.filter(i => !i.savedForLater);
        const subtotal = activeItems.reduce((s, i) => s + (i.price || 0) * i.quantity, 0);
        res.json({
            success: true,
            data: updatedCart,
            summary: { totalItems: activeItems.reduce((s, i) => s + i.quantity, 0), subtotal }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

module.exports = router;
