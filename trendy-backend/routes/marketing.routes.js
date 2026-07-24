const express = require('express');
const router = express.Router();
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const Campaign = require('../models/Campaign');
const EmailTemplate = require('../models/EmailTemplate');
const Subscriber = require('../models/Subscriber');
const CustomerSegment = require('../models/CustomerSegment');
const AbandonedCart = require('../models/AbandonedCart');
const Coupon = require('../models/Coupon');
const Product = require('../models/Product');
const Order = require('../models/Order');
const User = require('../models/User');
const Notification = require('../models/Notification');

// Email service (to be implemented)
const { sendEmail, sendBulkEmail } = require('../services/emailService');

async function processCampaign(campaignId) {
    try {
        const campaign = await Campaign.findById(campaignId).populate('template');
        if (!campaign || campaign.status === 'sent') return;

        campaign.status = 'sending';
        await campaign.save();

        let query = { status: 'subscribed', confirmed: true };
        if (campaign.targeting?.segments?.length) {
            query.segments = { $in: campaign.targeting.segments };
        }
        if (campaign.targeting?.tags?.length) {
            query.tags = { $in: campaign.targeting.tags };
        }

        const subscribers = await Subscriber.find(query).lean();
        let sent = 0, failed = 0;

        for (const sub of subscribers) {
            try {
                const html = campaign.template?.html || campaign.content?.html || `<p>${campaign.name}</p>`;
                const personalizedHtml = html
                    .replace(/\{\{firstName\}\}/gi, sub.firstName || '')
                    .replace(/\{\{lastName\}\}/gi, sub.lastName || '')
                    .replace(/\{\{email\}\}/gi, sub.email || '')
                    .replace(/\{\{unsubscribeUrl\}\}/gi, `${process.env.FRONTEND_URL || 'https://trendy-frontend-ashen.vercel.app'}/unsubscribe?email=${encodeURIComponent(sub.email)}`);

                await sendBulkEmail({
                    to: sub.email,
                    subject: campaign.name,
                    html: personalizedHtml
                });
                sent++;
                await new Promise(r => setTimeout(r, 250));
            } catch (e) {
                failed++;
            }
        }

        campaign.status = 'completed';
        campaign.sentAt = campaign.sentAt || new Date();
        campaign.completedAt = new Date();
        campaign.analytics = { ...campaign.analytics, sent, delivered: sent, failed };
        await campaign.save();
    } catch (err) {
        console.error('Process campaign error:', err);
    }
}

async function sendTestEmail(campaign, recipients) {
    const results = { sent: 0, failed: 0, errors: [] };
    const html = campaign.template?.html || campaign.content?.html || `<p>${campaign.name} - Test Email</p>`;

    for (const email of recipients) {
        try {
            await sendBulkEmail({ to: email, subject: `[TEST] ${campaign.name}`, html });
            results.sent++;
        } catch (err) {
            results.failed++;
            results.errors.push({ email, error: err.message });
        }
    }
    return results;
}

async function sendTestEmailFromTemplate(template, recipients, testData = {}) {
    const results = { sent: 0, failed: 0, errors: [] };
    let html = template.html || template.blocks?.map(b => b.content || '').join('') || `<p>${template.name}</p>`;

    for (const [key, value] of Object.entries(testData)) {
        html = html.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'gi'), value);
    }

    for (const email of recipients) {
        try {
            await sendBulkEmail({ to: email, subject: `[TEST] ${template.name}`, html });
            results.sent++;
        } catch (err) {
            results.failed++;
            results.errors.push({ email, error: err.message });
        }
    }
    return results;
}

// ============================================================
// CAMPAIGN ROUTES
// ============================================================

