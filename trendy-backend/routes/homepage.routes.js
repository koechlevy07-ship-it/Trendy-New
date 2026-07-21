const express = require('express');
const router = express.Router();
const Homepage = require('../models/Homepage');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

function migrateCatalogues(hp) {
    if (!hp.genderCatalogues || !hp.genderCatalogues.length) return false;
    const first = hp.genderCatalogues[0];
    if (first.men || first.women || first.kids) {
        const old = hp.genderCatalogues;
        const newCats = [];
        if (first.men) newCats.push({ title: first.men.title || 'MEN', image: first.men.image || '', subtitle: first.men.bannerText || '', buttonText: first.men.buttonText || 'Shop Now', buttonLink: first.men.buttonLink || '/products?gender=men', displayOrder: 0, visible: first.men.visible !== false });
        if (first.women) newCats.push({ title: first.women.title || 'WOMEN', image: first.women.image || '', subtitle: first.women.bannerText || '', buttonText: first.women.buttonText || 'Shop Now', buttonLink: first.women.buttonLink || '/products?gender=women', displayOrder: 1, visible: first.women.visible !== false });
        if (first.kids) newCats.push({ title: first.kids.title || 'KIDS', image: first.kids.image || '', subtitle: first.kids.bannerText || '', buttonText: first.kids.buttonText || 'Shop Now', buttonLink: first.kids.buttonLink || '/products?gender=kids', displayOrder: 2, visible: first.kids.visible !== false });
        hp.genderCatalogues = newCats;
        return true;
    }
    return false;
}

router.get('/', async (req, res) => {
    try {
        let homepage = await Homepage.findOne().populate('featuredCollections.products');
        if (!homepage) {
            homepage = new Homepage();
            await homepage.save();
        }
        if (migrateCatalogues(homepage)) {
            await homepage.save();
        }
        res.json({ success: true, data: homepage });
    } catch (err) {
        console.error('GET /homepage error:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

router.get('/hero', async (req, res) => {
    try {
        let homepage = await Homepage.findOne();
        if (!homepage) {
            homepage = new Homepage();
            await homepage.save();
        }
        const slides = (homepage.heroSlides || []).filter(s => s.active).sort((a, b) => a.displayOrder - b.displayOrder);
        res.json({ success: true, data: slides });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

router.get('/catalogues', async (req, res) => {
    try {
        let homepage = await Homepage.findOne();
        if (!homepage) {
            homepage = new Homepage();
            await homepage.save();
        }
        if (migrateCatalogues(homepage)) {
            await homepage.save();
        }
        const catalogues = (homepage.genderCatalogues || []).filter(c => c.visible).sort((a, b) => a.displayOrder - b.displayOrder);
        res.json({ success: true, data: catalogues });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

router.put('/', authenticateToken, requireAdmin, async (req, res) => {
    try {
        let homepage = await Homepage.findOne();
        if (!homepage) homepage = new Homepage();
        if (req.body.heroSlides !== undefined) homepage.heroSlides = req.body.heroSlides;
        if (req.body.genderCatalogues !== undefined) homepage.genderCatalogues = req.body.genderCatalogues;
        if (req.body.featuredCollections !== undefined) {
            homepage.featuredCollections = { ...homepage.featuredCollections.toObject(), ...req.body.featuredCollections };
        }
        await homepage.save();
        res.json({ success: true, data: homepage });
    } catch (err) {
        console.error('PUT /homepage error:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

router.post('/hero-slide', authenticateToken, requireAdmin, async (req, res) => {
    try {
        let homepage = await Homepage.findOne();
        if (!homepage) homepage = new Homepage();
        homepage.heroSlides.push(req.body);
        await homepage.save();
        res.json({ success: true, data: homepage });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

router.put('/hero-slide/:slideId', authenticateToken, requireAdmin, async (req, res) => {
    try {
        let homepage = await Homepage.findOne();
        if (!homepage) return res.status(404).json({ success: false, message: 'Homepage not found' });
        const slide = homepage.heroSlides.id(req.params.slideId);
        if (!slide) return res.status(404).json({ success: false, message: 'Slide not found' });
        Object.assign(slide, req.body);
        await homepage.save();
        res.json({ success: true, data: homepage });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

router.delete('/hero-slide/:slideId', authenticateToken, requireAdmin, async (req, res) => {
    try {
        let homepage = await Homepage.findOne();
        if (!homepage) return res.status(404).json({ success: false, message: 'Homepage not found' });
        homepage.heroSlides.pull(req.params.slideId);
        await homepage.save();
        res.json({ success: true, data: homepage });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

router.put('/catalogue/:catalogueId', authenticateToken, requireAdmin, async (req, res) => {
    try {
        let homepage = await Homepage.findOne();
        if (!homepage) return res.status(404).json({ success: false, message: 'Homepage not found' });
        const catalogue = homepage.genderCatalogues.id(req.params.catalogueId);
        if (!catalogue) return res.status(404).json({ success: false, message: 'Catalogue not found' });
        Object.assign(catalogue, req.body);
        await homepage.save();
        res.json({ success: true, data: homepage });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

module.exports = router;
