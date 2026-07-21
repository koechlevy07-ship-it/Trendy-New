const express = require('express');
const router = express.Router();
const { SearchHistory, TrendingSearch, SearchSynonym, SearchAnalytics, SearchSuggestion, ProductRecommendation, ComparisonList, RecentlyViewedProduct, ProductAffinity } = require('../models/Search');
const Product = require('../models/Product');
const User = require('../models/User');
const Order = require('../models/Order');
const Review = require('../models/Review');
const Wishlist = require('../models/Wishlist');
const Cart = require('../models/Cart');
const { authenticateToken } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/auth');
const escapeRegex = require('escape-string-regexp');

// Search helper functions
const buildSearchQuery = (query, filters = {}) => {
    const sq = escapeRegex(query);
    const filter = { status: 'published' };
    
    if (filters.category) filter.category = filters.category;
    if (filters.gender) filter.gender = filters.gender;
    if (filters.brand) filter.brand = filters.brand;
    if (filters.minPrice || filters.maxPrice) {
        filter.price = {};
        if (filters.minPrice) filter.price.$gte = parseFloat(filters.minPrice);
        if (filters.maxPrice) filter.price.$lte = parseFloat(filters.maxPrice);
    }
    if (filters.color) filter.colors = filters.color;
    if (filters.size) filter.sizes = filters.size;
    
    // Apply search query
    if (query) {
        filter.$or = [
            { name: { $regex: query, $options: 'i' } },
            { description: { $regex: query, $options: 'i' } },
            { shortDescription: { $regex: query, $options: 'i' } },
            { brand: { $regex: query, $options: 'i' } },
            { tags: { $in: [new RegExp(query, 'i')] } },
            { category: { $regex: query, $options: 'i' } },
            { sku: { $regex: query, $options: 'i' } },
            { subcategory: { $regex: query, $options: 'i' } },
            { collection: { $regex: query, $options: 'i' } }
        ];
    }
    
    return filter;
};

const applySynonyms = async (query) => {
    const synonyms = await SearchSynonym.find({ isActive: true });
    let expandedQuery = query;
    
    for (const synonym of synonyms) {
        if (synonym.term === query.toLowerCase() || synonym.synonyms.includes(query.toLowerCase())) {
            expandedQuery = `${query} ${synonym.synonyms.join(' ')}`;
            break;
        }
    }
    return expandedQuery;
};

// ============================================================
// PUBLIC SEARCH ROUTES
// ============================================================

