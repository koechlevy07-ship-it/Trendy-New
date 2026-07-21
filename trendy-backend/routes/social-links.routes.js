const express = require('express');
const router = express.Router();
const SocialLinks = require('../models/SocialLinks');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const PLATFORMS = ['facebook', 'instagram', 'tiktok', 'twitter', 'pinterest',
    'linkedin', 'youtube', 'whatsapp', 'threads', 'telegram', 'snapchat'];

function normalizePlatform(val) {
    if (!val || typeof val === 'string') {
        return { url: typeof val === 'string' ? val : '', enabled: false, openInNewTab: true };
    }
    return { url: val.url || '', enabled: !!val.enabled, openInNewTab: val.openInNewTab !== false };
}

router.get('/', async (req, res) => {
    try {
        let links = await SocialLinks.findOne();
        if (!links) {
            links = new SocialLinks();
            await links.save();
        }
        const obj = links.toObject();
        let needsSave = false;
        for (const p of PLATFORMS) {
            if (typeof obj[p] === 'string' || !obj[p] || typeof obj[p].url === 'undefined') {
                links[p] = normalizePlatform(obj[p]);
                needsSave = true;
            }
        }
        if (needsSave) await links.save();
        res.json({ success: true, data: links });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

router.get('/enabled', async (req, res) => {
    try {
        let links = await SocialLinks.findOne();
        if (!links) {
            links = new SocialLinks();
            await links.save();
        }
        const enabled = {};
        for (const [platform, data] of Object.entries(links.toObject())) {
            if (['_id', 'createdAt', 'updatedAt', '__v'].includes(platform)) continue;
            const normalized = normalizePlatform(data);
            if (normalized.enabled && normalized.url) {
                enabled[platform] = normalized;
            }
        }
        res.json({ success: true, data: enabled });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

router.put('/', authenticateToken, requireAdmin, async (req, res) => {
    try {
        let links = await SocialLinks.findOne();
        if (!links) links = new SocialLinks();
        for (const platform of PLATFORMS) {
            if (req.body[platform] !== undefined) {
                const existing = normalizePlatform(links[platform]);
                links[platform] = { ...existing, ...req.body[platform] };
            } else {
                links[platform] = normalizePlatform(links[platform]);
            }
        }
        await links.save();
        res.json({ success: true, data: links });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

module.exports = router;
