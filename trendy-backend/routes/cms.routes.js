const express = require('express');
const router = express.Router();
const Testimonial = require('../models/Testimonial');
const HomepageSection = require('../models/HomepageSection');
const ContentVersion = require('../models/ContentVersion');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// All routes require admin auth
router.use(authenticateToken, requireAdmin);

// ===================== TESTIMONIALS =====================
router.get('/testimonials', async (req, res) => {
    try {
        const { status, featured, search, page = 1, limit = 50 } = req.query;
        const filter = {};
        if (status) filter.status = status;
        if (featured === 'true') filter.featured = true;
        if (search) filter.$or = [
            { customerName: { $regex: search, $options: 'i' } },
            { review: { $regex: search, $options: 'i' } }
        ];
        const total = await Testimonial.countDocuments(filter);
        const testimonials = await Testimonial.find(filter)
            .sort({ displayOrder: 1, createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit));
        res.json({ success: true, data: testimonials, total, page: parseInt(page), pages: Math.ceil(total / limit) });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/testimonials', async (req, res) => {
    try {
        const testimonial = new Testimonial(req.body);
        await testimonial.save();
        res.status(201).json({ success: true, data: testimonial });
    } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

router.put('/testimonials/:id', async (req, res) => {
    try {
        const testimonial = await Testimonial.findByIdAndUpdate(req.params.id, { ...req.body, updatedAt: new Date() }, { new: true, runValidators: true });
        if (!testimonial) return res.status(404).json({ success: false, message: 'Not found' });
        res.json({ success: true, data: testimonial });
    } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

router.delete('/testimonials/:id', async (req, res) => {
    try {
        const testimonial = await Testimonial.findByIdAndDelete(req.params.id);
        if (!testimonial) return res.status(404).json({ success: false, message: 'Not found' });
        res.json({ success: true, message: 'Deleted' });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/testimonials/:id/toggle', async (req, res) => {
    try {
        const t = await Testimonial.findById(req.params.id);
        if (!t) return res.status(404).json({ success: false, message: 'Not found' });
        t.status = t.status === 'published' ? 'draft' : 'published';
        t.updatedAt = new Date();
        await t.save();
        res.json({ success: true, data: t });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/testimonials/reorder', async (req, res) => {
    try {
        const { orders } = req.body;
        if (!Array.isArray(orders)) return res.status(400).json({ success: false, message: 'orders array required' });
        for (const item of orders) {
            await Testimonial.findByIdAndUpdate(item.id, { displayOrder: item.order });
        }
        res.json({ success: true, message: 'Reordered' });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ===================== HOMEPAGE SECTIONS =====================
router.get('/homepage-sections', async (req, res) => {
    const sections = await HomepageSection.find().sort({ displayOrder: 1 });
    res.json({ success: true, data: sections });
});

router.put('/homepage-sections/:sectionKey', async (req, res) => {
    try {
        const section = await HomepageSection.findOneAndUpdate(
            { sectionKey: req.params.sectionKey },
            { ...req.body, updatedAt: new Date() },
            { upsert: true, new: true, runValidators: true }
        );
        res.json({ success: true, data: section });
    } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

router.put('/homepage-sections/reorder', async (req, res) => {
    try {
        const { orders } = req.body;
        if (!Array.isArray(orders)) return res.status(400).json({ success: false, message: 'orders array required' });
        for (const item of orders) {
            await HomepageSection.findOneAndUpdate({ sectionKey: item.key }, { displayOrder: item.order });
        }
        res.json({ success: true, message: 'Reordered' });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/homepage-sections/seed', async (req, res) => {
    const defaults = [
        { sectionKey: 'announcement-bar', title: 'Announcement Bar', displayOrder: 0 },
        { sectionKey: 'hero-banner', title: 'Hero Banner', displayOrder: 1 },
        { sectionKey: 'featured-categories', title: 'Featured Categories', displayOrder: 2 },
        { sectionKey: 'featured-collections', title: 'Featured Collections', displayOrder: 3 },
        { sectionKey: 'new-arrivals', title: 'New Arrivals', displayOrder: 4 },
        { sectionKey: 'best-sellers', title: 'Best Sellers', displayOrder: 5 },
        { sectionKey: 'trending-products', title: 'Trending Products', displayOrder: 6 },
        { sectionKey: 'promotional-banners', title: 'Promotional Banners', displayOrder: 7 },
        { sectionKey: 'brand-story', title: 'Brand Story', displayOrder: 8 },
        { sectionKey: 'testimonials', title: 'Customer Testimonials', displayOrder: 9 },
        { sectionKey: 'instagram-gallery', title: 'Instagram Gallery', displayOrder: 10 },
        { sectionKey: 'newsletter', title: 'Newsletter Section', displayOrder: 11 },
        { sectionKey: 'footer', title: 'Footer Content', displayOrder: 12 }
    ];
    for (const s of defaults) {
        await HomepageSection.findOneAndUpdate({ sectionKey: s.sectionKey }, s, { upsert: true });
    }
    const sections = await HomepageSection.find().sort({ displayOrder: 1 });
    res.json({ success: true, data: sections, message: 'Default sections created' });
});

// ===================== CONTENT VERSIONS =====================
router.get('/versions/:contentType', async (req, res) => {
    try {
        const { contentId } = req.query;
        const filter = { contentType: req.params.contentType };
        if (contentId) filter.contentId = contentId;
        const versions = await ContentVersion.find(filter).sort({ version: -1 }).limit(20).populate('createdBy', 'name');
        res.json({ success: true, data: versions });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/versions', async (req, res) => {
    try {
        const { contentType, contentId, title, data, changeLog } = req.body;
        const lastVersion = await ContentVersion.findOne({ contentType, contentId }).sort({ version: -1 });
        const version = (lastVersion?.version || 0) + 1;
        const cv = new ContentVersion({
            contentType, contentId, version, title, data,
            changeLog: changeLog || `Version ${version} saved`,
            createdBy: req.user.id,
            status: 'draft'
        });
        await cv.save();
        res.status(201).json({ success: true, data: cv });
    } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

router.put('/versions/:id/restore', async (req, res) => {
    try {
        const version = await ContentVersion.findById(req.params.id);
        if (!version) return res.status(404).json({ success: false, message: 'Not found' });
        // Restore logic — update the target content with version data
        if (version.contentType === 'homepage') {
            for (const [key, val] of Object.entries(version.data)) {
                await HomepageSection.findOneAndUpdate({ sectionKey: key }, val, { upsert: true });
            }
        }
        version.status = 'published';
        await version.save();
        res.json({ success: true, message: 'Version restored', data: version });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ===================== STATIC PAGES =====================
const staticPages = {};

router.get('/pages', async (req, res) => {
    const ContentVersion = require('../models/ContentVersion');
    const pages = await ContentVersion.find({ contentType: 'page', status: 'published' }).sort({ createdAt: -1 });
    const data = {};
    for (const p of pages) {
        data[p.contentId] = { title: p.title, content: p.data?.content || '', updatedAt: p.createdAt };
    }
    res.json({ success: true, data });
});

router.put('/pages/:pageKey', async (req, res) => {
    try {
        const { title, content } = req.body;
        const lastVersion = await ContentVersion.findOne({ contentType: 'page', contentId: req.params.pageKey }).sort({ version: -1 });
        const version = (lastVersion?.version || 0) + 1;
        const cv = new ContentVersion({
            contentType: 'page',
            contentId: req.params.pageKey,
            version,
            title: title || req.params.pageKey,
            data: { content },
            changeLog: `Updated ${req.params.pageKey}`,
            createdBy: req.user.id,
            status: 'published'
        });
        await cv.save();
        res.json({ success: true, message: 'Page saved', data: cv });
    } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

module.exports = router;