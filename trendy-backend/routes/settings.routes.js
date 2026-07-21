const express = require('express');
const router = express.Router();
const Settings = require('../models/Settings');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

async function getSettings() {
    let s = await Settings.findOne();
    if (!s) { s = new Settings(); await s.save(); }
    return s;
}

// GET /api/settings — full settings
router.get('/', async (req, res) => {
    try {
        const settings = await getSettings();
        res.json({ success: true, data: settings });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// GET /api/settings/branding — branding subset
router.get('/branding', async (req, res) => {
    try {
        const s = await getSettings();
        const branding = {
            storeName: s.storeName, tagline: s.tagline, brandDescription: s.brandDescription,
            companyName: s.companyName, copyright: s.copyright,
            businessRegistrationNumber: s.businessRegistrationNumber,
            defaultLanguage: s.defaultLanguage, currency: s.currency,
            currencySymbol: s.currencySymbol, timezone: s.timezone,
            logo: s.logo, logoDark: s.logoDark, logoLight: s.logoLight,
            secondaryLogo: s.secondaryLogo, mobileLogo: s.mobileLogo,
            footerLogo: s.footerLogo, emailLogo: s.emailLogo,
            favicon: s.favicon, appleTouchIcon: s.appleTouchIcon, androidIcon: s.androidIcon,
            primaryColor: s.primaryColor, secondaryColor: s.secondaryColor,
            accentColor: s.accentColor, backgroundColor: s.backgroundColor,
            textColor: s.textColor, buttonColor: s.buttonColor,
            successColor: s.successColor, warningColor: s.warningColor, errorColor: s.errorColor,
            primaryFont: s.primaryFont, secondaryFont: s.secondaryFont, headingFont: s.headingFont,
            announcementText: s.announcementText, announcementEnabled: s.announcementEnabled
        };
        res.json({ success: true, data: branding });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// PUT /api/settings/branding — update branding
router.put('/branding', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const s = await getSettings();
        const fields = ['storeName','tagline','brandDescription','companyName','copyright',
            'businessRegistrationNumber','defaultLanguage','currency','currencySymbol','timezone',
            'logo','logoDark','logoLight','secondaryLogo','mobileLogo','footerLogo','emailLogo',
            'favicon','appleTouchIcon','androidIcon',
            'primaryColor','secondaryColor','accentColor','backgroundColor','textColor','buttonColor',
            'successColor','warningColor','errorColor',
            'primaryFont','secondaryFont','headingFont',
            'announcementText','announcementEnabled'];
        for (const key of fields) {
            if (req.body[key] !== undefined) s[key] = req.body[key];
        }
        await s.save();
        res.json({ success: true, data: s });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// GET /api/settings/contact
router.get('/contact', async (req, res) => {
    try {
        const s = await getSettings();
        res.json({ success: true, data: {
            email: s.email, phone: s.phone, whatsapp: s.whatsapp,
            address: s.address, businessHours: s.businessHours, mapsEmbedUrl: s.mapsEmbedUrl
        }});
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// PUT /api/settings/contact
router.put('/contact', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const s = await getSettings();
        const fields = ['email','phone','whatsapp','address','businessHours','mapsEmbedUrl'];
        for (const key of fields) {
            if (req.body[key] !== undefined) s[key] = req.body[key];
        }
        await s.save();
        res.json({ success: true, data: s });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// GET /api/settings/footer
router.get('/footer', async (req, res) => {
    try {
        const s = await getSettings();
        res.json({ success: true, data: {
            aboutText: s.aboutText, quickLinks: s.quickLinks,
            customerServiceLinks: s.customerServiceLinks, policies: s.policies,
            newsletterText: s.newsletterText, paymentIcons: s.paymentIcons,
            copyright: s.copyright, companyName: s.companyName
        }});
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// PUT /api/settings/footer
router.put('/footer', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const s = await getSettings();
        const fields = ['aboutText','quickLinks','customerServiceLinks','policies',
            'newsletterText','paymentIcons','copyright','companyName'];
        for (const key of fields) {
            if (req.body[key] !== undefined) s[key] = req.body[key];
        }
        await s.save();
        res.json({ success: true, data: s });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// GET /api/settings/seo
router.get('/seo', async (req, res) => {
    try {
        const s = await getSettings();
        res.json({ success: true, data: {
            metaTitle: s.metaTitle, metaDescription: s.metaDescription,
            metaKeywords: s.metaKeywords, ogImage: s.ogImage,
            twitterCardImage: s.twitterCardImage, canonicalUrl: s.canonicalUrl
        }});
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// PUT /api/settings/seo
router.put('/seo', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const s = await getSettings();
        const fields = ['metaTitle','metaDescription','metaKeywords','ogImage','twitterCardImage','canonicalUrl'];
        for (const key of fields) {
            if (req.body[key] !== undefined) s[key] = req.body[key];
        }
        await s.save();
        res.json({ success: true, data: s });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// GET /api/settings/heroImages
router.get('/heroImages', async (req, res) => {
    try {
        const s = await getSettings();
        res.json({ success: true, data: s.heroImages || [] });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// GET /api/settings/:key — single key lookup
router.get('/:key', async (req, res) => {
    try {
        const s = await getSettings();
        const value = s[req.params.key];
        if (value === undefined) {
            return res.status(404).json({ success: false, message: `Setting '${req.params.key}' not found` });
        }
        res.json({ success: true, data: value });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// POST /api/settings — upsert any fields (admin)
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const s = await getSettings();
        Object.assign(s, req.body);
        await s.save();
        res.json({ success: true, data: s });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// PUT /api/settings — update allowed fields (legacy)
router.put('/', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const s = await getSettings();
        const allowedFields = ['storeName', 'tagline', 'brandDescription', 'companyName',
            'currency', 'currencySymbol', 'defaultLanguage', 'timezone',
            'deliveryFee', 'freeDeliveryThreshold', 'paymentMethods',
            'email', 'phone', 'whatsapp', 'address', 'businessHours', 'mapsEmbedUrl',
            'metaTitle', 'metaDescription', 'metaKeywords', 'ogImage',
            'twitterCardImage', 'canonicalUrl',
            'logo', 'logoDark', 'logoLight', 'secondaryLogo', 'mobileLogo',
            'footerLogo', 'emailLogo', 'favicon', 'appleTouchIcon', 'androidIcon',
            'primaryColor', 'secondaryColor', 'accentColor', 'backgroundColor',
            'textColor', 'buttonColor', 'successColor', 'warningColor', 'errorColor',
            'primaryFont', 'secondaryFont', 'headingFont',
            'aboutText', 'newsletterText', 'paymentIcons',
            'announcementText', 'announcementEnabled', 'googleAnalyticsId',
            'copyright', 'businessRegistrationNumber'];
        const updates = {};
        for (const key of allowedFields) {
            if (req.body[key] !== undefined) updates[key] = req.body[key];
        }
        Object.assign(s, updates);
        await s.save();
        res.json({ success: true, data: s });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

module.exports = router;
