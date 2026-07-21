// routes/admin.routes.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Order = require('../models/Order');
const User = require('../models/User');
const Contact = require('../models/Contact');
const ContactMessage = require('../models/ContactMessage');
const Review = require('../models/Review');
const Notification = require('../models/Notification');
const Coupon = require('../models/Coupon');
const Wishlist = require('../models/Wishlist');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

/**
 * GET /api/admin/stats
 * Returns dashboard statistics for the admin panel.
 * Protected: requires valid JWT and admin role.
 */
router.get('/stats', authenticateToken, requireAdmin, async (req, res) => {
    try {
        // Get today's date (start of day)
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Run all queries in parallel for performance
        const [
            totalProducts,
            totalCategories,
            totalOrders,
            totalCustomers,
            lowStock,
            featured,
            addedToday,
            revenueResult,
            recentOrders,
            pendingOrders,
            packedOrders,
            shippedOrders,
            deliveredOrders,
            cancelledOrders,
            refundedOrders,
            todayOrders,
            monthlyOrders
        ] = await Promise.all([
            Product.countDocuments(),
            Category.countDocuments({ isHidden: { $ne: true } }),
            Order.countDocuments(),
            User.countDocuments({ role: 'customer' }),
            Product.countDocuments({ stock: { $lt: 5 } }),
            Product.countDocuments({ featured: true }),
            Product.countDocuments({ createdAt: { $gte: today } }),
            Order.aggregate([
                { $group: { _id: null, total: { $sum: '$total' } } }
            ]),
            Order.find()
                .sort({ createdAt: -1 })
                .limit(5)
                .populate('user', 'name'),
            Order.countDocuments({ status: 'pending' }),
            Order.countDocuments({ status: 'packed' }),
            Order.countDocuments({ status: 'shipped' }),
            Order.countDocuments({ status: 'delivered' }),
            Order.countDocuments({ status: 'cancelled' }),
            Order.countDocuments({ status: 'refunded' }),
            Order.countDocuments({ createdAt: { $gte: today } }),
            Order.countDocuments({ createdAt: { $gte: new Date(today.getFullYear(), today.getMonth(), 1) } })
        ]);

        const totalRevenue = revenueResult.length > 0 ? revenueResult[0].total : 0;
        const avgOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

        const stats = {
            totalProducts: totalProducts || 0,
            totalCategories: totalCategories || 0,
            totalOrders: totalOrders || 0,
            totalCustomers: totalCustomers || 0,
            lowStock: lowStock || 0,
            featured: featured || 0,
            addedToday: addedToday || 0,
            revenue: totalRevenue,
            avgOrderValue,
            pendingOrders: pendingOrders || 0,
            packedOrders: packedOrders || 0,
            shippedOrders: shippedOrders || 0,
            deliveredOrders: deliveredOrders || 0,
            cancelledOrders: cancelledOrders || 0,
            refundedOrders: refundedOrders || 0,
            todayOrders: todayOrders || 0,
            monthlyOrders: monthlyOrders || 0,
            recentOrders: recentOrders.map(order => ({
                _id: order._id,
                orderNumber: order.orderNumber,
                user: order.user ? { name: order.user.name } : null,
                total: order.total || 0,
                status: order.status || 'pending',
                createdAt: order.createdAt
            }))
        };

        res.json({ success: true, data: stats });
    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch dashboard statistics',
            error: error.message
        });
    }
});

/**
 * GET /api/admin/products
 * Returns ALL products (any status) for the admin panel.
 * Protected: requires valid JWT and admin role.
 */
router.get('/products', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { page = 1, limit = 25, status, category, gender, search, sort } = req.query;
        const filter = {};
        if (status) filter.status = status;
        if (category) filter.category = category;
        if (gender) filter.gender = gender;
        if (search) filter.$or = [
            { name: { $regex: search, $options: 'i' } },
            { sku: { $regex: search, $options: 'i' } },
            { brand: { $regex: search, $options: 'i' } }
        ];
        let sortObj = { createdAt: -1 };
        if (sort) {
            const sortField = sort.startsWith('-') ? sort.slice(1) : sort;
            const sortDir = sort.startsWith('-') ? -1 : 1;
            const allowed = ['name', 'price', 'rating', 'totalSold', 'createdAt', 'stock'];
            if (allowed.includes(sortField)) sortObj = { [sortField]: sortDir };
        }
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(500, Math.max(1, parseInt(limit)));
        const [products, total] = await Promise.all([
            Product.find(filter).sort(sortObj).skip((pageNum - 1) * limitNum).limit(limitNum).lean(),
            Product.countDocuments(filter)
        ]);
        res.json({ success: true, data: products, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } });
    } catch (error) {
        console.error('Admin products error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch products' });
    }
});