// GET /api/search – Enterprise search with full features
router.get('/', async (req, res) => {
    try {
        const { 
            q, page = 1, limit = 20, sort = 'relevance',
            category, gender, brand, minPrice, maxPrice,
            color, size, minRating, availability,
            tags, sortBy
        } = req.query;
        
        const query = q ? q.trim() : '';
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        const skip = (pageNum - 1) * limitNum;
        
        // Apply synonyms
        let expandedQuery = query;
        if (query) {
            expandedQuery = await applySynonyms(query);
        }
        
        const filter = buildSearchQuery(expandedQuery, {
            category, gender, brand, minPrice, maxPrice, color, size
        });
        
        // Availability filter
        if (availability === 'in-stock') {
            match.$and = match.$and || [];
            match.$and.push({ stock: { $gt: 0 } });
        } else if (availability === 'out-of-stock') {
            match.$and = match.$and || [];
            match.$and.push({ stock: 0 });
        }
        
        // Rating filter
        if (minRating) {
            filter.rating = { $gte: parseFloat(minRating) };
        }
        
        // Build sort
        let sortOptions = { rating: -1, totalSold: -1 };
        switch (sortBy || sort) {
            case 'price_asc': sortOptions = { price: 1 }; break;
            case 'price_desc': sortOptions = { price: -1 }; break;
            case 'rating': sortOptions = { rating: -1 }; break;
            case 'newest': sortOptions = { createdAt: -1 }; break;
            case 'popular': sortOptions = { totalSold: -1 }; break;
            case 'name': sortOptions = { name: 1 }; break;
            case 'discount': sortOptions = { discountValue: -1 }; break;
            case 'relevance':
            default: sortOptions = { rating: -1, totalSold: -1 }; break;
        }
        
        // Execute search with facets
        let matchStage = { status: 'published' };
        if (expandedQuery) {
            matchStage.$or = [
                { name: { $regex: expandedQuery, $options: 'i' } },
                { description: { $regex: expandedQuery, $options: 'i' } },
                { brand: { $regex: expandedQuery, $options: 'i' } },
                { tags: { $in: [new RegExp(expandedQuery, 'i')] } },
                { category: { $regex: expandedQuery, $options: 'i' } }
            ];
        }
        
        // Execute search with facets
        const [products, total, facets] = await Promise.all([
            Product.find(filter).sort(sortOptions).skip(skip).limit(limitNum).lean(),
            Product.countDocuments(filter),
            Product.aggregate([
                { $match: matchStage },
                {
                    $facet: {
                        categories: [{ $group: { _id: '$category', count: { $sum: 1 } } }, { $sort: { count: -1 } }],
                        brands: [{ $group: { _id: '$brand', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 20 }],
                        priceRanges: [
                            { $bucket: { groupBy: '$price', boundaries: [0, 1000, 2500, 5000, 10000, 20000, 50000, 100000], default: 'Other', output: { count: { $sum: 1 } } } }
                        ],
                        colors: [{ $unwind: '$colors' }, { $group: { _id: '$colors', count: { $sum: 1 } } }, { $sort: { count: -1 } }],
                        sizes: [{ $unwind: '$sizes' }, { $group: { _id: '$sizes', count: { $sum: 1 } } }, { $sort: { count: -1 } }],
                        ratings: [{ $bucket: { groupBy: '$rating', boundaries: [0, 1, 2, 3, 4, 5], default: 'Other', output: { count: { $sum: 1 } } } }]
                    }
                }
            ])
        ]);
        
        // Log search history
        const startTime = Date.now();
        if (req.user || req.sessionId) {
            await SearchHistory.create({
                userId: req.user?.id,
                sessionId: req.sessionId,
                query: query || req.query.q,
                normalizedQuery: q ? q.toLowerCase() : '',
                resultsCount: total,
                filters: {
                    category, gender, minPrice, maxPrice, brand, color, size, sortBy: sortBy || sort
                },
                responseTime: Date.now() - startTime,
                deviceType: req.headers['user-agent']?.includes('Mobile') ? 'mobile' : 'desktop',
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });
        }
        
        // Update trending searches
        if (query) {
            await TrendingSearch.findOneAndUpdate(
                { query: query.trim() },
                { $inc: { count: 1 }, $set: { lastSearchedAt: new Date() } },
                { upsert: true, new: true }
            );
        }
        
        const responseTime = Date.now() - startTime;
        
        res.json({
            success: true,
            data: products,
            pagination: { page: parseInt(page), limit: limitNum, total, pages: Math.ceil(total / limitNum) },
            facets,
            query: query,
            expandedQuery,
            responseTime,
            searchId: `search_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        });
    } catch (err) {
        console.error('Search error:', err);
        res.status(500).json({ success: false, message: 'Search failed' });
    }
});

// GET /api/search/suggestions – Intelligent autocomplete
router.get('/suggestions', async (req, res) => {
    try {
        const { q, limit = 10, type = 'all' } = req.query;
        const query = q ? q.trim().toLowerCase() : '';
        
        if (!query || query.length < 1) {
            return res.json({ success: true, data: [] });
        }
        
        const limitNum = Math.min(20, Math.max(1, parseInt(limit)));
        const suggestions = [];
        
        // 1. Product suggestions
        if (type === 'all' || type === 'products') {
            const products = await Product.find({
                status: 'published',
                $or: [
                    { name: { $regex: escapeRegex(q), $options: 'i' } },
                    { brand: { $regex: escapeRegex(q), $options: 'i' } },
                    { tags: { $in: [new RegExp(escapeRegex(q), 'i')] } }
                ]
            }).select('name brand price originalPrice images rating stock category gender slug')
            .limit(Math.ceil(limitNum / 3)).lean();
            
            for (const p of products) {
                suggestions.push({
                    type: 'product',
                    id: p._id,
                    text: p.name,
                    subtitle: `${p.brand || ''} • ${p.category || ''}`,
                    price: p.price,
                    originalPrice: p.originalPrice,
                    image: p.images?.[0] || '',
                    rating: p.rating,
                    inStock: p.stock > 0,
                    url: `/product/${p.slug}`
                });
            }
        }
        
        // 2. Category suggestions
        if (type === 'all' || type === 'categories') {
            const categories = await Product.distinct('category', { 
                status: 'published', 
                category: { $regex: escapeRegex(q), $options: 'i' } 
            });
            
            for (const cat of categories.slice(0, Math.ceil(limitNum / 3))) {
                const count = await Product.countDocuments({ status: 'published', category: cat });
                suggestions.push({
                    type: 'category',
                    text: cat,
                    subtitle: `${count} products`,
                    icon: 'fas fa-tag'
                });
            }
        }
        
        // 3. Brand suggestions
        if (type === 'all' || type === 'brands') {
            const brands = await Product.distinct('brand', { 
                status: 'published', 
                brand: { $regex: escapeRegex(q), $options: 'i' } 
            });
            
            for (const brand of brands.slice(0, Math.ceil(limitNum / 3))) {
                const count = await Product.countDocuments({ status: 'published', brand });
                suggestions.push({
                    type: 'brand',
                    text: brand,
                    subtitle: `${count} products`,
                    icon: 'fas fa-building'
                });
            }
        }
        
        // 4. Popular/Trending searches
        if (type === 'all' || type === 'trending') {
            const trending = await TrendingSearch.find({ 
                query: { $regex: escapeRegex(q), $options: 'i' },
                isActive: true 
            }).sort({ count: -1 }).limit(Math.ceil(limitNum / 3)).lean();
            
            for (const t of trending) {
                suggestions.push({
                    type: 'trending',
                    text: t.query,
                    subtitle: `${t.count} searches`,
                    icon: 'fas fa-fire',
                    trending: true
                });
            }
        }
        
        // 5. Search suggestions from history
        if (type === 'all' || type === 'history') {
            const historySuggestions = await SearchSuggestion.find({
                query: { $regex: escapeRegex(q), $options: 'i' },
                isActive: true
            }).sort({ score: -1, clickCount: -1 }).limit(Math.ceil(limitNum / 3)).lean();
            
            for (const s of historySuggestions) {
                suggestions.push({
                    type: s.type,
                    text: s.query,
                    subtitle: `${s.clickCount} clicks`,
                    ...(s.productId ? { productId: s.productId } : {}),
                    ...(s.category ? { category: s.category } : {}),
                    ...(s.brand ? { brand: s.brand } : {})
                });
            }
        }
        
        // Deduplicate and sort by relevance
        const seen = new Set();
        const unique = suggestions.filter(s => {
            const key = `${s.type}-${s.text || s.id}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        }).slice(0, limitNum);
        
        res.json({ success: true, data: unique });
    } catch (err) {
        console.error('Suggestions error:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch suggestions' });
    }
});

