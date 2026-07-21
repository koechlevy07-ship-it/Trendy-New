const express = require('express');
const router = express.Router();
const FAQ = require('../models/FAQ');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================================
// PUBLIC ROUTES
// ============================================================

// GET /api/faq – list published FAQs with optional category filter
router.get('/', async (req, res) => {
    try {
        const { category, search, limit = 50 } = req.query;
        const filter = { isPublished: true };
        if (category && category !== 'all') filter.category = category;
        if (search) {
            const safe = escapeRegex(search);
            filter.$text = { $search: safe };
        }
        const faqs = await FAQ.find(filter)
            .sort({ category: 1, displayOrder: 1, createdAt: -1 })
            .limit(parseInt(limit))
            .select('question answer category tags displayOrder');
        res.json({ success: true, data: faqs });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// GET /api/faq/categories – list all categories with counts
router.get('/categories', async (req, res) => {
    try {
        const categories = await FAQ.aggregate([
            { $match: { isPublished: true } },
            { $group: { _id: '$category', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);
        res.json({ success: true, data: categories.map(c => ({ category: c._id, count: c.count })) });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// GET /api/faq/:id – get single FAQ (increments view count)
router.get('/:id', async (req, res) => {
    try {
        const faq = await FAQ.findByIdAndUpdate(
            req.params.id,
            { $inc: { viewCount: 1 } },
            { new: true }
        ).select('question answer category tags viewCount helpfulCount notHelpfulCount relatedFAQs');
        if (!faq || !faq.isPublished) {
            return res.status(404).json({ success: false, message: 'FAQ not found' });
        }
        // Populate related FAQs
        if (faq.relatedFAQs && faq.relatedFAQs.length) {
            const related = await FAQ.find({ _id: { $in: faq.relatedFAQs }, isPublished: true })
                .select('question category').lean();
            faq = faq.toObject();
            faq.relatedFAQs = related;
        }
        res.json({ success: true, data: faq });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// POST /api/faq/:id/helpful – mark as helpful
router.post('/:id/helpful', async (req, res) => {
    try {
        const { helpful } = req.body; // true or false
        const inc = helpful ? { helpfulCount: 1 } : { notHelpfulCount: 1 };
        const faq = await FAQ.findByIdAndUpdate(req.params.id, { $inc: inc }, { new: true });
        if (!faq) return res.status(404).json({ success: false, message: 'FAQ not found' });
        res.json({ success: true, helpful: faq.helpfulCount, notHelpful: faq.notHelpfulCount });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ============================================================
// ADMIN ROUTES
// ============================================================

// GET /api/faq/admin/all – list all (including unpublished) with pagination
router.get('/admin/all', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { category, status, search, page = 1, limit = 20, sort } = req.query;
        const filter = {};
        if (category && category !== 'all') filter.category = category;
        if (status === 'published') filter.isPublished = true;
        else if (status === 'draft') filter.isPublished = false;
        if (search) {
            const safe = escapeRegex(search);
            filter.$or = [
                { question: { $regex: safe, $options: 'i' } },
                { answer: { $regex: safe, $options: 'i' } },
                { tags: { $regex: safe, $options: 'i' } }
            ];
        }
        let sortObj = { category: 1, displayOrder: 1, createdAt: -1 };
        if (sort === 'views') sortObj = { viewCount: -1 };
        else if (sort === 'helpful') sortObj = { helpfulCount: -1 };
        else if (sort === 'recent') sortObj = { createdAt: -1 };
        else if (sort === 'alphabetical') sortObj = { question: 1 };
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [faqs, total] = await Promise.all([
            FAQ.find(filter).sort(sortObj).skip(skip).limit(parseInt(limit)),
            FAQ.countDocuments(filter)
        ]);
        res.json({ success: true, data: faqs, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// GET /api/faq/admin/stats – FAQ statistics
router.get('/admin/stats', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [total, published, drafts, totalViews, topCategories] = await Promise.all([
            FAQ.countDocuments(),
            FAQ.countDocuments({ isPublished: true }),
            FAQ.countDocuments({ isPublished: false }),
            FAQ.aggregate([{ $group: { _id: null, total: { $sum: '$viewCount' } } }]),
            FAQ.aggregate([
                { $match: { isPublished: true } },
                { $group: { _id: '$category', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 10 }
            ])
        ]);
        res.json({
            success: true,
            data: {
                total,
                published,
                drafts,
                totalViews: totalViews[0]?.total || 0,
                topCategories
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// POST /api/faq – create new FAQ (admin)
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { question, answer, category, tags, isPublished, displayOrder, seoTitle, seoDescription, relatedFAQs } = req.body;
        if (!question || !answer) {
            return res.status(400).json({ success: false, message: 'Question and answer are required' });
        }
        const faq = new FAQ({
            question, answer, category: category || 'general',
            tags: tags || [], isPublished: isPublished !== false,
            displayOrder: displayOrder || 0, seoTitle, seoDescription,
            relatedFAQs: relatedFAQs || []
        });
        await faq.save();
        res.status(201).json({ success: true, message: 'FAQ created', data: faq });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// PUT /api/faq/:id – update FAQ (admin)
router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const allowed = ['question', 'answer', 'category', 'tags', 'isPublished', 'displayOrder', 'seoTitle', 'seoDescription', 'relatedFAQs'];
        const updates = {};
        for (const key of allowed) {
            if (req.body[key] !== undefined) updates[key] = req.body[key];
        }
        const faq = await FAQ.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
        if (!faq) return res.status(404).json({ success: false, message: 'FAQ not found' });
        res.json({ success: true, message: 'FAQ updated', data: faq });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// DELETE /api/faq/:id – delete FAQ (admin)
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const faq = await FAQ.findByIdAndDelete(req.params.id);
        if (!faq) return res.status(404).json({ success: false, message: 'FAQ not found' });
        // Remove from relatedFAQs of other FAQs
        await FAQ.updateMany(
            { relatedFAQs: req.params.id },
            { $pull: { relatedFAQs: req.params.id } }
        );
        res.json({ success: true, message: 'FAQ deleted' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// POST /api/faq/admin/bulk – bulk operations (admin)
router.post('/admin/bulk', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { ids, action, value } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, message: 'No IDs provided' });
        }
        const validActions = ['publish', 'unpublish', 'delete', 'set-category', 'reorder'];
        if (!validActions.includes(action)) {
            return res.status(400).json({ success: false, message: 'Invalid action' });
        }
        let result;
        switch (action) {
            case 'publish':
                result = await FAQ.updateMany({ _id: { $in: ids } }, { isPublished: true });
                break;
            case 'unpublish':
                result = await FAQ.updateMany({ _id: { $in: ids } }, { isPublished: false });
                break;
            case 'delete':
                result = await FAQ.deleteMany({ _id: { $in: ids } });
                break;
            case 'set-category':
                if (!['general', 'orders', 'shipping', 'returns', 'payments', 'account', 'products', 'technical'].includes(value)) {
                    return res.status(400).json({ success: false, message: 'Invalid category' });
                }
                result = await FAQ.updateMany({ _id: { $in: ids } }, { category: value });
                break;
            case 'reorder':
                // value is array of { id, displayOrder }
                const bulkOps = value.map(v => ({
                    updateOne: { filter: { _id: v.id }, update: { displayOrder: v.displayOrder } }
                }));
                result = await FAQ.bulkWrite(bulkOps);
                break;
        }
        res.json({ success: true, message: `Bulk ${action} applied`, modified: result.modifiedCount || result.deletedCount });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

module.exports = router;