/**
 * GET /api/admin/products/stats
 * Returns product statistics for the admin panel stat cards.
 */
router.get('/products/stats', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [total, published, draft, featured, outOfStock, lowStock, hidden, scheduled] = await Promise.all([
            Product.countDocuments(),
            Product.countDocuments({ status: 'published' }),
            Product.countDocuments({ status: 'draft' }),
            Product.countDocuments({ featured: true }),
            Product.countDocuments({ $or: [{ stock: { $lte: 0 }, soldOut: { $ne: true }, preOrder: { $ne: true }, limitedAvailable: { $ne: true } }, { soldOut: true }], status: { $ne: 'archived' } }),
            Product.countDocuments({ stock: { $gt: 0, $lte: 5 }, status: 'published' }),
            Product.countDocuments({ visibility: 'hidden' }),
            Product.countDocuments({ status: 'scheduled' })
        ]);
        res.json({ success: true, data: { total, published, draft, featured, outOfStock, lowStock, hidden, scheduled } });
    } catch (error) {
        console.error('Products stats error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch product statistics' });
    }
});

/**
 * GET /api/admin/wishlist/stats
 * Returns wishlist analytics for admin dashboard.
 */
router.get('/wishlist/stats', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [
            totalWishlists,
            totalItems,
            mostWishlisted,
            categoryStats,
            recentActivity
        ] = await Promise.all([
            Wishlist.countDocuments(),
            Wishlist.aggregate([{ $unwind: '$items' }, { $count: 'total' }]),
            Wishlist.aggregate([
                { $unwind: '$items' },
                { $group: { _id: '$items.productId', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 10 },
                {
                    $lookup: {
                        from: 'products',
                        localField: '_id',
                        foreignField: '_id',
                        as: 'product'
                    }
                },
                { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        _id: 1, count: 1,
                        name: '$product.name',
                        price: '$product.price',
                        thumbnail: '$product.thumbnail',
                        category: '$product.category'
                    }
                }
            ]),
            Wishlist.aggregate([
                { $unwind: '$items' },
                {
                    $lookup: {
                        from: 'products',
                        localField: 'items.productId',
                        foreignField: '_id',
                        as: 'product'
                    }
                },
                { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
                { $group: { _id: '$product.category', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]),
            Wishlist.aggregate([
                { $unwind: '$items' },
                { $sort: { 'items.addedAt': -1 } },
                { $limit: 20 },
                {
                    $lookup: {
                        from: 'users',
                        localField: 'user',
                        foreignField: '_id',
                        as: 'user'
                    }
                },
                { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
                {
                    $lookup: {
                        from: 'products',
                        localField: 'items.productId',
                        foreignField: '_id',
                        as: 'product'
                    }
                },
                { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        userName: '$user.name',
                        productName: '$product.name',
                        addedAt: '$items.addedAt'
                    }
                }
            ])
        ]);

        const usersWithWishlists = await Wishlist.distinct('user');

        res.json({
            success: true,
            data: {
                totalWishlists,
                totalItems: totalItems.length > 0 ? totalItems[0].total : 0,
                usersWithWishlists: usersWithWishlists.length,
                averageItemsPerUser: usersWithWishlists.length > 0
                    ? Math.round((totalItems.length > 0 ? totalItems[0].total : 0) / usersWithWishlists.length * 10) / 10
                    : 0,
                mostWishlisted,
                categoryStats,
                recentActivity
            }
        });
    } catch (error) {
        console.error('Wishlist stats error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch wishlist stats' });
    }
});

/**
 * POST /api/admin/reset
 * Clears orders, products, contacts, reviews, notifications, coupons, and wishlists.
 * Keeps: users, categories, homepage, settings, social links.
 */