// GET /api/search/trending – Trending searches
router.get('/trending', async (req, res) => {
    try {
        const { period = 'weekly', limit = 10, category } = req.query;
        const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
        
        let startDate = new Date();
        switch (period) {
            case 'daily': startDate.setDate(startDate.getDate() - 1); break;
            case 'weekly': startDate.setDate(startDate.getDate() - 7); break;
            case 'monthly': startDate.setMonth(startDate.getMonth() - 1); break;
            case 'yearly': startDate.setFullYear(startDate.getFullYear() - 1); break;
        }
        
        const filter = { isActive: true, lastSearchedAt: { $gte: startDate } };
        if (category) filter.category = category;
        
        const trending = await TrendingSearch.find(filter)
            .sort({ count: -1, growthRate: -1 })
            .limit(limitNum)
            .lean();
        
        res.json({ success: true, data: trending, period });
    } catch (err) {
        console.error('Trending searches error:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch trending searches' });
    }
});

// GET /api/search/recent – Recent searches (user-specific)
router.get('/recent', authenticateToken, async (req, res) => {
    try {
        const { limit = 20 } = req.query;
        const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
        
        const recent = await SearchHistory.find({ userId: req.user.id })
            .sort({ createdAt: -1 })
            .limit(limitNum)
            .select('query filters createdAt clickedProductIds resultsCount')
            .lean();
        
        // Group by query to show unique recent searches
        const unique = [];
        const seen = new Set();
        for (const h of recent) {
            const key = h.query.toLowerCase();
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(h);
            }
        }
        
        res.json({ success: true, data: unique });
    } catch (err) {
        console.error('Recent searches error:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch recent searches' });
    }
});

