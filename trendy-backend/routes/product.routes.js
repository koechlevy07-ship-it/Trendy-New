const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const Category = require('../models/Category');
const Review = require('../models/Review');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const uploadMemory = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');
function escapeRegex(str) { return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

async function deleteCloudinaryImages(urls) {
    if (!urls || !Array.isArray(urls)) return;
    for (const url of urls) {
        if (!url || !url.includes('cloudinary.com')) continue;
        try {
            const parts = url.split('/');
            const uploadIdx = parts.indexOf('upload');
            if (uploadIdx === -1) continue;
            const publicIdWithExt = parts.slice(uploadIdx + 1).join('/');
            const publicId = publicIdWithExt.replace(/\.[^.]+$/, '');
            await cloudinary.uploader.destroy(publicId);
        } catch (e) { /* ignore */ }
    }
}

// ============================================================
// PUBLIC ROUTES
// ============================================================

// GET /api/products – list products with advanced filtering, sorting, pagination
router.get('/', async (req, res) => {
    try {
        const {
            category, gender, search, featured, newArrival, bestSeller,
            flashSale, sponsored, brand, material, minPrice, maxPrice,
            minRating, sortBy, page = 1, limit = 20, status
        } = req.query;

        const filter = {};

        // Admin can see all statuses; public only published
        const isAdmin = req.user && req.user.role === 'admin';
        if (status && isAdmin) {
            filter.status = status;
        } else {
            filter.status = 'published';
        }

        if (category && category !== 'all') filter.category = category;
        if (gender) filter.gender = gender;
        if (featured === 'true') filter.featured = true;
        if (newArrival === 'true') filter.isNewArrival = true;
        if (bestSeller === 'true') filter.isBestSeller = true;
        if (flashSale === 'true') { filter.flashSale = true; filter.flashSaleEnd = { $gt: new Date() }; }
        if (sponsored === 'true') filter.sponsored = true;
        if (brand) filter.brand = brand;
        if (material) filter.material = { $regex: escapeRegex(material), $options: 'i' };
        if (minPrice || maxPrice) {
            filter.price = {};
            if (minPrice) filter.price.$gte = parseFloat(minPrice);
            if (maxPrice) filter.price.$lte = parseFloat(maxPrice);
        }
        if (minRating) filter.rating = { $gte: parseFloat(minRating) };
        if (search) {
            const s = escapeRegex(search);
            filter.$or = [
                { name: { $regex: s, $options: 'i' } },
                { description: { $regex: s, $options: 'i' } },
                { brand: { $regex: s, $options: 'i' } },
                { tags: { $in: [new RegExp(s, 'i')] } }
            ];
        }

        // Sort
        let sort = { createdAt: -1 };
        switch (sortBy) {
            case 'price_asc': sort = { price: 1 }; break;
            case 'price_desc': sort = { price: -1 }; break;
            case 'rating': sort = { rating: -1 }; break;
            case 'popular': sort = { totalSold: -1 }; break;
            case 'newest': sort = { createdAt: -1 }; break;
            case 'name': sort = { name: 1 }; break;
        }

        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        const skip = (pageNum - 1) * limitNum;

        const [products, total] = await Promise.all([
            Product.find(filter).sort(sort).skip(skip).limit(limitNum).lean(),
            Product.countDocuments(filter)
        ]);

        res.json({
            success: true,
            data: products,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                pages: Math.ceil(total / limitNum)
            }
        });
    } catch (err) {
        console.error('❌ GET /products error:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// GET /api/products/featured – featured products
router.get('/featured', async (req, res) => {
    try {
        const limit = Math.min(20, parseInt(req.query.limit) || 10);
        const products = await Product.find({ featured: true, status: 'published' })
            .sort({ createdAt: -1 }).limit(limit).lean();
        res.json({ success: true, data: products });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// GET /api/products/new-arrivals – new arrivals
router.get('/new-arrivals', async (req, res) => {
    try {
        const limit = Math.min(20, parseInt(req.query.limit) || 10);
        const products = await Product.find({ isNewArrival: true, status: 'published' })
            .sort({ createdAt: -1 }).limit(limit).lean();
        res.json({ success: true, data: products });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// GET /api/products/best-sellers – best sellers
router.get('/best-sellers', async (req, res) => {
    try {
        const limit = Math.min(20, parseInt(req.query.limit) || 10);
        const products = await Product.find({ isBestSeller: true, status: 'published' })
            .sort({ totalSold: -1 }).limit(limit).lean();
        res.json({ success: true, data: products });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// GET /api/products/flash-sale – active flash sales
router.get('/flash-sale', async (req, res) => {
    try {
        const products = await Product.find({
            flashSale: true,
            flashSaleEnd: { $gt: new Date() },
            status: 'published'
        }).sort({ flashSaleEnd: 1 }).lean();
        res.json({ success: true, data: products });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// GET /api/products/trending – trending (by recent sales + views)
router.get('/trending', async (req, res) => {
    try {
        const limit = Math.min(20, parseInt(req.query.limit) || 10);
        const products = await Product.find({ status: 'published', soldOut: false })
            .sort({ totalSold: -1, rating: -1, createdAt: -1 })
            .limit(limit).lean();
        res.json({ success: true, data: products });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// GET /api/products/search – full-text search
router.get('/search', async (req, res) => {
    try {
        const { q, page = 1, limit = 20 } = req.query;
        if (!q || !q.trim()) {
            return res.json({ success: true, data: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } });
        }

        const sq = escapeRegex(q);
        const filter = {
            status: 'published',
            $or: [
                { name: { $regex: sq, $options: 'i' } },
                { description: { $regex: sq, $options: 'i' } },
                { brand: { $regex: sq, $options: 'i' } },
                { tags: { $in: [new RegExp(sq, 'i')] } },
                { category: { $regex: sq, $options: 'i' } }
            ]
        };

        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        const skip = (pageNum - 1) * limitNum;

        const [products, total] = await Promise.all([
            Product.find(filter).sort({ rating: -1, totalSold: -1 }).skip(skip).limit(limitNum).lean(),
            Product.countDocuments(filter)
        ]);

        res.json({
            success: true,
            data: products,
            pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// GET /api/products/filter – advanced filter with aggregations
router.get('/filter', async (req, res) => {
    try {
        const { category, gender } = req.query;
        const match = { status: 'published' };
        if (category) match.category = category;
        if (gender) match.gender = gender;

        const [priceRange, brands, categories, materials] = await Promise.all([
            Product.aggregate([
                { $match: match },
                { $group: { _id: null, min: { $min: '$price' }, max: { $max: '$price' } } }
            ]),
            Product.distinct('brand', match),
            Product.distinct('category', match),
            Product.distinct('material', match)
        ]);

        res.json({
            success: true,
            data: {
                priceRange: priceRange[0] || { min: 0, max: 0 },
                brands: brands.filter(Boolean),
                categories: categories.filter(Boolean),
                materials: materials.filter(Boolean)
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// GET /api/products/recommended/:id – recommended products (same category, exclude current)
router.get('/recommended/:id', async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

        const limit = Math.min(10, parseInt(req.query.limit) || 6);
        const products = await Product.find({
            _id: { $ne: product._id },
            category: product.category,
            gender: product.gender,
            status: 'published'
        }).sort({ rating: -1, totalSold: -1 }).limit(limit).lean();

        res.json({ success: true, data: products });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// GET /api/products/related/:id – related products (from relatedProducts array, fallback to category)
router.get('/related/:id', async (req, res) => {
    try {
        const product = await Product.findById(req.params.id).populate('relatedProducts');
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

        let related = (product.relatedProducts || []).filter(p => p && p.status === 'published');

        // Fallback: fill with same-category products if not enough
        if (related.length < 6) {
            const existingIds = [product._id, ...related.map(p => p._id)];
            const more = await Product.find({
                _id: { $nin: existingIds },
                category: product.category,
                status: 'published'
            }).sort({ rating: -1 }).limit(6 - related.length).lean();
            related = [...related, ...more];
        }

        res.json({ success: true, data: related.slice(0, 6) });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// GET /api/products/brands – list distinct brands
router.get('/brands', async (req, res) => {
    try {
        const brands = await Product.distinct('brand', { status: 'published', brand: { $ne: '' } });
        res.json({ success: true, data: brands.sort() });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// GET /api/products/slug/:slug – get product by slug
router.get('/slug/:slug', async (req, res) => {
    try {
        const product = await Product.findOne({ slug: req.params.slug, status: 'published' });
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
        res.json({ success: true, data: product });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// GET /api/products/:id – single product by ID (public)
router.get('/:id', async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
        res.json({ success: true, data: product });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ============================================================
// ADMIN ROUTES
// ============================================================

// POST /api/products – create product (admin)
router.post('/', authenticateToken, requireAdmin, validate(schemas.product), async (req, res) => {
    try {
        const {
            name, slug, description, shortDescription, price, originalPrice, stock, stockThreshold,
            sku, brand, material, category, gender, thumbnail, images, gallery, images360,
            sizes, colors, colorSwatches, specifications, tags, relatedProducts,
            limitedPieces, limitedAvailable, preOrder, soldOut, deliveryEstimate, featured, isNewArrival, isBestSeller,
            flashSale, flashSalePrice, flashSaleEnd, sponsored, installmentEligible, installmentPrice,
            visibility, status,
            barcode, subcategory, collection, ageGroup,
            discountType, discountValue, discountStart, discountEnd,
            allowBackorders, reservedStock, isTrending, isLimitedEdition,
            isScheduled, scheduledPublishDate,
            seoTitle, seoDescription, seoKeywords, ogImage, canonicalUrl
        } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, message: 'Product name is required' });
        }
        if (price === undefined || price === null || isNaN(price) || price < 0) {
            return res.status(400).json({ success: false, message: 'Valid price is required' });
        }

        const sanitizeArray = (value) => {
            if (!value) return [];
            if (Array.isArray(value)) return value.filter(v => v && String(v).trim());
            if (typeof value === 'string') return value.split(',').map(s => s.trim()).filter(Boolean);
            return [];
        };

        const toBool = (v) => v === true || v === 'true';
        const slugBase = slug || name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

        const productData = {
            name: name.trim(),
            slug: slugBase,
            description: description || '',
            shortDescription: shortDescription || '',
            price: parseFloat(price),
            originalPrice: originalPrice ? parseFloat(originalPrice) : null,
            stock: stock ? parseInt(stock) : 0,
            stockThreshold: stockThreshold ? parseInt(stockThreshold) : 5,
            sku: sku ? sku.trim() : undefined,
            brand: brand ? brand.trim() : '',
            material: material ? material.trim() : '',
            category: category || '',
            gender: gender || 'unisex',
            thumbnail: thumbnail || (sanitizeArray(images).length > 0 ? sanitizeArray(images)[0] : ''),
            images: sanitizeArray(images),
            gallery: sanitizeArray(gallery),
            images360: sanitizeArray(images360),
            sizes: sanitizeArray(sizes),
            colors: sanitizeArray(colors),
            colorSwatches: Array.isArray(colorSwatches) ? colorSwatches : [],
            specifications: Array.isArray(specifications) ? specifications : [],
            tags: sanitizeArray(tags),
            relatedProducts: Array.isArray(relatedProducts) ? relatedProducts : [],
            limitedPieces: limitedPieces ? parseInt(limitedPieces) : 0,
            limitedAvailable: toBool(limitedAvailable),
            preOrder: toBool(preOrder),
            soldOut: toBool(soldOut),
            deliveryEstimate: deliveryEstimate || '2-5 business days',
            featured: toBool(featured),
            isNewArrival: toBool(isNewArrival),
            isBestSeller: toBool(isBestSeller),
            flashSale: toBool(flashSale),
            flashSalePrice: flashSalePrice ? parseFloat(flashSalePrice) : null,
            flashSaleEnd: flashSaleEnd || null,
            sponsored: toBool(sponsored),
            installmentEligible: toBool(installmentEligible),
            installmentPrice: installmentPrice ? parseFloat(installmentPrice) : null,
            visibility: visibility || 'visible',
            status: status || 'published',
            inStock: toBool(soldOut) ? false : ((parseInt(stock) > 0) || toBool(preOrder) || toBool(limitedAvailable) || (parseInt(limitedPieces) > 0)),
            // New fields
            barcode: barcode || '',
            subcategory: subcategory || '',
            collection: collection || '',
            ageGroup: ageGroup || '',
            discountType: discountType || '',
            discountValue: discountValue ? parseFloat(discountValue) : null,
            discountStart: discountStart || null,
            discountEnd: discountEnd || null,
            allowBackorders: toBool(allowBackorders),
            reservedStock: reservedStock ? parseInt(reservedStock) : 0,
            isTrending: toBool(isTrending),
            isLimitedEdition: toBool(isLimitedEdition),
            isScheduled: toBool(isScheduled),
            scheduledPublishDate: scheduledPublishDate || null,
            seoTitle: seoTitle || '',
            seoDescription: seoDescription || '',
            seoKeywords: sanitizeArray(seoKeywords),
            ogImage: ogImage || '',
            canonicalUrl: canonicalUrl || ''
        };

        const product = new Product(productData);
        await product.save();
        res.status(201).json({ success: true, data: product });
    } catch (err) {
        console.error('❌ POST /products error:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// PUT /api/products/bulk – bulk update products (admin)
router.put('/bulk/update', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { ids, updates } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, message: 'Product IDs required' });
        }
        if (!updates || typeof updates !== 'object') {
            return res.status(400).json({ success: false, message: 'Updates object required' });
        }

        // Only allow safe fields to be bulk-updated
        const allowedFields = ['status', 'featured', 'isNewArrival', 'isBestSeller', 'category', 'gender', 'visibility', 'flashSale', 'sponsored', 'stock'];
        const safeUpdates = {};
        for (const key of allowedFields) {
            if (updates[key] !== undefined) safeUpdates[key] = updates[key];
        }

        const result = await Product.updateMany({ _id: { $in: ids } }, { $set: safeUpdates });
        res.json({ success: true, message: `${result.modifiedCount} products updated`, data: { modifiedCount: result.modifiedCount } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// DELETE /api/products/bulk – bulk delete products (admin)
router.delete('/bulk/delete', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, message: 'Product IDs required' });
        }
        const products = await Product.find({ _id: { $in: ids } });
        for (const p of products) {
            const allImages = [p.thumbnail, ...(p.images || []), ...(p.gallery || []), ...(p.images360 || [])].filter(Boolean);
            deleteCloudinaryImages(allImages);
        }
        const result = await Product.deleteMany({ _id: { $in: ids } });
        res.json({ success: true, message: `${result.deletedCount} products deleted`, data: { deletedCount: result.deletedCount } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// PUT /api/products/:id/stock – quick stock update (admin)
router.put('/:id/stock', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { stock, operation } = req.body;
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

        let newStock;
        if (operation === 'set') {
            newStock = Math.max(0, parseInt(stock) || 0);
        } else if (operation === 'increment') {
            newStock = Math.max(0, product.stock + (parseInt(stock) || 0));
        } else {
            newStock = Math.max(0, parseInt(stock) || 0);
        }

        const update = { stock: newStock };
        if (newStock > 0) {
            update.inStock = true;
            update.soldOut = false;
        } else if (!product.preOrder && !product.limitedAvailable) {
            update.inStock = false;
            update.soldOut = true;
        }

        const updated = await Product.findByIdAndUpdate(req.params.id, update, { new: true });
        res.json({ success: true, data: updated });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// PUT /api/products/:id – update product (admin)
router.put('/:id', authenticateToken, requireAdmin, validate(schemas.product), async (req, res) => {
    try {
        const {
            name, slug, description, shortDescription, price, originalPrice, stock, stockThreshold,
            sku, brand, material, category, gender, thumbnail, images, gallery, images360,
            sizes, colors, colorSwatches, specifications, tags, relatedProducts,
            limitedPieces, limitedAvailable, preOrder, soldOut, deliveryEstimate, featured, isNewArrival, isBestSeller,
            flashSale, flashSalePrice, flashSaleEnd, sponsored, installmentEligible, installmentPrice,
            visibility, status,
            barcode, subcategory, collection, ageGroup,
            discountType, discountValue, discountStart, discountEnd,
            allowBackorders, reservedStock, isTrending, isLimitedEdition,
            isScheduled, scheduledPublishDate,
            seoTitle, seoDescription, seoKeywords, ogImage, canonicalUrl
        } = req.body;

        const sanitizeArray = (value) => {
            if (!value) return [];
            if (Array.isArray(value)) return value.filter(v => v && String(v).trim());
            if (typeof value === 'string') return value.split(',').map(s => s.trim()).filter(Boolean);
            return [];
        };

        const toBool = (v) => v === true || v === 'true';

        const updateData = {};
        if (name !== undefined) updateData.name = name.trim();
        if (slug !== undefined) updateData.slug = slug;
        else if (name) updateData.slug = name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        if (description !== undefined) updateData.description = description;
        if (shortDescription !== undefined) updateData.shortDescription = shortDescription;
        if (price !== undefined) updateData.price = parseFloat(price);
        if (originalPrice !== undefined) updateData.originalPrice = originalPrice ? parseFloat(originalPrice) : null;
        if (stock !== undefined) { updateData.stock = parseInt(stock); updateData.inStock = parseInt(stock) > 0; }
        if (stockThreshold !== undefined) updateData.stockThreshold = parseInt(stockThreshold);
        if (sku !== undefined) updateData.sku = sku ? sku.trim() : undefined;
        if (brand !== undefined) updateData.brand = brand.trim();
        if (material !== undefined) updateData.material = material.trim();
        if (category !== undefined) updateData.category = category;
        if (gender !== undefined) updateData.gender = gender;
        if (thumbnail !== undefined) updateData.thumbnail = thumbnail;
        if (images !== undefined) {
            updateData.images = sanitizeArray(images);
            if (!thumbnail && updateData.images.length > 0) updateData.thumbnail = updateData.images[0];
        }
        if (gallery !== undefined) updateData.gallery = sanitizeArray(gallery);
        if (images360 !== undefined) updateData.images360 = sanitizeArray(images360);
        if (sizes !== undefined) updateData.sizes = sanitizeArray(sizes);
        if (colors !== undefined) updateData.colors = sanitizeArray(colors);
        if (colorSwatches !== undefined) updateData.colorSwatches = Array.isArray(colorSwatches) ? colorSwatches : [];
        if (specifications !== undefined) updateData.specifications = Array.isArray(specifications) ? specifications : [];
        if (tags !== undefined) updateData.tags = sanitizeArray(tags);
        if (relatedProducts !== undefined) updateData.relatedProducts = Array.isArray(relatedProducts) ? relatedProducts : [];
        if (limitedPieces !== undefined) updateData.limitedPieces = parseInt(limitedPieces);
        if (limitedAvailable !== undefined) updateData.limitedAvailable = toBool(limitedAvailable);
        if (preOrder !== undefined) updateData.preOrder = toBool(preOrder);
        if (soldOut !== undefined) updateData.soldOut = toBool(soldOut);
        if (deliveryEstimate !== undefined) updateData.deliveryEstimate = deliveryEstimate;
        if (featured !== undefined) updateData.featured = toBool(featured);
        if (isNewArrival !== undefined) updateData.isNewArrival = toBool(isNewArrival);
        if (isBestSeller !== undefined) updateData.isBestSeller = toBool(isBestSeller);
        if (flashSale !== undefined) updateData.flashSale = toBool(flashSale);
        if (flashSalePrice !== undefined) updateData.flashSalePrice = flashSalePrice ? parseFloat(flashSalePrice) : null;
        if (flashSaleEnd !== undefined) updateData.flashSaleEnd = flashSaleEnd || null;
        if (sponsored !== undefined) updateData.sponsored = toBool(sponsored);
        if (installmentEligible !== undefined) updateData.installmentEligible = toBool(installmentEligible);
        if (installmentPrice !== undefined) updateData.installmentPrice = installmentPrice ? parseFloat(installmentPrice) : null;
        if (visibility !== undefined) updateData.visibility = visibility;
        if (status !== undefined) updateData.status = status;
        // New fields
        if (barcode !== undefined) updateData.barcode = barcode;
        if (subcategory !== undefined) updateData.subcategory = subcategory;
        if (collection !== undefined) updateData.collection = collection;
        if (ageGroup !== undefined) updateData.ageGroup = ageGroup;
        if (discountType !== undefined) updateData.discountType = discountType;
        if (discountValue !== undefined) updateData.discountValue = discountValue ? parseFloat(discountValue) : null;
        if (discountStart !== undefined) updateData.discountStart = discountStart || null;
        if (discountEnd !== undefined) updateData.discountEnd = discountEnd || null;
        if (allowBackorders !== undefined) updateData.allowBackorders = toBool(allowBackorders);
        if (reservedStock !== undefined) updateData.reservedStock = parseInt(reservedStock);
        if (isTrending !== undefined) updateData.isTrending = toBool(isTrending);
        if (isLimitedEdition !== undefined) updateData.isLimitedEdition = toBool(isLimitedEdition);
        if (isScheduled !== undefined) updateData.isScheduled = toBool(isScheduled);
        if (scheduledPublishDate !== undefined) updateData.scheduledPublishDate = scheduledPublishDate || null;
        if (seoTitle !== undefined) updateData.seoTitle = seoTitle;
        if (seoDescription !== undefined) updateData.seoDescription = seoDescription;
        if (seoKeywords !== undefined) updateData.seoKeywords = sanitizeArray(seoKeywords);
        if (ogImage !== undefined) updateData.ogImage = ogImage;
        if (canonicalUrl !== undefined) updateData.canonicalUrl = canonicalUrl;

        // Recalculate inStock based on all relevant flags
        const finalStock = stock !== undefined ? parseInt(stock) : undefined;
        const finalSoldOut = soldOut !== undefined ? toBool(soldOut) : undefined;
        const finalPreOrder = preOrder !== undefined ? toBool(preOrder) : undefined;
        const finalLimitedAvail = limitedAvailable !== undefined ? toBool(limitedAvailable) : undefined;
        const finalLimitedPieces = limitedPieces !== undefined ? parseInt(limitedPieces) : undefined;

        if (finalStock !== undefined || finalSoldOut !== undefined || finalPreOrder !== undefined || finalLimitedAvail !== undefined || finalLimitedPieces !== undefined) {
            // Fetch current product to fill in any values we don't have
            const current = await Product.findById(req.params.id).lean();
            const s = finalStock !== undefined ? finalStock : (current?.stock || 0);
            const so = finalSoldOut !== undefined ? finalSoldOut : (current?.soldOut || false);
            const po = finalPreOrder !== undefined ? finalPreOrder : (current?.preOrder || false);
            const la = finalLimitedAvail !== undefined ? finalLimitedAvail : (current?.limitedAvailable || false);
            const lp = finalLimitedPieces !== undefined ? finalLimitedPieces : (current?.limitedPieces || 0);
            updateData.inStock = so ? false : (s > 0 || po || la || lp > 0);
        }

        const product = await Product.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
        res.json({ success: true, data: product });
    } catch (err) {
        console.error('❌ PUT /products/:id error:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// DELETE /api/products/:id – delete product (admin)
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const product = await Product.findByIdAndDelete(req.params.id);
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
        const allImages = [product.thumbnail, ...(product.images || []), ...(product.gallery || []), ...(product.images360 || [])].filter(Boolean);
        deleteCloudinaryImages(allImages);
        res.json({ success: true, message: 'Product deleted' });
    } catch (err) {
        console.error('❌ DELETE /products/:id error:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ============================================================
// ADDITIONAL ADMIN ROUTES
// ============================================================

// POST /api/products/duplicate/:id – duplicate a product
router.post('/duplicate/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const original = await Product.findById(req.params.id).lean();
        if (!original) return res.status(404).json({ success: false, message: 'Product not found' });

        const dup = { ...original };
        delete dup._id;
        delete dup.__v;
        delete dup.createdAt;
        delete dup.updatedAt;
        dup.name = original.name + ' (Copy)';
        dup.slug = original.slug + '-copy-' + Date.now();
        dup.sku = original.sku ? original.sku + '-COPY' : undefined;
        dup.status = 'draft';
        dup.featured = false;
        dup.isNewArrival = false;
        dup.isBestSeller = false;
        dup.sponsored = false;
        dup.flashSale = false;
        dup.isTrending = false;
        dup.isLimitedEdition = false;
        dup.totalSold = 0;
        dup.rating = 0;
        dup.totalReviews = 0;

        const product = new Product(dup);
        await product.save();
        res.status(201).json({ success: true, data: product });
    } catch (err) {
        console.error('❌ POST /products/duplicate error:', err);
        res.status(500).json({ success: false, message: 'Failed to duplicate product' });
    }
});

// POST /api/products/upload-images – upload multiple images to Cloudinary
router.post('/upload-images', authenticateToken, requireAdmin, uploadMemory.array('images', 10), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ success: false, message: 'No images provided' });
        }
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        const urls = [];

        for (const file of req.files) {
            if (!allowedTypes.includes(file.mimetype)) continue;
            const b64 = file.buffer.toString('base64');
            const dataUri = `data:${file.mimetype};base64,${b64}`;
            const result = await cloudinary.uploader.upload(dataUri, {
                folder: 'trendy_wardrobe/products',
                transformation: [{ quality: 'auto', fetch_format: 'auto' }]
            });
            urls.push(result.secure_url);
        }

        res.json({ success: true, data: { urls } });
    } catch (err) {
        console.error('❌ POST /products/upload-images error:', err);
        res.status(500).json({ success: false, message: 'Failed to upload images' });
    }
});

// POST /api/products/import – import products from CSV data
router.post('/import', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { products: importData } = req.body;
        if (!importData || !Array.isArray(importData) || importData.length === 0) {
            return res.status(400).json({ success: false, message: 'No product data provided' });
        }

        const results = { created: 0, updated: 0, errors: [] };
        const categories = await Category.find({}).lean();
        const catNames = categories.map(c => c.name);

        for (let i = 0; i < importData.length; i++) {
            const row = importData[i];
            try {
                if (!row.name || !row.price) {
                    results.errors.push({ row: i + 1, message: 'Missing required fields (name, price)' });
                    continue;
                }

                const slug = (row.name || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + Date.now();
                const images = row.images ? row.images.split('|').map(s => s.trim()).filter(s => s.startsWith('http')) : [];
                const cat = row.category && catNames.includes(row.category) ? row.category : '';

                const productData = {
                    name: row.name.trim(),
                    slug,
                    description: row.description || '',
                    shortDescription: row.shortDescription || '',
                    price: parseFloat(row.price) || 0,
                    originalPrice: row.originalPrice ? parseFloat(row.originalPrice) : null,
                    stock: parseInt(row.stock) || 0,
                    sku: row.sku ? row.sku.trim() : undefined,
                    brand: row.brand || '',
                    category: cat,
                    gender: row.gender || 'unisex',
                    images,
                    sizes: row.sizes ? row.sizes.split(',').map(s => s.trim()).filter(Boolean) : [],
                    colors: row.colors ? row.colors.split(',').map(s => s.trim()).filter(Boolean) : [],
                    tags: row.tags ? row.tags.split(',').map(s => s.trim()).filter(Boolean) : [],
                    material: row.material || '',
                    status: row.status || 'draft',
                    featured: row.featured === 'true' || row.featured === 'yes',
                    isNewArrival: row.isNewArrival === 'true' || row.isNewArrival === 'yes',
                    isBestSeller: row.isBestSeller === 'true' || row.isBestSeller === 'yes',
                    inStock: parseInt(row.stock) > 0
                };

                // Check for existing SKU
                if (productData.sku) {
                    const existing = await Product.findOne({ sku: productData.sku });
                    if (existing && req.body.updateExisting) {
                        await Product.findByIdAndUpdate(existing._id, productData, { new: true });
                        results.updated++;
                        continue;
                    } else if (existing) {
                        results.errors.push({ row: i + 1, message: `Duplicate SKU: ${productData.sku}` });
                        continue;
                    }
                }

                await new Product(productData).save();
                results.created++;
            } catch (err) {
                results.errors.push({ row: i + 1, message: err.message });
            }
        }

        res.json({
            success: true,
            data: results,
            message: `${results.created} created, ${results.updated} updated, ${results.errors.length} errors`
        });
    } catch (err) {
        console.error('❌ POST /products/import error:', err);
        res.status(500).json({ success: false, message: 'Import failed' });
    }
});

module.exports = router;