router.post('/reset', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { collections } = req.body;

        const allowed = {
            orders: Order,
            products: Product,
            contacts: Contact,
            contactmessages: ContactMessage,
            reviews: Review,
            notifications: Notification,
            coupons: Coupon,
            wishlists: Wishlist,
            customers: true
        };

        const toClear = (collections && collections.length)
            ? collections.filter(c => allowed[c])
            : Object.keys(allowed);

        const results = {};
        for (const name of toClear) {
            let result;
            if (name === 'customers') {
                result = await User.deleteMany({ role: { $ne: 'admin' } });
            } else {
                const Model = allowed[name];
                result = await Model.deleteMany({});
            }
            results[name] = result.deletedCount;
        }

        res.json({
            success: true,
            message: 'Selected records cleared',
            deleted: results
        });
    } catch (error) {
        console.error('Reset error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to reset records',
            error: error.message
        });
    }
});

/**
 * POST /api/admin/seed
 * Seeds database with sample categories and products.
 */
router.post('/seed', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const categories = [
            { name: 'Trench Coats', slug: 'trench-coats', description: 'Premium executive trench coats for the modern professional', image: 'https://placehold.co/600x400/2C2C2C/C8A35A?text=Trench+Coats', displayOrder: 1, featured: true },
            { name: 'Wardrobe Essentials', slug: 'wardrobe-essentials', description: 'Timeless wardrobe pieces for every occasion', image: 'https://placehold.co/600x400/2C2C2C/C8A35A?text=Wardrobe', displayOrder: 2, featured: true },
            { name: 'Designer Shoes', slug: 'designer-shoes', description: 'Step into luxury with our premium footwear collection', image: 'https://placehold.co/600x400/2C2C2C/C8A35A?text=Shoes', displayOrder: 3, featured: true },
            { name: 'Formal Wear', slug: 'formal-wear', description: 'Executive suits and formal attire', image: 'https://placehold.co/600x400/2C2C2C/C8A35A?text=Formal', displayOrder: 4, featured: false },
            { name: 'Casual Wear', slug: 'casual-wear', description: 'Relaxed styles for everyday luxury', image: 'https://placehold.co/600x400/2C2C2C/C8A35A?text=Casual', displayOrder: 5, featured: false },
            { name: 'Accessories', slug: 'accessories', description: 'Complete your look with premium accessories', image: 'https://placehold.co/600x400/2C2C2C/C8A35A?text=Accessories', displayOrder: 6, featured: false }
        ];

        const products = [
            { name: 'Executive Double-Breasted Trench', description: 'Classic double-breasted trench coat in premium cotton blend. Water-resistant, fully lined, with storm flap and belt.', price: 12500, originalPrice: 15000, stock: 25, sku: 'TC-001', category: 'Trench Coats', gender: 'men', images: ['https://placehold.co/600x800/2C2C2C/C8A35A?text=Trench+1'], sizes: ['S', 'M', 'L', 'XL', 'XXL'], colors: ['Black', 'Navy', 'Khaki'], featured: true, isNewArrival: true, isBestSeller: true },
            { name: 'Slim Fit Rain Trench', description: 'Lightweight slim-fit trench with modern cut. Water-repellent finish and removable lining for all-season wear.', price: 9800, originalPrice: 12000, stock: 30, sku: 'TC-002', category: 'Trench Coats', gender: 'men', images: ['https://placehold.co/600x800/2C2C2C/C8A35A?text=Trench+2'], sizes: ['S', 'M', 'L', 'XL'], colors: ['Charcoal', 'Olive', 'Camel'], featured: true, isBestSeller: true },
            { name: 'Heritage Camel Overcoat', description: 'Full-length camel overcoat in Italian wool blend. Peak lapels, double-breasted front, satin-lined interior.', price: 18500, originalPrice: 22000, stock: 15, sku: 'TC-003', category: 'Trench Coats', gender: 'men', images: ['https://placehold.co/600x800/2C2C2C/C8A35A?text=Trench+3'], sizes: ['M', 'L', 'XL', 'XXL'], colors: ['Camel', 'Black'], featured: true, isNewArrival: true },
            { name: 'Elegant Belted Trench Coat', description: 'Sophisticated belted trench in premium gabardine. Feminine silhouette with storm shield and self-tie belt.', price: 11500, originalPrice: 14000, stock: 20, sku: 'TC-004', category: 'Trench Coats', gender: 'women', images: ['https://placehold.co/600x800/2C2C2C/C8A35A?text=Trench+4'], sizes: ['XS', 'S', 'M', 'L', 'XL'], colors: ['Beige', 'Black', 'Dusty Rose'], featured: true, isNewArrival: true, isBestSeller: true },
            { name: 'Cropped Trench Jacket', description: 'Modern cropped trench with oversized collar. Lightweight cotton blend, perfect for layering.', price: 8500, originalPrice: 10000, stock: 35, sku: 'TC-005', category: 'Trench Coats', gender: 'women', images: ['https://placehold.co/600x800/2C2C2C/C8A35A?text=Trench+5'], sizes: ['XS', 'S', 'M', 'L'], colors: ['Ivory', 'Sage', 'Black'], isNewArrival: true },
            { name: 'Premium Cotton Oxford Shirt', description: 'Classic oxford shirt in 100% Egyptian cotton. Button-down collar and mother-of-pearl buttons.', price: 4500, originalPrice: 5500, stock: 50, sku: 'WE-001', category: 'Wardrobe Essentials', gender: 'men', images: ['https://placehold.co/600x800/2C2C2C/C8A35A?text=Shirt'], sizes: ['S', 'M', 'L', 'XL', 'XXL'], colors: ['White', 'Light Blue', 'Pink'], isBestSeller: true },
            { name: 'Tailored Chino Trousers', description: 'Slim-fit chinos in premium stretch cotton. Flat front, slanted pockets, and tailored hem.', price: 5200, originalPrice: 6500, stock: 40, sku: 'WE-002', category: 'Wardrobe Essentials', gender: 'men', images: ['https://placehold.co/600x800/2C2C2C/C8A35A?text=Chinos'], sizes: ['28', '30', '32', '34', '36'], colors: ['Navy', 'Khaki', 'Charcoal'], isBestSeller: true },
            { name: 'Merino Wool V-Neck Sweater', description: 'Luxuriously soft merino wool sweater. Ribbed cuffs and hem, perfect for layering.', price: 6800, originalPrice: 8000, stock: 25, sku: 'WE-003', category: 'Wardrobe Essentials', gender: 'men', images: ['https://placehold.co/600x800/2C2C2C/C8A35A?text=Sweater'], sizes: ['S', 'M', 'L', 'XL'], colors: ['Navy', 'Charcoal', 'Burgundy'], featured: true, isNewArrival: true },
            { name: 'Silk Blend Blouse', description: 'Elegant silk-blend blouse with French cuffs. Relaxed fit and luxurious drape.', price: 5800, originalPrice: 7000, stock: 30, sku: 'WE-004', category: 'Wardrobe Essentials', gender: 'women', images: ['https://placehold.co/600x800/2C2C2C/C8A35A?text=Blouse'], sizes: ['XS', 'S', 'M', 'L'], colors: ['White', 'Black', 'Champagne'], featured: true, isNewArrival: true, isBestSeller: true },
            { name: 'High-Waist Tailored Trousers', description: 'Flattering high-waist trousers with wide leg. Premium fabric and pressed crease.', price: 6200, originalPrice: 7500, stock: 35, sku: 'WE-005', category: 'Wardrobe Essentials', gender: 'women', images: ['https://placehold.co/600x800/2C2C2C/C8A35A?text=Trousers'], sizes: ['XS', 'S', 'M', 'L'], colors: ['Black', 'Cream', 'Navy'], isBestSeller: true },
            { name: 'Italian Leather Oxford', description: 'Handcrafted Italian leather oxfords with Goodyear welt construction and leather sole.', price: 14500, originalPrice: 17000, stock: 20, sku: 'DS-001', category: 'Designer Shoes', gender: 'men', images: ['https://placehold.co/600x800/2C2C2C/C8A35A?text=Oxford'], sizes: ['40', '41', '42', '43', '44'], colors: ['Black', 'Brown', 'Cognac'], featured: true, isNewArrival: true, isBestSeller: true },
            { name: 'Premium Suede Loafers', description: 'Soft suede loafers with tassel detail. Blake-stitched sole and padded footbed.', price: 9800, originalPrice: 12000, stock: 25, sku: 'DS-002', category: 'Designer Shoes', gender: 'men', images: ['https://placehold.co/600x800/2C2C2C/C8A35A?text=Loafers'], sizes: ['40', '41', '42', '43', '44'], colors: ['Navy', 'Tan', 'Black'], featured: true, isBestSeller: true },
            { name: 'Chelsea Boots - Premium Leather', description: 'Classic Chelsea boots in full-grain leather. Elastic side panels and rubber sole.', price: 11500, originalPrice: 14000, stock: 18, sku: 'DS-003', category: 'Designer Shoes', gender: 'men', images: ['https://placehold.co/600x800/2C2C2C/C8A35A?text=Chelsea'], sizes: ['40', '41', '42', '43', '44'], colors: ['Black', 'Dark Brown'], isNewArrival: true },
            { name: 'Stiletto Pointed Pumps', description: 'Sleek pointed-toe pumps with 4-inch stiletto heel. Premium satin finish.', price: 8500, originalPrice: 10000, stock: 22, sku: 'DS-004', category: 'Designer Shoes', gender: 'women', images: ['https://placehold.co/600x800/2C2C2C/C8A35A?text=Pumps'], sizes: ['36', '37', '38', '39', '40'], colors: ['Black', 'Red', 'Nude'], featured: true, isNewArrival: true, isBestSeller: true },
            { name: 'Strappy Heeled Sandals', description: 'Elegant strappy sandals with block heel. Gold-tone buckles and suede upper.', price: 7200, originalPrice: 8500, stock: 28, sku: 'DS-005', category: 'Designer Shoes', gender: 'women', images: ['https://placehold.co/600x800/2C2C2C/C8A35A?text=Sandals'], sizes: ['36', '37', '38', '39', '40'], colors: ['Gold', 'Black', 'Silver'], isNewArrival: true },
            { name: 'Suede Ankle Boots', description: 'Chic ankle boots in soft suede. Side zip, block heel, and leather lining.', price: 9200, originalPrice: 11000, stock: 20, sku: 'DS-006', category: 'Designer Shoes', gender: 'women', images: ['https://placehold.co/600x800/2C2C2C/C8A35A?text=Ankle+Boot'], sizes: ['36', '37', '38', '39', '40'], colors: ['Black', 'Camel', 'Olive'], featured: true, isBestSeller: true },
            { name: 'Slim Fit Two-Piece Suit', description: 'Impeccably tailored two-piece suit in Italian wool. Slim fit, notch lapel, two-button front.', price: 22000, originalPrice: 28000, stock: 12, sku: 'FW-001', category: 'Formal Wear', gender: 'men', images: ['https://placehold.co/600x800/2C2C2C/C8A35A?text=Suit'], sizes: ['S', 'M', 'L', 'XL'], colors: ['Navy', 'Charcoal', 'Black'], featured: true, isNewArrival: true, isBestSeller: true },
            { name: 'Executive Three-Piece Suit', description: 'Commanding three-piece suit with waistcoat. Super 120s wool and half-canvas construction.', price: 28000, originalPrice: 35000, stock: 8, sku: 'FW-002', category: 'Formal Wear', gender: 'men', images: ['https://placehold.co/600x800/2C2C2C/C8A35A?text=3Piece'], sizes: ['M', 'L', 'XL'], colors: ['Navy', 'Charcoal'], featured: true, isNewArrival: true },
            { name: 'Tailored Blazer Dress', description: 'Sophisticated blazer dress with structured shoulders. Single-button closure and mini length.', price: 12500, originalPrice: 15000, stock: 15, sku: 'FW-003', category: 'Formal Wear', gender: 'women', images: ['https://placehold.co/600x800/2C2C2C/C8A35A?text=Blazer+Dress'], sizes: ['XS', 'S', 'M', 'L'], colors: ['Black', 'Camel', 'White'], featured: true, isNewArrival: true, isBestSeller: true },
            { name: 'Premium Polo Shirt', description: 'Classic polo in pima cotton with mother-of-pearl buttons. Ribbed collar and side vents.', price: 3800, originalPrice: 4500, stock: 45, sku: 'CW-001', category: 'Casual Wear', gender: 'men', images: ['https://placehold.co/600x800/2C2C2C/C8A35A?text=Polo'], sizes: ['S', 'M', 'L', 'XL'], colors: ['White', 'Navy', 'Black'], isBestSeller: true },
            { name: 'Slim Fit Denim Jeans', description: 'Premium selvedge denim jeans. Slim fit, five-pocket styling, and contrast stitching.', price: 6500, originalPrice: 8000, stock: 35, sku: 'CW-002', category: 'Casual Wear', gender: 'men', images: ['https://placehold.co/600x800/2C2C2C/C8A35A?text=Jeans'], sizes: ['28', '30', '32', '34', '36'], colors: ['Indigo', 'Black', 'Light Wash'], isNewArrival: true, isBestSeller: true },
            { name: 'Cashmere Knit Dress', description: 'Luxuriously soft cashmere knit dress. Relaxed fit, ribbed hem, and side slit.', price: 9500, originalPrice: 12000, stock: 18, sku: 'CW-003', category: 'Casual Wear', gender: 'women', images: ['https://placehold.co/600x800/2C2C2C/C8A35A?text=Knit+Dress'], sizes: ['XS', 'S', 'M', 'L'], colors: ['Camel', 'Grey', 'Black'], featured: true, isNewArrival: true },
            { name: 'Wide-Leg Linen Trousers', description: 'Breezy linen trousers with wide leg. Elastic waist, side pockets, and cropped length.', price: 4800, originalPrice: 5500, stock: 30, sku: 'CW-004', category: 'Casual Wear', gender: 'women', images: ['https://placehold.co/600x800/2C2C2C/C8A35A?text=Linen'], sizes: ['XS', 'S', 'M', 'L'], colors: ['White', 'Sand', 'Sage'], isNewArrival: true },
            { name: 'Italian Leather Belt', description: 'Full-grain Italian leather belt with brushed gold buckle. Reversible black/brown.', price: 4500, originalPrice: 5500, stock: 40, sku: 'AC-001', category: 'Accessories', gender: 'unisex', images: ['https://placehold.co/600x800/2C2C2C/C8A35A?text=Belt'], sizes: ['30', '32', '34', '36', '38'], colors: ['Black/Brown'], isBestSeller: true },
            { name: 'Silk Pocket Square Set', description: 'Set of 3 premium silk pocket squares. Hand-rolled edges and gift box packaging.', price: 3200, originalPrice: 4000, stock: 50, sku: 'AC-002', category: 'Accessories', gender: 'men', images: ['https://placehold.co/600x800/2C2C2C/C8A35A?text=Pocket+Square'], sizes: ['One Size'], colors: ['Assorted'], isNewArrival: true },
            { name: 'Leather Crossbody Bag', description: 'Structured crossbody bag in saffiano leather. Adjustable strap and gold hardware.', price: 8500, originalPrice: 10000, stock: 20, sku: 'AC-003', category: 'Accessories', gender: 'women', images: ['https://placehold.co/600x800/2C2C2C/C8A35A?text=Bag'], sizes: ['One Size'], colors: ['Black', 'Tan', 'Red'], featured: true, isNewArrival: true, isBestSeller: true },
            { name: 'Classic Aviator Sunglasses', description: 'Polarized aviator sunglasses with titanium frame. UV400 protection and leather case.', price: 5500, originalPrice: 7000, stock: 30, sku: 'AC-004', category: 'Accessories', gender: 'unisex', images: ['https://placehold.co/600x800/2C2C2C/C8A35A?text=Sunglasses'], sizes: ['One Size'], colors: ['Gold/Green', 'Silver/Blue'], featured: true, isBestSeller: true },
            { name: 'Kids Classic Trench', description: 'Mini version of our signature trench coat. Cotton blend, removable belt. Ages 5-12.', price: 5500, originalPrice: 6500, stock: 20, sku: 'KD-001', category: 'Trench Coats', gender: 'kids', images: ['https://placehold.co/600x800/2C2C2C/C8A35A?text=Kids+Trench'], sizes: ['5-6Y', '7-8Y', '9-10Y', '11-12Y'], colors: ['Khaki', 'Navy'], isNewArrival: true },
            { name: 'Kids Oxford Set', description: 'Complete oxford shirt and chino set for boys. Premium cotton and adjustable waist.', price: 4200, originalPrice: 5000, stock: 25, sku: 'KD-002', category: 'Wardrobe Essentials', gender: 'kids', images: ['https://placehold.co/600x800/2C2C2C/C8A35A?text=Kids+Set'], sizes: ['5-6Y', '7-8Y', '9-10Y', '11-12Y'], colors: ['White/Navy'], isNewArrival: true }
        ];

        // Clear existing data and drop stale indexes
        await Category.deleteMany({});
        await Product.deleteMany({});
        try { await Product.collection.dropIndex('slug_1'); } catch(e) {}
        const cats = await Category.insertMany(categories);
        // Add slug to each product
        const prodsData = products.map(p => ({
            ...p,
            slug: p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
        }));
        const prods = await Product.insertMany(prodsData);

        res.json({
            success: true,
            message: `Seeded ${cats.length} categories and ${prods.length} products`,
            categories: cats.length,
            products: prods.length
        });
    } catch (error) {
        console.error('Seed error:', error);
        res.status(500).json({ success: false, message: 'Seed failed', error: error.message });
    }
});