// DELETE /api/search/recent – Clear recent searches
router.delete('/recent', authenticateToken, async (req, res) => {
    try {
        await SearchHistory.deleteMany({ userId: req.user.id });
        res.json({ success: true, message: 'Recent searches cleared' });
    } catch (err) {
        console.error('Clear recent searches error:', err);
        res.status(500).json({ success: false, message: 'Failed to clear recent searches' });
    }
});

// GET /api/search/recommendations – AI-powered recommendations
router.get('/recommendations', authenticateToken, async (req, res) => {
    try {
        const { type = 'hybrid', limit = 10, context } = req.query;
        const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
        
        // Get user's recommendation profile
        const userId = req.user.id;
        const recommendation = await ProductRecommendation.findOne({ 
            productId: userId, // Using userId as profile key
            isActive: true 
        });
        
        let recommendations = [];
        
        if (recommendation) {
            // Use pre-computed recommendations
            const recProducts = await Product.find({
                _id: { $in: recommendation.recommendedProductIds.map(r => r.productId) },
                status: 'published'
            }).select('name price originalPrice images rating stock category brand slug').lean();
            
            // Sort by recommendation score
            const scoredProducts = recProducts.map(p => {
                const rec = recommendation.recommendedProductIds.find(r => r.productId.toString() === p._id.toString());
                return { ...p, score: rec?.score || 0, reason: rec?.reason || 'hybrid' };
            }).sort((a, b) => b.score - a.score);
            
            recommendations = scoredProducts.slice(0, limitNum);
        } else {
            // Fallback: Generate real-time recommendations
            const user = await User.findById(req.user.id).select('wishlist orderHistory');
            
            // Build recommendation based on multiple signals
            const signals = [];
            
            // 1. Wishlist-based
            if (user.wishlist?.length) {
                const wishlistProducts = await Product.find({ 
                    _id: { $in: user.wishlist }, 
                    status: 'published' 
                }).lean();
                for (const p of wishlistProducts) {
                    signals.push({ productId: p._id, weight: 3, reason: 'wishlist' });
                }
            }
            
            // 2. Recently viewed
            const recentViews = await RecentlyViewedProduct.find({ userId: req.user.id })
                .sort({ viewedAt: -1 }).limit(10).lean();
            for (const rv of recentViews) {
                signals.push({ productId: rv.productId, weight: 2, reason: 'recently-viewed' });
            }
            
            // 3. Purchase history
            const orders = await Order.find({ user: req.user.id }).populate('items.productId').lean();
            for (const order of orders) {
                for (const item of order.items) {
                    signals.push({ productId: item.productId, weight: 4, reason: 'purchase-history' });
                }
            }
            
            // 4. Category/brand affinity
            const categoryAffinities = signals.reduce((acc, s) => {
                if (s.reason !== 'wishlist' && s.reason !== 'recently-viewed') return acc;
                // Would need product details to get category/brand
                return acc;
            }, {});
            
            // 5. Similar customers (collaborative filtering)
            // Find users with similar purchase history
            const similarUsers = await Order.aggregate([
                { $match: { user: { $ne: req.user.id } } },
                { $unwind: '$items' },
                { $group: { _id: '$user', items: { $push: '$items.productId' }, overlap: { $sum: 1 } } },
                { $match: { overlap: { $gte: 2 } } },
                { $sort: { overlap: -1 } },
                { $limit: 5 }
            ]);
            
            // Get products from similar users
            for (const su of similarUsers) {
                const suOrders = await Order.find({ user: su._id }).populate('items.productId').limit(5).lean();
                for (const order of suOrders) {
                    for (const item of order.items) {
                        signals.push({ productId: item.productId, weight: 2, reason: 'similar-customers' });
                    }
                }
            }
            
            // Aggregate and score signals
            const productScores = {};
            for (const signal of signals) {
                const key = signal.productId.toString();
                if (!productScores[key]) productScores[key] = { score: 0, reasons: [] };
                productScores[key].score += signal.weight;
                productScores[key].reasons.push(signal.reason);
            }
            
            // Get top products
            const topProducts = Object.entries(productScores)
                .sort(([,a], [,b]) => b.score - a.score)
                .slice(0, limitNum)
                .map(([id, data]) => ({ productId: id, ...data }));
            
            // Fetch product details
            const productIds = topProducts.map(p => p.productId);
            const products = await Product.find({ 
                _id: { $in: productIds }, 
                status: 'published' 
            }).select('name price originalPrice images rating stock category brand slug').lean();
            
            recommendations = products.map(p => {
                const data = productScores[p._id.toString()];
                return { ...p.toObject(), score: data.score, reasons: data.reasons };
            }).sort((a, b) => b.score - a.score);
        }
        
        res.json({ 
            success: true, 
            data: recommendations,
            metadata: {
                type: 'personalized',
                algorithm: 'hybrid',
                signalsUsed: recommendations.length
            }
        });
    } catch (err) {
        console.error('Recommendations error:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch recommendations' });
    }
});

