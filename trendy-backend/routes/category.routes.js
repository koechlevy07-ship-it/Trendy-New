const express = require('express');
const router = express.Router();
const Category = require('../models/Category');
const Product = require('../models/Product');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
function escapeRegex(str) { return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// Helper: attach product counts
async function attachCounts(categories) {
    return Promise.all(categories.map(async (c) => {
        const count = await Product.countDocuments({ category: c.slug });
        return { ...c.toObject ? c.toObject() : c, productCount: count };
    }));
}

// GET /api/categories – public
router.get('/', async (req, res) => {
    try {
        const { search, status, featured, parent, sort, page = 1, limit = 200 } = req.query;
        const filter = {};
        if (status) filter.status = status;
        if (featured !== undefined && featured !== '') filter.featured = featured === 'true';
        if (parent === 'null') filter.parent = null;
        else if (parent) filter.parent = parent;
        if (search) {
            const s = escapeRegex(search);
            filter.$or = [
                { name: { $regex: s, $options: 'i' } },
                { slug: { $regex: s, $options: 'i' } },
                { description: { $regex: s, $options: 'i' } }
            ];
        }
        let sortOption = { displayOrder: 1, name: 1 };
        if (sort === 'name') sortOption = { name: 1 };
        else if (sort === '-name') sortOption = { name: -1 };
        else if (sort === 'newest') sortOption = { createdAt: -1 };
        else if (sort === 'oldest') sortOption = { createdAt: 1 };
        else if (sort === 'products') sortOption = { productCount: -1 };
        else if (sort === 'order') sortOption = { displayOrder: 1, name: 1 };
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(500, Math.max(1, parseInt(limit)));
        const [categories, total] = await Promise.all([
            Category.find(filter).sort(sortOption).skip((pageNum - 1) * limitNum).limit(limitNum).populate('parent', 'name slug'),
            Category.countDocuments(filter)
        ]);
        const withCount = await attachCounts(categories);
        res.json({ success: true, data: withCount, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// GET /api/categories/tree – public, returns full hierarchy tree
router.get('/tree', async (req, res) => {
    try {
        const all = await Category.find({ status: { $ne: 'archived' } }).sort({ displayOrder: 1, name: 1 }).populate('parent', 'name slug').lean();
        const withCount = await attachCounts(all);
        const map = {}; const roots = [];
        withCount.forEach(c => { map[c._id] = { ...c, children: [] }; });
        withCount.forEach(c => {
            if (c.parent && map[c.parent._id || c.parent]) map[c.parent._id || c.parent].children.push(map[c._id]);
            else if (!c.parent) roots.push(map[c._id]);
        });
        res.json({ success: true, data: roots });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// GET /api/admin/categories/stats – admin only
router.get('/stats', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [total, published, hidden, featured, withParent, subcategories, withProducts, empty] = await Promise.all([
            Category.countDocuments(),
            Category.countDocuments({ status: 'published' }),
            Category.countDocuments({ status: 'hidden' }),
            Category.countDocuments({ featured: true }),
            Category.countDocuments({ parent: { $ne: null } }),
            Category.countDocuments({ parent: { $ne: null } }),
            Category.countDocuments(),
            (async () => {
                const all = await Category.find({}).lean();
                let count = 0;
                for (const c of all) {
                    const pc = await Product.countDocuments({ category: c.slug });
                    if (pc === 0) count++;
                }
                return count;
            })()
        ]);
        res.json({ success: true, data: { total, published, hidden, featured, withParent, subcategories, withProducts: total - empty, empty } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch stats' });
    }
});

// GET /api/categories/:id
router.get('/:id', async (req, res) => {
    try {
        const category = await Category.findById(req.params.id).populate('parent', 'name slug');
        if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
        const count = await Product.countDocuments({ category: category.slug });
        res.json({ success: true, data: { ...category.toJSON(), productCount: count } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// POST /api/categories – admin only
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { name, slug, description, shortDescription, parent, image, bannerImage, mobileBanner, tabletBanner, icon, featured, isTrending, isSeasonal, seasonalLabel, showOnHomepage, showInNavigation, showInMegaMenu, showInMobileMenu, status, displayOrder, seoTitle, seoDescription, seoKeywords, ogImage, canonicalUrl } = req.body;
        if (!name) return res.status(400).json({ success: false, message: 'Name is required' });
        const finalSlug = slug || name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        const existing = await Category.findOne({ slug: finalSlug });
        if (existing) return res.status(400).json({ success: false, message: 'Slug already exists' });
        if (parent) {
            const parentCat = await Category.findById(parent);
            if (!parentCat) return res.status(400).json({ success: false, message: 'Parent category not found' });
        }
        const toBool = v => v === true || v === 'true';
        const category = new Category({
            name: name.trim(),
            slug: finalSlug,
            description: description || '',
            shortDescription: shortDescription || '',
            parent: parent || null,
            image: image || '',
            bannerImage: bannerImage || '',
            mobileBanner: mobileBanner || '',
            tabletBanner: tabletBanner || '',
            icon: icon || 'fa-tag',
            featured: toBool(featured),
            isTrending: toBool(isTrending),
            isSeasonal: toBool(isSeasonal),
            seasonalLabel: seasonalLabel || '',
            showOnHomepage: toBool(showOnHomepage),
            showInNavigation: toBool(showInNavigation),
            showInMegaMenu: toBool(showInMegaMenu),
            showInMobileMenu: toBool(showInMobileMenu),
            status: status || 'published',
            displayOrder: displayOrder !== undefined ? parseInt(displayOrder) : 0,
            seoTitle: seoTitle || '',
            seoDescription: seoDescription || '',
            seoKeywords: Array.isArray(seoKeywords) ? seoKeywords : (typeof seoKeywords === 'string' ? seoKeywords.split(',').map(s => s.trim()).filter(Boolean) : []),
            ogImage: ogImage || '',
            canonicalUrl: canonicalUrl || ''
        });
        await category.save();
        res.status(201).json({ success: true, data: category });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// PUT /api/categories/reorder
router.put('/reorder', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids)) return res.status(400).json({ success: false, message: 'Invalid ids' });
        for (let i = 0; i < ids.length; i++) {
            await Category.findByIdAndUpdate(ids[i], { displayOrder: i });
        }
        res.json({ success: true, message: 'Reordered successfully' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// PUT /api/categories/bulk-update – admin only
router.put('/bulk-update', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { ids, updates } = req.body;
        if (!ids || !Array.isArray(ids) || !ids.length) return res.status(400).json({ success: false, message: 'No categories selected' });
        const allowed = ['status', 'featured', 'isTrending', 'isSeasonal', 'showOnHomepage', 'showInNavigation', 'showInMegaMenu', 'showInMobileMenu', 'displayOrder'];
        const safe = {};
        for (const key of allowed) {
            if (updates[key] !== undefined) safe[key] = updates[key];
        }
        const result = await Category.updateMany({ _id: { $in: ids } }, { $set: safe });
        res.json({ success: true, message: `${result.modifiedCount} categories updated` });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// DELETE /api/categories/bulk-delete – admin only
router.delete('/bulk-delete', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids) || !ids.length) return res.status(400).json({ success: false, message: 'No categories selected' });
        const result = await Category.deleteMany({ _id: { $in: ids } });
        res.json({ success: true, message: `${result.deletedCount} categories deleted` });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// POST /api/categories/upload-banner – admin only
router.post('/upload-banner', authenticateToken, requireAdmin, upload.single('banner'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'No file provided' });
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (!allowed.includes(req.file.mimetype)) return res.status(400).json({ success: false, message: 'Only JPEG, PNG, WebP, GIF allowed' });
        const b64 = Buffer.from(req.file.buffer).toString('base64');
        const dataUri = `data:${req.file.mimetype};base64,${b64}`;
        const result = await cloudinary.uploader.upload(dataUri, { folder: 'categories', transformation: { quality: 'auto', fetch_format: 'auto' } });
        res.json({ success: true, url: result.secure_url });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Upload failed' });
    }
});

// POST /api/categories/import – admin only
router.post('/import', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { categories: importData, updateExisting } = req.body;
        if (!importData || !Array.isArray(importData) || !importData.length) return res.status(400).json({ success: false, message: 'No data provided' });
        const results = { created: 0, updated: 0, errors: [] };
        for (let i = 0; i < importData.length; i++) {
            const row = importData[i];
            try {
                if (!row.name) { results.errors.push({ row: i + 1, message: 'Name is required' }); continue; }
                const slug = row.slug || row.name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
                const existing = await Category.findOne({ slug });
                const data = {
                    name: row.name.trim(), slug, description: row.description || '',
                    image: row.image || '', bannerImage: row.bannerImage || '',
                    featured: row.featured === 'true' || row.featured === 'yes',
                    status: row.status || 'published', displayOrder: parseInt(row.displayOrder) || 0,
                    showOnHomepage: row.showOnHomepage !== 'false',
                    showInNavigation: row.showInNavigation !== 'false',
                    seoTitle: row.seoTitle || '', seoDescription: row.seoDescription || ''
                };
                if (existing && updateExisting) { await Category.findByIdAndUpdate(existing._id, data); results.updated++; }
                else if (existing) { results.errors.push({ row: i + 1, message: `Duplicate slug: ${slug}` }); continue; }
                else { await new Category(data).save(); results.created++; }
            } catch (err) { results.errors.push({ row: i + 1, message: err.message }); }
        }
        res.json({ success: true, data: results, message: `${results.created} created, ${results.updated} updated, ${results.errors.length} errors` });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Import failed' });
    }
});

// POST /api/categories/:id/duplicate – admin only
router.post('/:id/duplicate', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const original = await Category.findById(req.params.id);
        if (!original) return res.status(404).json({ success: false, message: 'Category not found' });
        const newCat = new Category({
            ...original.toObject(), _id: undefined, __v: undefined,
            createdAt: undefined, updatedAt: undefined,
            name: `Copy of ${original.name}`,
            slug: `${original.slug}-copy-${Date.now().toString(36)}`,
            displayOrder: 0
        });
        await newCat.save();
        res.json({ success: true, data: newCat });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// POST /api/categories/bulk – legacy bulk action (for backward compat)
router.post('/bulk', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { action, ids } = req.body;
        if (!ids || !Array.isArray(ids) || !ids.length) return res.status(400).json({ success: false, message: 'No categories selected' });
        let update = {};
        if (action === 'publish') update.status = 'published';
        else if (action === 'hide') update.status = 'hidden';
        else if (action === 'feature') update.featured = true;
        else if (action === 'unfeature') update.featured = false;
        else if (action === 'delete') { await Category.deleteMany({ _id: { $in: ids } }); return res.json({ success: true, message: 'Categories deleted' }); }
        await Category.updateMany({ _id: { $in: ids } }, update);
        res.json({ success: true, message: `Bulk ${action} successful` });
    } catch (err) { res.status(500).json({ success: false, message: 'Internal server error' }); }
});

// PUT /api/categories/:id – admin only (MUST be after /stats, /tree, /bulk-update, /bulk-delete, /upload-banner, /import, /bulk)
router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { name, slug, description, shortDescription, parent, image, bannerImage, mobileBanner, tabletBanner, icon, featured, isTrending, isSeasonal, seasonalLabel, showOnHomepage, showInNavigation, showInMegaMenu, showInMobileMenu, status, displayOrder, seoTitle, seoDescription, seoKeywords, ogImage, canonicalUrl } = req.body;
        const category = await Category.findById(req.params.id);
        if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
        const toBool = v => v === true || v === 'true';
        if (name !== undefined) category.name = name.trim();
        if (slug !== undefined) {
            const existing = await Category.findOne({ slug, _id: { $ne: req.params.id } });
            if (existing) return res.status(400).json({ success: false, message: 'Slug already in use' });
            category.slug = slug;
        } else if (name) category.slug = name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        if (description !== undefined) category.description = description;
        if (shortDescription !== undefined) category.shortDescription = shortDescription;
        if (parent !== undefined) {
            if (parent && parent !== req.params.id) {
                const parentCat = await Category.findById(parent);
                if (!parentCat) return res.status(400).json({ success: false, message: 'Parent category not found' });
                category.parent = parent;
            } else { category.parent = null; }
        }
        if (image !== undefined) category.image = image;
        if (bannerImage !== undefined) category.bannerImage = bannerImage;
        if (mobileBanner !== undefined) category.mobileBanner = mobileBanner;
        if (tabletBanner !== undefined) category.tabletBanner = tabletBanner;
        if (icon !== undefined) category.icon = icon;
        if (featured !== undefined) category.featured = toBool(featured);
        if (isTrending !== undefined) category.isTrending = toBool(isTrending);
        if (isSeasonal !== undefined) category.isSeasonal = toBool(isSeasonal);
        if (seasonalLabel !== undefined) category.seasonalLabel = seasonalLabel;
        if (showOnHomepage !== undefined) category.showOnHomepage = toBool(showOnHomepage);
        if (showInNavigation !== undefined) category.showInNavigation = toBool(showInNavigation);
        if (showInMegaMenu !== undefined) category.showInMegaMenu = toBool(showInMegaMenu);
        if (showInMobileMenu !== undefined) category.showInMobileMenu = toBool(showInMobileMenu);
        if (status !== undefined) category.status = status;
        if (displayOrder !== undefined) category.displayOrder = parseInt(displayOrder);
        if (seoTitle !== undefined) category.seoTitle = seoTitle;
        if (seoDescription !== undefined) category.seoDescription = seoDescription;
        if (seoKeywords !== undefined) category.seoKeywords = Array.isArray(seoKeywords) ? seoKeywords : (typeof seoKeywords === 'string' ? seoKeywords.split(',').map(s => s.trim()).filter(Boolean) : []);
        if (ogImage !== undefined) category.ogImage = ogImage;
        if (canonicalUrl !== undefined) category.canonicalUrl = canonicalUrl;
        await category.save();
        res.json({ success: true, data: category });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// PUT /api/categories/:id/status – toggle
router.put('/:id/status', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const category = await Category.findById(req.params.id);
        if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
        category.status = category.status === 'published' ? 'hidden' : 'published';
        await category.save();
        res.json({ success: true, data: category });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// DELETE /api/categories/:id – admin only
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        // Unset parent for children
        await Category.updateMany({ parent: req.params.id }, { parent: null });
        const category = await Category.findByIdAndDelete(req.params.id);
        if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
        res.json({ success: true, message: 'Category deleted' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

module.exports = router;