/**
 * POST /api/admin/setup
 * One-time admin setup: creates or resets the admin password.
 * Protected by ADMIN_SETUP_KEY env var.
 */
router.post('/setup', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { email, password, setupKey } = req.body;
        if (!setupKey || setupKey !== process.env.ADMIN_SETUP_KEY) {
            return res.status(403).json({ success: false, message: 'Invalid setup key' });
        }
        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password required' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await User.findOneAndUpdate(
            { email },
            { email, password: hashedPassword, name: 'Admin', role: 'admin' },
            { upsert: true, new: true }
        );
        res.json({ success: true, message: 'Admin account created', email: user.email });
    } catch (error) {
        console.error('Setup error:', error);
        res.status(500).json({ success: false, message: 'Setup failed' });
    }
});

/**
 * GET /api/admin/dashboard
 * Comprehensive dashboard data: KPI stats, sales/revenue analytics, recent customers, quick actions meta.
 */
router.get('/dashboard', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

        const [
            totalProducts,
            activeProducts,
            outOfStockProducts,
            lowStockCount,
            totalCategories,
            totalOrders,
            totalRevenue,
            todayOrders,
            todayRevenue,
            monthlyOrders,
            monthlyRevenue,
            pendingOrders,
            completedOrders,
            cancelledOrders,
            totalCustomers,
            newCustomersToday,
            totalReviews,
            avgRating,
            activeCoupons,
            recentOrders,
            recentCustomers,
            revenueByCategory,
            topBrands,
            dailySales,
            lowStockProducts,
            topProducts
        ] = await Promise.all([
            Product.countDocuments(),
            Product.countDocuments({ status: 'published', inStock: { $ne: false } }),
            Product.countDocuments({ $or: [{ stock: 0 }, { stock: { $exists: false } }, { inStock: false }] }),
            Product.countDocuments({ stock: { $gt: 0, $lte: 5 } }),
            Category.countDocuments({ isHidden: { $ne: true } }),
            Order.countDocuments(),
            Order.aggregate([{ $group: { _id: null, total: { $sum: '$total' } } }]),
            Order.countDocuments({ createdAt: { $gte: today } }),
            Order.aggregate([{ $match: { createdAt: { $gte: today } } }, { $group: { _id: null, total: { $sum: '$total' } } }]),
            Order.countDocuments({ createdAt: { $gte: startOfMonth } }),
            Order.aggregate([{ $match: { createdAt: { $gte: startOfMonth } } }, { $group: { _id: null, total: { $sum: '$total' } } }]),
            Order.countDocuments({ status: { $in: ['pending', 'confirmed', 'processing'] } }),
            Order.countDocuments({ status: 'delivered' }),
            Order.countDocuments({ status: 'cancelled' }),
            User.countDocuments({ role: 'customer' }),
            User.countDocuments({ role: 'customer', createdAt: { $gte: today } }),
            Review.countDocuments(),
            Review.aggregate([{ $group: { _id: null, avg: { $avg: '$rating' } } }]),
            Coupon.countDocuments({ active: true }),
            Order.find().sort({ createdAt: -1 }).limit(8)
                .populate('user', 'name email')
                .select('orderNumber total status paymentMethod createdAt shippingAddress user')
                .lean(),
            User.find({ role: 'customer' }).sort({ createdAt: -1 }).limit(6)
                .select('name email phone profilePhoto createdAt totalSpent orderCount')
                .lean(),
            Order.aggregate([
                { $unwind: '$items' },
                { $group: { _id: '$items.category', total: { $sum: '$items.price' } } },
                { $sort: { total: -1 } },
                { $limit: 8 }
            ]),
            Order.aggregate([
                { $unwind: '$items' },
                { $group: { _id: '$items.brand', total: { $sum: '$items.price' }, count: { $sum: 1 } } },
                { $sort: { total: -1 } },
                { $limit: 8 }
            ]),
            Order.aggregate([
                { $match: { createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } },
                { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, total: { $sum: '$total' }, count: { $sum: 1 } } },
                { $sort: { _id: 1 } }
            ]),
            Product.find({ stock: { $gt: 0, $lte: 5 } }).sort({ stock: 1 }).limit(8).select('name stock price').lean(),
            Product.find().sort({ price: -1 }).limit(8).select('name price stock images').lean()
        ]);

        res.json({
            success: true,
            data: {
                kpi: {
                    totalRevenue: (totalRevenue[0] && totalRevenue[0].total) || 0,
                    todayRevenue: (todayRevenue[0] && todayRevenue[0].total) || 0,
                    monthlyRevenue: (monthlyRevenue[0] && monthlyRevenue[0].total) || 0,
                    totalOrders: totalOrders || 0,
                    pendingOrders: pendingOrders || 0,
                    completedOrders: completedOrders || 0,
                    cancelledOrders: cancelledOrders || 0,
                    todayOrders: todayOrders || 0,
                    monthlyOrders: monthlyOrders || 0,
                    totalCustomers: totalCustomers || 0,
                    newCustomersToday: newCustomersToday || 0,
                    totalProducts: totalProducts || 0,
                    activeProducts: activeProducts || 0,
                    outOfStockProducts: outOfStockProducts || 0,
                    lowStockProducts: lowStockCount || 0,
                    totalCategories: totalCategories || 0,
                    totalReviews: totalReviews || 0,
                    averageRating: avgRating.length > 0 ? Math.round(avgRating[0].avg * 10) / 10 : 0,
                    activeCoupons: activeCoupons || 0
                },
                recentOrders: recentOrders.map(o => ({
                    _id: o._id,
                    orderNumber: o.orderNumber,
                    user: o.user ? { name: o.user.name, email: o.user.email } : null,
                    total: o.total || 0,
                    status: o.status || 'pending',
                    paymentMethod: o.paymentMethod,
                    shippingAddress: o.shippingAddress,
                    createdAt: o.createdAt
                })),
                recentCustomers: recentCustomers.map(u => ({
                    _id: u._id,
                    name: u.name,
                    email: u.email,
                    phone: u.phone,
                    profilePhoto: u.profilePhoto,
                    createdAt: u.createdAt,
                    totalOrders: u.orderCount || 0,
                    totalSpent: u.totalSpent || 0
                })),
                revenueByCategory: revenueByCategory.map(c => ({ category: c._id || 'Other', total: c.total })),
                topBrands: topBrands.map(b => ({ brand: b._id || 'Unknown', total: b.total, count: b.count })),
                dailySales: dailySales.map(d => ({ date: d._id, total: d.total, count: d.count })),
                lowStockProducts: lowStockProducts.map(p => ({ _id: p._id, name: p.name, stock: p.stock, price: p.price })),
                topProducts: topProducts.map(p => ({ _id: p._id, name: p.name, price: p.price, stock: p.stock }))
            }
        });
    } catch (error) {
        console.error('Dashboard endpoint error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch dashboard data', error: error.message });
    }
});

module.exports = router;