// GET /api/search/compare – Product comparison
router.get('/compare', async (req, res) => {
    try {
        const { ids } = req.query;
        if (!ids) {
            return res.status(400).json({ success: false, message: 'Product IDs required' });
        }
        
        const idsArray = ids.split(',').slice(0, 4);
        const products = await Product.find({ 
            _id: { $in: idsArray }, 
            status: 'published' 
        }).lean();
        
        // Sort by the order in the request
        const productsMap = new Map(products.map(p => [p._id.toString(), p]));
        const sortedProducts = idsArray.map(id => productsMap.get(id)).filter(Boolean);
        
        // Build comparison matrix
        const comparison = {
            products: sortedProducts,
            attributes: buildComparisonMatrix(sortedProducts)
        };
        
        res.json({ success: true, data: comparison });
    } catch (err) {
        console.error('Product comparison error:', err);
        res.status(500).json({ success: false, message: 'Failed to compare products' });
    }
});

// POST /api/search/track-click – Track search result click
router.post('/track-click', authenticateToken, async (req, res) => {
    try {
        const { searchId, productId, position } = req.body;
        
        await SearchHistory.findByIdAndUpdate(searchId, {
            $addToSet: { clickedProductIds: productId }
        });
        
        // Update suggestion click count
        await SearchSuggestion.findOneAndUpdate(
            { query: { $regex: escapeRegex(query) } },
            { $inc: { clickCount: 1 } }
        );
        
        // Update product affinity
        await updateProductAffinities(req.user.id, productId, 'click');
        
        res.json({ success: true });
    } catch (err) {
        console.error('Track click error:', err);
        res.status(500).json({ success: false, message: 'Failed to track click' });
    }
});

// POST /api/search/track-conversion – Track search to order conversion
router.post('/track-conversion', authenticateToken, async (req, res) => {
    try {
        const { searchId, orderId, productIds } = req.body;
        
        await SearchHistory.findByIdAndUpdate(searchId, {
            convertedToOrder: true,
            orderId,
            addedToCart: true
        });
        
        // Update product affinities for purchased items
        for (const productId of productIds) {
            await updateProductAffinities(req.user.id, productId, 'purchase');
        }
        
        res.json({ success: true });
    } catch (err) {
        console.error('Track conversion error:', err);
        res.status(500).json({ success: false, message: 'Failed to track conversion' });
    }
});

// ============================================================
// ADMIN SEARCH ROUTES
// ============================================================