// GET /api/marketing/dashboard - Dashboard statistics
router.get('/dashboard', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { days = 30 } = req.query;
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

        const [
            totalCampaigns,
            activeCampaigns,
            scheduledCampaigns,
            completedCampaigns,
            totalSubscribers,
            activeSubscribers,
            totalSent,
            totalOpened,
            totalClicked,
            totalBounced,
            totalUnsubscribed,
            totalRevenue,
            topCampaign,
            campaignPerformance,
            subscriberGrowth,
            abandonedCartStats
        ] = await Promise.all([
            Campaign.countDocuments({ createdAt: { $gte: startDate } }),
            Campaign.countDocuments({ status: { $in: ['sending', 'scheduled'] } }),
            Campaign.countDocuments({ status: 'scheduled', sendAt: { $gt: new Date() } }),
            Campaign.countDocuments({ status: { $in: ['sent', 'completed'] } }),
            Subscriber.countDocuments({ status: 'subscribed', confirmed: true }),
            Subscriber.countDocuments({ status: 'subscribed', confirmed: true, 'engagement.lastEngagementAt': { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }),
            Campaign.aggregate([
                { $match: { sentAt: { $gte: startDate } } },
                { $group: { _id: null, total: { $sum: '$analytics.sent' } } }
            ]),
            Campaign.aggregate([
                { $match: { sentAt: { $gte: startDate } } },
                { $group: { _id: null, total: { $sum: '$analytics.opened' } } }
            ]),
            Campaign.aggregate([
                { $match: { sentAt: { $gte: startDate } } },
                { $group: { _id: null, total: { $sum: '$analytics.clicked' } } }
            ]),
            Campaign.aggregate([
                { $match: { sentAt: { $gte: startDate } } },
                { $group: { _id: null, total: { $sum: '$analytics.bounced' } } }
            ]),
            Campaign.aggregate([
                { $match: { sentAt: { $gte: startDate } } },
                { $group: { _id: null, total: { $sum: '$analytics.unsubscribed' } } }
            ]),
            Campaign.aggregate([
                { $match: { sentAt: { $gte: startDate } } },
                { $group: { _id: null, total: { $sum: '$analytics.revenue' } } }
            ]),
            Campaign.findOne({ sentAt: { $gte: startDate } }).sort({ 'analytics.revenue': -1 }).select('name analytics revenue'),
            Campaign.aggregate([
                { $match: { sentAt: { $gte: startDate } } },
                { $project: { name: 1, type: 1, sent: '$analytics.sent', opened: '$analytics.opened', clicked: '$analytics.clicked', revenue: '$analytics.revenue', openRate: { $cond: [{ $gt: ['$analytics.delivered', 0] }, { $multiply: [{ $divide: ['$analytics.opened', '$analytics.delivered'] }, 100] }, 0] }, clickRate: { $cond: [{ $gt: ['$analytics.delivered', 0] }, { $multiply: [{ $divide: ['$analytics.clicked', '$analytics.delivered'] }, 100] }, 0] } } },
                { $sort: { revenue: -1 } },
                { $limit: 10 }
            ]),
            Subscriber.aggregate([
                { $match: { createdAt: { $gte: startDate } } },
                { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
                { $sort: { _id: 1 } }
            ]),
            AbandonedCart.aggregate([
                { $match: { abandonedAt: { $gte: startDate } } },
                { $group: { _id: null, total: { $sum: 1 }, recovered: { $sum: { $cond: ['$isConverted', 1, 0] } }, value: { $sum: '$total' }, recoveredValue: { $sum: { $cond: ['$isConverted', '$total', 0] } } } }
            ])
        ]);

        res.json({
            success: true,
            data: {
                campaigns: {
                    total: totalCampaigns,
                    active: activeCampaigns,
                    scheduled: scheduledCampaigns,
                    completed: completedCampaigns
                },
                subscribers: {
                    total: totalSubscribers,
                    active: activeSubscribers,
                    growth: subscriberGrowth
                },
                email: {
                    sent: totalSent[0]?.total || 0,
                    opened: totalOpened[0]?.total || 0,
                    clicked: totalClicked[0]?.total || 0,
                    bounced: totalBounced[0]?.total || 0,
                    unsubscribed: totalUnsubscribed[0]?.total || 0,
                    openRate: totalSent[0]?.total ? ((totalOpened[0]?.total || 0) / totalSent[0]?.total * 100).toFixed(2) : 0,
                    clickRate: totalSent[0]?.total ? ((totalClicked[0]?.total || 0) / totalSent[0]?.total * 100).toFixed(2) : 0
                },
                revenue: totalRevenue[0]?.total || 0,
                topCampaign,
                topCampaigns: campaignPerformance,
                abandonedCarts: abandonedCartStats[0] || { total: 0, recovered: 0, value: 0, recoveredValue: 0 }
            }
        });
    } catch (err) {
        console.error('Marketing dashboard error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/marketing/campaigns - List campaigns
router.get('/campaigns', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { page = 1, limit = 20, status, type, search, sort = '-createdAt' } = req.query;
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        const skip = (pageNum - 1) * limitNum;

        const filter = {};
        if (status) filter.status = status;
        if (type) filter.type = type;
        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { slug: { $regex: search, $options: 'i' } }
            ];
        }

        const [campaigns, total] = await Promise.all([
            Campaign.find(filter)
                .populate('template', 'name slug')
                .populate('createdBy', 'name email')
                .sort(sort)
                .skip(skip)
                .limit(limitNum)
                .lean(),
            Campaign.countDocuments(filter)
        ]);

        res.json({
            success: true,
            data: campaigns,
            pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) }
        });
    } catch (err) {
        console.error('Get campaigns error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/marketing/campaigns/:id - Get single campaign
router.get('/campaigns/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const campaign = await Campaign.findById(req.params.id)
            .populate('template', 'name slug blocks settings')
            .populate('createdBy', 'name email')
            .populate('updatedBy', 'name email')
            .populate('abTest.variantA', 'name')
            .populate('abTest.variantB', 'name')
            .populate('abTest.winner', 'name')
            .lean();

        if (!campaign) {
            return res.status(404).json({ success: false, message: 'Campaign not found' });
        }

        // Estimate audience if not set
        if (!campaign.estimatedAudience && campaign.targeting) {
            try {
                const Subscriber = require('../models/Subscriber');
                const query = campaign.buildAudienceQuery();
                const count = await Subscriber.countDocuments(query);
                campaign.estimatedAudience = count;
            } catch (e) {
                campaign.estimatedAudience = 0;
            }
        }

        res.json({ success: true, data: campaign });
    } catch (err) {
        console.error('Get campaign error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// POST /api/marketing/campaigns - Create campaign
router.post('/campaigns', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const campaign = new Campaign({
            ...req.body,
            createdBy: req.user.id,
            updatedBy: req.user.id
        });

        // Estimate audience if targeting provided
        if (campaign.targeting && !campaign.estimatedAudience) {
            try {
                const Subscriber = require('../models/Subscriber');
                const query = campaign.buildAudienceQuery();
                const count = await Subscriber.countDocuments(query);
                campaign.estimatedAudience = count;
            } catch (e) {
                campaign.estimatedAudience = 0;
            }
        }

        await campaign.save();
        res.status(201).json({ success: true, data: campaign });
    } catch (err) {
        console.error('Create campaign error:', err);
        if (err.name === 'ValidationError') {
            return res.status(400).json({ success: false, message: 'Validation error', errors: err.errors });
        }
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// PUT /api/marketing/campaigns/:id - Update campaign
router.put('/campaigns/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const campaign = await Campaign.findByIdAndUpdate(
            req.params.id,
            { ...req.body, updatedBy: req.user.id },
            { new: true, runValidators: true }
        ).populate('template', 'name slug');

        if (!campaign) {
            return res.status(404).json({ success: false, message: 'Campaign not found' });
        }

        // Re-estimate audience if targeting changed
        if (req.body.targeting) {
            try {
                const Subscriber = require('../models/Subscriber');
                const query = campaign.buildAudienceQuery();
                const count = await Subscriber.countDocuments(query);
                campaign.estimatedAudience = count;
                await campaign.save();
            } catch (e) {}
        }

        res.json({ success: true, data: campaign });
    } catch (err) {
        console.error('Update campaign error:', err);
        if (err.name === 'ValidationError') {
            return res.status(400).json({ success: false, message: 'Validation error', errors: err.errors });
        }
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// DELETE /api/marketing/campaigns/:id - Delete campaign
router.delete('/campaigns/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const campaign = await Campaign.findByIdAndDelete(req.params.id);
        if (!campaign) {
            return res.status(404).json({ success: false, message: 'Campaign not found' });
        }
        res.json({ success: true, message: 'Campaign deleted' });
    } catch (err) {
        console.error('Delete campaign error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// POST /api/marketing/campaigns/:id/send - Send or schedule campaign
router.post('/campaigns/:id/send', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { scheduleAt, testMode, testRecipients } = req.body;
        const campaign = await Campaign.findById(req.params.id);

        if (!campaign) {
            return res.status(404).json({ success: false, message: 'Campaign not found' });
        }

        if (campaign.status === 'sent' || campaign.status === 'sending') {
            return res.status(400).json({ success: false, message: 'Campaign already sent or sending' });
        }

        if (testMode) {
            // Send test email
            const recipients = testRecipients || campaign.settings.testRecipients || [req.user.email];
            const result = await sendTestEmail(campaign, recipients);
            return res.json({ success: true, message: 'Test email sent', data: result });
        }

        // Schedule or send immediately
        if (scheduleAt) {
            campaign.schedule.type = 'scheduled';
            campaign.schedule.startDate = new Date(scheduleAt);
            campaign.status = 'scheduled';
        } else {
            campaign.status = 'sending';
            campaign.sentAt = new Date();
        }

        campaign.updatedBy = req.user.id;
        await campaign.save();

        // Queue for sending (would use job queue in production)
        if (!scheduleAt || new Date(scheduleAt) <= new Date()) {
            processCampaign(campaign._id).catch(console.error);
        }

        res.json({ success: true, message: scheduleAt ? 'Campaign scheduled' : 'Campaign sending started', data: campaign });
    } catch (err) {
        console.error('Send campaign error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// POST /api/marketing/campaigns/:id/test - Send test email
router.post('/campaigns/:id/test', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { recipients } = req.body;
        const campaign = await Campaign.findById(req.params.id).populate('template');

        if (!campaign) {
            return res.status(404).json({ success: false, message: 'Campaign not found' });
        }

        const testRecipients = recipients || campaign.settings.testRecipients || [req.user.email];
        const result = await sendTestEmail(campaign, testRecipients);

        res.json({ success: true, message: 'Test email sent', data: result });
    } catch (err) {
        console.error('Test email error:', err);
        res.status(500).json({ success: false, message: 'Failed to send test email' });
    }
});

// POST /api/marketing/campaigns/:id/pause - Pause campaign
router.post('/campaigns/:id/pause', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const campaign = await Campaign.findByIdAndUpdate(
            req.params.id,
            { status: 'paused', updatedBy: req.user.id },
            { new: true }
        );
        if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
        res.json({ success: true, data: campaign });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// POST /api/marketing/campaigns/:id/resume - Resume paused campaign
router.post('/campaigns/:id/resume', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const campaign = await Campaign.findByIdAndUpdate(
            req.params.id,
            { status: 'scheduled', updatedBy: req.user.id },
            { new: true }
        );
        if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
        res.json({ success: true, data: campaign });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// POST /api/marketing/campaigns/:id/duplicate - Duplicate campaign
router.post('/campaigns/:id/duplicate', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const campaign = await Campaign.findById(req.params.id);
        if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });

        const duplicate = new Campaign({
            ...campaign.toObject(),
            _id: undefined,
            name: `${campaign.name} (Copy)`,
            slug: undefined,
            status: 'draft',
            sentCount: 0,
            deliveredCount: 0,
            openedCount: 0,
            clickedCount: 0,
            analytics: {},
            sentAt: undefined,
            completedAt: undefined,
            createdBy: req.user.id,
            updatedBy: req.user.id
        });

        await duplicate.save();
        res.status(201).json({ success: true, data: duplicate });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ============================================================
// EMAIL TEMPLATE ROUTES
// ============================================================

// GET /api/marketing/templates - List templates
router.get('/templates', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { page = 1, limit = 20, category, status, search } = req.query;
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        const skip = (pageNum - 1) * limitNum;

        const filter = {};
        if (category) filter.category = category;
        if (status) filter.status = status;

        const [templates, total] = await Promise.all([
            EmailTemplate.find(filter)
                .populate('createdBy', 'name email')
                .populate('updatedBy', 'name email')
                .sort({ updatedAt: -1 })
                .skip(skip)
                .limit(limitNum)
                .lean(),
            EmailTemplate.countDocuments(filter)
        ]);

        res.json({
            success: true,
            data: templates,
            pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) }
        });
    } catch (err) {
        console.error('Get templates error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/marketing/templates/:id - Get single template
router.get('/templates/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const template = await EmailTemplate.findById(req.params.id)
            .populate('createdBy', 'name email')
            .populate('updatedBy', 'name email')
            .populate('approvedBy', 'name email')
            .lean();

        if (!template) {
            return res.status(404).json({ success: false, message: 'Template not found' });
        }

        res.json({ success: true, data: template });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// POST /api/marketing/templates - Create template
router.post('/templates', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const template = new EmailTemplate({
            ...req.body,
            createdBy: req.user.id,
            updatedBy: req.user.id
        });
        await template.save();
        res.status(201).json({ success: true, data: template });
    } catch (err) {
        console.error('Create template error:', err);
        if (err.name === 'ValidationError') {
            return res.status(400).json({ success: false, message: 'Validation error', errors: err.errors });
        }
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// PUT /api/marketing/templates/:id - Update template
router.put('/templates/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const template = await EmailTemplate.findByIdAndUpdate(
            req.params.id,
            { ...req.body, updatedBy: req.user.id },
            { new: true, runValidators: true }
        );

        if (!template) {
            return res.status(404).json({ success: false, message: 'Template not found' });
        }

        res.json({ success: true, data: template });
    } catch (err) {
        console.error('Update template error:', err);
        if (err.name === 'ValidationError') {
            return res.status(400).json({ success: false, message: 'Validation error', errors: err.errors });
        }
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// DELETE /api/marketing/templates/:id - Delete template
router.delete('/templates/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const template = await EmailTemplate.findByIdAndDelete(req.params.id);
        if (!template) {
            return res.status(404).json({ success: false, message: 'Template not found' });
        }
        res.json({ success: true, message: 'Template deleted' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// POST /api/marketing/templates/:id/clone - Clone template
router.post('/templates/:id/clone', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const template = await EmailTemplate.findById(req.params.id);
        if (!template) return res.status(404).json({ success: false, message: 'Template not found' });

        const clone = await EmailTemplate.cloneTemplate(template._id, req.body.name || `${template.name} (Copy)`, req.user.id);
        res.status(201).json({ success: true, data: clone });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// POST /api/marketing/templates/:id/test - Send test email for template
router.post('/templates/:id/test', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { recipients, testData } = req.body;
        const template = await EmailTemplate.findById(req.params.id);

        if (!template) {
            return res.status(404).json({ success: false, message: 'Template not found' });
        }

        const recipientsList = recipients || template.testRecipients || [req.user.email];
        const testDataMerged = { ...template.testData, ...testData };

        const result = await sendTestEmailFromTemplate(template, recipientsList, testDataMerged);
        res.json({ success: true, message: 'Test email sent', data: result });
    } catch (err) {
        console.error('Test template email error:', err);
        res.status(500).json({ success: false, message: 'Failed to send test email' });
    }
});

// ============================================================
// SUBSCRIBER ROUTES
// ============================================================

// GET /api/marketing/subscribers - List subscribers
router.get('/subscribers', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { page = 1, limit = 50, status, segment, search, sort = '-createdAt' } = req.query;
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(200, Math.max(1, parseInt(limit)));
        const skip = (pageNum - 1) * limitNum;

        const filter = {};
        if (status) filter.status = status;
        if (search) {
            filter.$or = [
                { email: { $regex: search, $options: 'i' } },
                { firstName: { $regex: search, $options: 'i' } },
                { lastName: { $regex: search, $options: 'i' } }
            ];
        }

        const [subscribers, total] = await Promise.all([
            Subscriber.find(filter)
                .populate('segments', 'name slug')
                .sort(sort)
                .skip(skip)
                .limit(limitNum)
                .lean(),
            Subscriber.countDocuments(filter)
        ]);

        res.json({
            success: true,
            data: subscribers,
            pagination: { page: Math.max(1, parseInt(page)), limit: Math.min(100, Math.max(1, parseInt(limit))), total, pages: Math.ceil(total / Math.min(100, Math.max(1, parseInt(limit)))) }
        });
    } catch (err) {
        console.error('Get subscribers error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// POST /api/marketing/subscribers - Add subscriber
router.post('/subscribers', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const subscriber = new Subscriber({
            ...req.body,
            confirmed: true,
            confirmedAt: new Date(),
            source: req.body.source || 'admin',
            createdBy: req.user.id
        });
        await subscriber.save();
        res.status(201).json({ success: true, data: subscriber });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ success: false, message: 'Email already exists' });
        }
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// DELETE /api/marketing/subscribers/:id - Delete subscriber
router.delete('/subscribers/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const subscriber = await Subscriber.findByIdAndDelete(req.params.id);
        if (!subscriber) return res.status(404).json({ success: false, message: 'Subscriber not found' });
        res.json({ success: true, message: 'Subscriber deleted' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// POST /api/marketing/subscribers/import - Import subscribers
router.post('/subscribers/import', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { subscribers, segment, tags, source = 'import' } = req.body;
        if (!subscribers || !Array.isArray(subscribers)) {
            return res.status(400).json({ success: false, message: 'Subscribers array required' });
        }

        const results = { imported: 0, updated: 0, errors: [] };

        for (const sub of subscribers) {
            try {
                if (!sub.email) {
                    results.errors.push({ email: sub.email, error: 'Email required' });
                    continue;
                }

                const existing = await Subscriber.findOne({ email: sub.email.toLowerCase().trim() });
                if (existing) {
                    Object.assign(existing, sub);
                    existing.tags = [...new Set([...(existing.tags || []), ...(sub.tags || [])])];
                    existing.updatedBy = req.user.id;
                    await existing.save();
                    results.updated++;
                } else {
                    await Subscriber.create({
                        ...sub,
                        status: 'subscribed',
                        confirmed: true,
                        confirmedAt: new Date(),
                        source: 'import',
                        createdBy: req.user.id
                    });
                    results.imported++;
                }
            } catch (e) {
                results.errors.push({ email: sub.email, error: e.message });
            }
        }

        res.json({ success: true, data: results });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ============================================================
// SEGMENT ROUTES
// ============================================================

// GET /api/marketing/segments - List segments
router.get('/segments', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { page = 1, limit = 20, type, search } = req.query;
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        const skip = (pageNum - 1) * limitNum;

        const filter = {};
        if (type) filter.type = type;
        if (search) filter.$or = [{ name: { $regex: search, $options: 'i' } }, { description: { $regex: search, $options: 'i' } }];

        const [segments, total] = await Promise.all([
            CustomerSegment.find(filter)
                .populate('createdBy', 'name email')
                .sort({ updatedAt: -1 })
                .skip(skip)
                .limit(limitNum)
                .lean(),
            CustomerSegment.countDocuments(filter)
        ]);

        res.json({
            success: true,
            data: segments,
            pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// POST /api/marketing/segments - Create segment
router.post('/segments', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const segment = new CustomerSegment({
            ...req.body,
            createdBy: req.user.id,
            updatedBy: req.user.id
        });
        await segment.save();
        res.status(201).json({ success: true, data: segment });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/marketing/segments/:id - Get segment
router.get('/segments/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const segment = await CustomerSegment.findById(req.params.id)
            .populate('createdBy', 'name email')
            .populate('campaignsUsed', 'name status')
            .lean();
        if (!segment) return res.status(404).json({ success: false, message: 'Segment not found' });
        res.json({ success: true, data: segment });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// PUT /api/marketing/segments/:id - Update segment
router.put('/segments/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const segment = await CustomerSegment.findByIdAndUpdate(
            req.params.id,
            { ...req.body, updatedBy: req.user.id },
            { new: true, runValidators: true }
        );
        if (!segment) return res.status(404).json({ success: false, message: 'Segment not found' });
        res.json({ success: true, data: segment });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// DELETE /api/marketing/segments/:id - Delete segment
router.delete('/segments/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const segment = await CustomerSegment.findByIdAndDelete(req.params.id);
        if (!segment) return res.status(404).json({ success: false, message: 'Segment not found' });
        res.json({ success: true, message: 'Segment deleted' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// POST /api/marketing/segments/:id/refresh - Refresh segment members
router.post('/segments/:id/refresh', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const segment = await CustomerSegment.findById(req.params.id);
        if (!segment) return res.status(404).json({ success: false, message: 'Segment not found' });

        await segment.refreshMembers();
        res.json({ success: true, data: segment });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/marketing/segments/:id/preview - Preview segment members
router.get('/segments/:id/preview', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const segment = await CustomerSegment.findById(req.params.id);
        if (!segment) return res.status(404).json({ success: false, message: 'Segment not found' });

        const Subscriber = require('../models/Subscriber');
        const query = segment.buildSubscriberQuery();
        const limit = Math.min(parseInt(req.query.limit) || 50, 100);

        const subscribers = await Subscriber.find(query)
            .select('email firstName lastName status confirmed engagement engagementScore createdAt')
            .limit(limit)
            .lean();

        res.json({ success: true, data: subscribers, total: await Subscriber.countDocuments(segment.buildSubscriberQuery()) });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ============================================================
// ABANDONED CART ROUTES
// ============================================================

// GET /api/marketing/abandoned-carts - List abandoned carts
router.get('/abandoned-carts', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { page = 1, limit = 20, status, search } = req.query;
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        const skip = (pageNum - 1) * limitNum;

        const filter = {};
        if (status) filter.status = status;
        if (search) {
            filter.$or = [
                { email: { $regex: search, $options: 'i' } },
                { 'customer.name': { $regex: search, $options: 'i' } }
            ];
        }

        const [carts, total] = await Promise.all([
            AbandonedCart.find(filter)
                .populate('customer.id', 'name email')
                .sort({ abandonedAt: -1 })
                .skip(skip)
                .limit(limitNum)
                .lean(),
            AbandonedCart.countDocuments(filter)
        ]);

        res.json({
            success: true,
            data: carts,
            pagination: { page: Math.max(1, parseInt(page)), limit: Math.min(100, Math.max(1, parseInt(limit))), total, pages: Math.ceil(total / Math.min(100, Math.max(1, parseInt(limit)))) }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// POST /api/marketing/abandoned-carts/recover - Trigger recovery for a cart
router.post('/abandoned-carts/:id/recover', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { sendEmail: shouldSendEmail, couponCode } = req.body;
        const cart = await AbandonedCart.findById(req.params.id);
        if (!cart) return res.status(404).json({ success: false, message: 'Cart not found' });

        if (cart.status !== 'active' && cart.status !== 'recovering') {
            return res.status(400).json({ success: false, message: 'Cart is not recoverable' });
        }

        await cart.startRecovery();
        await cart.save();

        if (shouldSendEmail) {
            // Send recovery email (would use email service)
            // await sendAbandonedCartEmail(cart, couponCode);
        }

        res.json({ success: true, message: 'Recovery started', data: cart });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/marketing/analytics - Marketing analytics
router.get('/analytics', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { days = 30 } = req.query;
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

        const [
            emailPerformance,
            campaignComparison,
            subscriberEngagement,
            conversionFunnel,
            deviceStats,
            geoStats,
            topLinks
        ] = await Promise.all([
            Campaign.aggregate([
                { $match: { sentAt: { $gte: startDate } } },
                { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$sentAt' } }, sent: { $sum: '$analytics.sent' }, opened: { $sum: '$analytics.opened' }, clicked: { $sum: '$analytics.clicked' }, revenue: { $sum: '$analytics.revenue' } } },
                { $sort: { _id: 1 } }
            ]),
            Campaign.aggregate([
                { $match: { sentAt: { $gte: startDate } } },
                { $project: { name: 1, type: 1, sent: '$analytics.sent', opened: '$analytics.opened', clicked: '$analytics.clicked', revenue: '$analytics.revenue', openRate: { $cond: [{ $gt: ['$analytics.delivered', 0] }, { $multiply: [{ $divide: ['$analytics.opened', '$analytics.delivered'] }, 100] }, 0] } } },
                { $sort: { revenue: -1 } },
                { $limit: 10 }
            ]),
            Subscriber.aggregate([
                { $match: { status: 'subscribed', confirmed: true } },
                { $bucket: { groupBy: '$engagement.engagementLevel', boundaries: ['highly_engaged', 'engaged', 'somewhat_engaged', 'unengaged', 'dormant', 'unknown'], default: 'unknown', output: { count: { $sum: 1 }, avgScore: { $avg: '$engagement.engagementScore' } } } }
            ]),
            Order.aggregate([
                { $match: { createdAt: { $gte: startDate } } },
                { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, orders: { $sum: 1 }, revenue: { $sum: '$total' }, uniqueCustomers: { $addToSet: '$user' } } },
                { $project: { date: '$_id', orders: 1, revenue: 1, customers: { $size: '$uniqueCustomers' } } },
                { $sort: { _id: 1 } }
            ]),
            Campaign.aggregate([
                { $match: { sentAt: { $gte: startDate } } },
                { $unwind: '$analytics.byDevice' },
                { $group: { _id: '$analytics.byDevice.device', opens: { $sum: '$analytics.byDevice.opens' }, clicks: { $sum: '$analytics.byDevice.clicks' } } }
            ]),
            Campaign.aggregate([
                { $match: { sentAt: { $gte: startDate } } },
                { $unwind: '$analytics.byLocation' },
                { $group: { _id: '$analytics.byLocation.country', opens: { $sum: '$analytics.byLocation.opens' }, clicks: { $sum: '$analytics.byLocation.clicks' } } },
                { $sort: { opens: -1 } },
                { $limit: 10 }
            ]),
            Campaign.aggregate([
                { $match: { sentAt: { $gte: startDate } } },
                { $unwind: '$analytics.linkClicks' },
                { $group: { _id: '$analytics.linkClicks.url', clicks: { $sum: '$analytics.linkClicks.count' } } },
                { $sort: { clicks: -1 } },
                { $limit: 20 }
            ])
        ]);

        res.json({
            success: true,
            data: {
                emailPerformance,
                topCampaigns: campaignComparison,
                engagementDistribution: subscriberEngagement,
                conversionFunnel,
                deviceStats: deviceStats,
                geoStats: geoStats,
                topLinks
            }
        });
    } catch (err) {
        console.error('Analytics error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ============================================================
// NEWSLETTER SUBSCRIPTION (Public)
// ============================================================

// POST /api/marketing/subscribe - Subscribe to newsletter
router.post('/subscribe', async (req, res) => {
    try {
        const { email, firstName, lastName, source = 'website', preferences, tags, doubleOptIn = true } = req.body;

        if (!email) {
            return res.status(400).json({ success: false, message: 'Email is required' });
        }

        const emailLower = email.toLowerCase().trim();
        let subscriber = await Subscriber.findOne({ email: emailLower });

        if (subscriber) {
            if (subscriber.status === 'unsubscribed') {
                subscriber.status = 'subscribed';
                subscriber.lastSubscribedAt = new Date();
                subscriber.tags = [...new Set([...(subscriber.tags || []), ...(req.body.tags || [])])];
                subscriber.preferences = { ...subscriber.preferences, ...preferences };
                await subscriber.save();
                return res.json({ success: true, message: 'Resubscribed successfully', data: subscriber });
            }
            return res.json({ success: true, message: 'Already subscribed', data: subscriber });
        }

        const newSubscriber = new Subscriber({
            email,
            firstName,
            lastName,
            status: doubleOptIn ? 'pending' : 'subscribed',
            confirmed: !doubleOptIn,
            confirmedAt: doubleOptIn ? null : new Date(),
            source,
            tags,
            preferences,
            createdBy: req.user?.id
        });

        if (doubleOptIn) {
            // Generate confirmation token
            newSubscriber.confirmationToken = require('crypto').randomBytes(32).toString('hex');
            newSubscriber.confirmationSentAt = new Date();
        } else {
            newSubscriber.confirmed = true;
            newSubscriber.confirmedAt = new Date();
            newSubscriber.firstSubscribedAt = new Date();
        }

        await newSubscriber.save();

        // Send confirmation email if double opt-in
        if (doubleOptIn) {
            // await sendConfirmationEmail(newSubscriber);
        }

        res.status(201).json({
            success: true,
            message: doubleOptIn ? 'Please confirm your email address' : 'Subscribed successfully',
            data: { email: newSubscriber.email, status: newSubscriber.status }
        });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ success: false, message: 'Email already exists' });
        }
        console.error('Subscribe error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/marketing/confirm/:token - Confirm subscription
router.get('/confirm/:token', async (req, res) => {
    try {
        const subscriber = await Subscriber.findOne({ confirmationToken: req.params.token });
        if (!subscriber) {
            return res.status(404).send('Invalid or expired confirmation link');
        }

        subscriber.confirmSubscription();
        await subscriber.save();

        res.send('Email confirmed successfully! You are now subscribed.');
    } catch (err) {
        res.status(500).send('Error confirming subscription');
    }
});

// POST /api/marketing/unsubscribe - Unsubscribe
router.post('/unsubscribe', async (req, res) => {
    try {
        const { email, reason, method = 'link' } = req.body;
        if (!email) return res.status(400).json({ success: false, message: 'Email required' });

        const subscriber = await Subscriber.findOne({ email: email.toLowerCase().trim() });
        if (!subscriber) {
            return res.json({ success: true, message: 'Email not found' });
        }

        await subscriber.unsubscribe(reason, method);
        res.json({ success: true, message: 'Unsubscribed successfully' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// POST /api/marketing/send-test - Send test email
router.post('/send-test', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { campaignId, templateId, recipients, testData } = req.body;

        if (campaignId) {
            const campaign = await Campaign.findById(campaignId).populate('template');
            if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
            const result = await sendTestEmail(campaign, recipients || [req.user.email]);
            return res.json({ success: true, message: 'Test email sent', data: result });
        }

        if (templateId) {
            const template = await EmailTemplate.findById(templateId);
            if (!template) return res.status(404).json({ success: false, message: 'Template not found' });
            const result = await sendTestEmailFromTemplate(template, recipients || [req.user.email], testData);
            return res.json({ success: true, message: 'Test email sent', data: result });
        }

        res.status(400).json({ success: false, message: 'campaignId or templateId required' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;