// GET /api/admin/search/analytics – Search analytics dashboard
router.get('/admin/analytics', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { days = 30 } = req.query;
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        
        const [
            totalSearches,
            zeroResultsRate,
            topQueries,
            zeroResultsQueries,
            topCategories,
            searchByDevice,
            conversionMetrics,
            trendingGrowth
        ] = await Promise.all([
            SearchHistory.countDocuments({ createdAt: { $gte: startDate } }),
            SearchHistory.aggregate([
                { $match: { createdAt: { $gte: startDate } } },
                { $group: { _id: null, total: { $sum: 1 }, zeroResults: { $sum: { $cond: [{ $eq: ['$resultsCount', 0] }, 1, 0] } } } },
                { $project: { rate: { $cond: [{ $gt: ['$total', 0] }, { $multiply: [{ $divide: ['$zeroResults', '$total'] }, 100] }, 0] } } }
            ]),
            SearchHistory.aggregate([
                { $match: { createdAt: { $gte: startDate } } },
                { $group: { _id: '$query', count: { $sum: 1 }, avgResults: { $avg: '$resultsCount' }, clicks: { $sum: { $size: '$clickedProductIds' } }, conversions: { $sum: { $cond: ['$convertedToOrder', 1, 0] } } } },
                { $sort: { count: -1 } },
                { $limit: 20 }
            ]),
            SearchHistory.aggregate([
                { $match: { createdAt: { $gte: startDate }, resultsCount: 0 } },
                { $group: { _id: '$query', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 20 }
            ]),
            SearchHistory.aggregate([
                { $match: { createdAt: { $gte: startDate }, 'filters.category': { $exists: true } } },
                { $group: { _id: '$filters.category', count: { $sum: 1 }, avgResults: { $avg: '$resultsCount' } } },
                { $sort: { count: -1 } }
            ]),
            SearchHistory.aggregate([
                { $match: { createdAt: { $gte: startDate } } },
                { $group: { _id: '$deviceType', count: { $sum: 1 } } }
            ]),
            SearchHistory.aggregate([
                { $match: { createdAt: { $gte: startDate }, convertedToOrder: true } },
                { $group: { _id: null, conversions: { $sum: 1 }, revenue: { $sum: '$orderTotal' } } }
            ]),
            TrendingSearch.aggregate([
                { $match: { isActive: true } },
                { $project: { query: 1, count: 1, growthRate: 1 } },
                { $sort: { growthRate: -1 } },
                { $limit: 10 }
            ])
        ]);
        
        res.json({
            success: true,
            data: {
                overview: {
                    totalSearches: totalSearches,
                    zeroResultsRate: zeroResultsRate[0]?.rate || 0,
                    conversionRate: conversionMetrics[0] ? (conversionMetrics[0].conversions / conversionMetrics[0].totalSearches * 100) : 0,
                    avgResponseTime: 0 // Would need to track
                },
                topQueries,
                zeroResultsQueries,
                topCategories,
                searchByDevice: searchByDevice.reduce((acc, d) => ({ ...acc, [d._id]: d.count }), {}),
                trendingGrowth
            }
        });
    } catch (err) {
        console.error('Search analytics error:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch analytics' });
    }
});

// GET /api/admin/search/keywords – Manage search synonyms/keywords
router.get('/admin/search/keywords', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { page = 1, limit = 50, search } = req.query;
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        const skip = (pageNum - 1) * limitNum;
        
        const filter = {};
        if (search) {
            filter.$or = [
                { term: { $regex: escapeRegex(search), $options: 'i' } },
                { synonyms: { $in: [new RegExp(escapeRegex(search), 'i')] } }
            ];
        }
        
        const [keywords, total] = await Promise.all([
            SearchSynonym.find(filter).sort({ usageCount: -1, createdAt: -1 }).skip(skip).limit(limitNum).lean(),
            SearchSynonym.countDocuments(filter)
        ]);
        
        res.json({
            success: true,
            data: keywords,
            pagination: { page: parseInt(page), limit: limitNum, total, pages: Math.ceil(total / limitNum) }
        });
    } catch (err) {
        console.error('Get search keywords error:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch search keywords' });
    }
});

// POST /api/admin/search/keywords – Create synonym
router.post('/admin/search/keywords', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { term, synonyms, autoGenerated = false } = req.body;
        
        if (!term || !synonyms || !Array.isArray(synonyms)) {
            return res.status(400).json({ success: false, message: 'Term and synonyms array required' });
        }
        
        const existing = await SearchSynonym.findOne({ term: term.toLowerCase().trim() });
        if (existing) {
            return res.status(400).json({ success: false, message: 'Synonym for this term already exists' });
        }
        
        const synonym = await SearchSynonym.create({
            term: term.toLowerCase().trim(),
            synonyms: synonyms.map(s => s.toLowerCase().trim()).filter(Boolean),
            autoGenerated: false,
            createdBy: req.user.id
        });
        
        res.status(201).json({ success: true, data: synonym });
    } catch (err) {
        console.error('Create synonym error:', err);
        res.status(500).json({ success: false, message: 'Failed to create synonym' });
    }
});

// PUT /api/admin/search/keywords/:id – Update synonym
router.put('/admin/search/keywords/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { term, synonyms, isActive } = req.body;
        
        const synonym = await SearchSynonym.findByIdAndUpdate(
            req.params.id,
            { 
                ...(term && { term: term.toLowerCase().trim() }),
                ...(synonyms && { synonyms: synonyms.map(s => s.toLowerCase().trim()).filter(Boolean) }),
                ...(isActive !== undefined && { isActive })
            },
            { new: true, runValidators: true }
        );
        
        if (!synonym) {
            return res.status(404).json({ success: false, message: 'Synonym not found' });
        }
        
        res.json({ success: true, data: synonym });
    } catch (err) {
        console.error('Update synonym error:', err);
        res.status(500).json({ success: false, message: 'Failed to update synonym' });
    }
});

// DELETE /api/admin/search/keywords/:id – Delete synonym
router.delete('/admin/search/keywords/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const synonym = await SearchSynonym.findByIdAndDelete(req.params.id);
        if (!synonym) {
            return res.status(404).json({ success: false, message: 'Synonym not found' });
        }
        res.json({ success: true, message: 'Synonym deleted' });
    } catch (err) {
        console.error('Delete synonym error:', err);
        res.status(500).json({ success: false, message: 'Failed to delete synonym' });
    }
});

// POST /api/admin/search/rebuild-index – Rebuild search index
router.post('/admin/search/rebuild-index', authenticateToken, requireAdmin, async (req, res) => {
    try {
        // This would typically trigger a background job
        // For now, we'll just return success
        res.json({ 
            success: true, 
            message: 'Search index rebuild initiated',
            jobId: `rebuild_${Date.now()}`
        });
    } catch (err) {
        console.error('Rebuild index error:', err);
        res.status(500).json({ success: false, message: 'Failed to rebuild index' });
    }
});

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function buildComparisonMatrix(products) {
    if (!products.length) return {};
    
    const matrix = {};
    const allKeys = new Set();
    
    // Collect all possible attributes
    for (const p of products) {
        allKeys.add('name');
        allKeys.add('brand');
        allKeys.add('category');
        allKeys.add('price');
        allKeys.add('originalPrice');
        allKeys.add('discount');
        allKeys.add('rating');
        allKeys.add('stock');
        allKeys.add('images');
        allKeys.add('description');
        allKeys.add('shortDescription');
        allKeys.add('sku');
        allKeys.add('gender');
        allKeys.add('material');
        allKeys.add('colors');
        allKeys.add('sizes');
        allKeys.add('specifications');
        allKeys.add('tags');
        allKeys.add('features');
    }
    
    for (const key of allKeys) {
        matrix[key] = products.map(p => p[key] || '—');
    }
    
    return matrix;
}

async function updateProductAffinities(userId, productId, action) {
    try {
        const Cart = require('../models/Cart');
        const Order = require('../models/Order');
        
        // For co-purchase: find orders with this product and update affinities
        if (action === 'purchase') {
            const orders = await Order.find({ 
                'items.productId': productId,
                'paymentDetails.paymentStatus': 'completed'
            }).populate('items.productId').lean();
            
            for (const order of orders) {
                for (const item of order.items) {
                    if (item.productId.toString() !== productId.toString()) {
                        await ProductAffinity.findOneAndUpdate(
                            { productId, relatedProductId: item.productId },
                            { 
                                $inc: { coOccurrenceCount: 1, orderCount: 1, strength: 0.1 },
                                $setOnInsert: { affinityType: 'co-purchase' },
                                $max: { strength: 1 }
                            },
                            { upsert: true }
                        );
                    }
                }
            }
        }
        
        // For co-view: update view affinity
        if (action === 'click' || action === 'view') {
            const carts = await Cart.find({ 'items.productId': productId }).lean();
            for (const cart of carts) {
                for (const item of cart.items) {
                    if (item.productId.toString() !== productId.toString()) {
                        await ProductAffinity.findOneAndUpdate(
                            { productId, relatedProductId: item.productId },
                            { 
                                $inc: { coOccurrenceCount: 1, viewCount: 1, strength: 0.05 },
                                $setOnInsert: { affinityType: 'co-view' },
                                $max: { strength: 1 }
                            },
                            { upsert: true }
                        );
                    }
                }
            }
        }
    } catch (err) {
        console.error('Update product affinities error:', err);
    }
}

module.exports = router;