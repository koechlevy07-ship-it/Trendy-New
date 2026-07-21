const express = require('express');
const router = express.Router();
const Contact = require('../models/Contact');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { sendContactAcknowledgment, sendAdminNewContact, sendAdminContactReply } = require('../services/emailService');

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================================
// STATIC ADMIN ROUTES (MUST be before /:id routes)
// ============================================================

// GET /api/contact/admin/stats – full support analytics
router.get('/admin/stats', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const [total, newCount, openCount, readCount, inProgress, pending, waiting, resolved, closed, spam, urgent, todayCount, monthlyCount, avgResponse] = await Promise.all([
            Contact.countDocuments(),
            Contact.countDocuments({ status: 'new' }),
            Contact.countDocuments({ status: 'open' }),
            Contact.countDocuments({ status: 'read' }),
            Contact.countDocuments({ status: 'in_progress' }),
            Contact.countDocuments({ status: 'pending' }),
            Contact.countDocuments({ status: 'waiting_for_customer' }),
            Contact.countDocuments({ status: 'resolved' }),
            Contact.countDocuments({ status: 'closed' }),
            Contact.countDocuments({ status: 'spam' }),
            Contact.countDocuments({ priority: 'urgent', status: { $nin: ['closed', 'resolved', 'spam'] } }),
            Contact.countDocuments({ createdAt: { $gte: todayStart } }),
            Contact.countDocuments({ createdAt: { $gte: monthStart } }),
            Contact.aggregate([
                { $match: { responseTime: { $gt: 0 } } },
                { $group: { _id: null, avg: { $avg: '$responseTime' } } }
            ])
        ]);
        const avgResponseTime = avgResponse.length > 0 ? Math.round(avgResponse[0].avg) : 0;
        res.json({
            success: true,
            data: {
                total, new: newCount, open: openCount, read: readCount,
                in_progress: inProgress, pending, waiting_for_customer: waiting,
                resolved, closed, spam, urgent,
                today: todayCount, monthly: monthlyCount,
                avgResponseTime,
                totalOpen: newCount + openCount + readCount + inProgress + pending + waiting
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// GET /api/contact/admin – list with filters, search, pagination, date range
router.get('/admin', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { status, priority, category, assignedTo, search, sort, page = 1, limit = 50, dateFrom, dateTo } = req.query;
        const filter = {};
        if (status && status !== 'all') filter.status = status;
        if (priority && priority !== 'all') filter.priority = priority;
        if (category && category !== 'all') filter.category = category;
        if (assignedTo && assignedTo !== 'all') filter.assignedTo = assignedTo;
        if (dateFrom || dateTo) {
            filter.createdAt = {};
            if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
            if (dateTo) {
                const end = new Date(dateTo);
                end.setHours(23, 59, 59, 999);
                filter.createdAt.$lte = end;
            }
        }
        if (search) {
            const safe = escapeRegex(search);
            filter.$or = [
                { name: { $regex: safe, $options: 'i' } },
                { email: { $regex: safe, $options: 'i' } },
                { subject: { $regex: safe, $options: 'i' } },
                { ticketId: { $regex: safe, $options: 'i' } },
                { phone: { $regex: safe, $options: 'i' } },
                { message: { $regex: safe, $options: 'i' } }
            ];
        }

        let sortObj = { createdAt: -1 };
        if (sort === 'oldest') sortObj = { createdAt: 1 };
        else if (sort === 'priority') sortObj = { priority: -1, createdAt: -1 };
        else if (sort === 'status') sortObj = { status: 1, createdAt: -1 };
        else if (sort === 'name') sortObj = { name: 1, createdAt: -1 };
        else if (sort === 'updated') sortObj = { updatedAt: -1 };

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [contacts, total] = await Promise.all([
            Contact.find(filter).sort(sortObj).skip(skip).limit(parseInt(limit)).populate('assignedTo', 'name email'),
            Contact.countDocuments(filter)
        ]);
        res.json({
            success: true,
            data: contacts,
            total,
            page: parseInt(page),
            pages: Math.ceil(total / parseInt(limit))
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// GET /api/contact/admin/export – CSV export
router.get('/admin/export', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { status, priority, category, dateFrom, dateTo } = req.query;
        const filter = {};
        if (status && status !== 'all') filter.status = status;
        if (priority && priority !== 'all') filter.priority = priority;
        if (category && category !== 'all') filter.category = category;
        if (dateFrom || dateTo) {
            filter.createdAt = {};
            if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
            if (dateTo) {
                const end = new Date(dateTo);
                end.setHours(23, 59, 59, 999);
                filter.createdAt.$lte = end;
            }
        }

        const contacts = await Contact.find(filter).sort({ createdAt: -1 }).lean();
        const header = 'Ticket ID,Name,Email,Phone,Subject,Category,Priority,Status,Source,Assigned To,Date,Last Updated,First Reply,Response Time (min),Resolution Date,Message';
        const rows = contacts.map(c => {
            const date = c.createdAt ? new Date(c.createdAt).toISOString() : '';
            const updated = c.updatedAt ? new Date(c.updatedAt).toISOString() : '';
            const firstReply = c.firstReplyAt ? new Date(c.firstReplyAt).toISOString() : '';
            const respTime = c.responseTime ? Math.round(c.responseTime / 60000) : '';
            const resolved = c.resolvedAt ? new Date(c.resolvedAt).toISOString() : '';
            const msg = (c.message || '').replace(/"/g, '""');
            return `"${c.ticketId || ''}","${c.name}","${c.email}","${c.phone || ''}","${c.subject || ''}","${c.category || ''}","${c.priority || ''}","${c.status || ''}","${c.source || ''}","${c.assignedToName || ''}","${date}","${updated}","${firstReply}","${respTime}","${resolved}","${msg}"`;
        }).join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=contacts-export.csv');
        res.send(header + '\n' + rows);
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// POST /api/contact/admin/bulk – bulk operations
router.post('/admin/bulk', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { ids, action, value } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, message: 'No IDs provided' });
        }
        const validActions = [
            'delete', 'mark-new', 'mark-read', 'mark-open', 'mark-in-progress',
            'mark-resolved', 'mark-closed', 'mark-spam', 'set-priority',
            'set-category', 'assign'
        ];
        if (!validActions.includes(action)) {
            return res.status(400).json({ success: false, message: 'Invalid action' });
        }

        let result;
        const now = new Date();
        switch (action) {
            case 'delete':
                result = await Contact.deleteMany({ _id: { $in: ids } });
                break;
            case 'mark-new':
                result = await Contact.updateMany({ _id: { $in: ids } }, { status: 'new', resolvedAt: null, closedAt: null });
                break;
            case 'mark-read':
                result = await Contact.updateMany({ _id: { $in: ids }, status: { $in: ['new', 'open'] } }, { status: 'read' });
                break;
            case 'mark-open':
                result = await Contact.updateMany({ _id: { $in: ids } }, { status: 'open' });
                break;
            case 'mark-in-progress':
                result = await Contact.updateMany({ _id: { $in: ids } }, { status: 'in_progress' });
                break;
            case 'mark-resolved':
                result = await Contact.updateMany({ _id: { $in: ids } }, { status: 'resolved', resolvedAt: now });
                break;
            case 'mark-closed':
                result = await Contact.updateMany({ _id: { $in: ids } }, { status: 'closed', closedAt: now });
                break;
            case 'mark-spam':
                result = await Contact.updateMany({ _id: { $in: ids } }, { status: 'spam', spamReason: value || 'Marked as spam by admin' });
                break;
            case 'set-priority':
                if (!['low', 'medium', 'high', 'urgent'].includes(value)) {
                    return res.status(400).json({ success: false, message: 'Invalid priority value' });
                }
                result = await Contact.updateMany({ _id: { $in: ids } }, { priority: value });
                break;
            case 'set-category':
                if (!['general', 'order', 'product', 'technical', 'feedback', 'complaint', 'shipping', 'returns', 'other'].includes(value)) {
                    return res.status(400).json({ success: false, message: 'Invalid category value' });
                }
                result = await Contact.updateMany({ _id: { $in: ids } }, { category: value });
                break;
            case 'assign':
                result = await Contact.updateMany({ _id: { $in: ids } }, {
                    assignedTo: value || null,
                    assignedToName: req.body.valueName || '',
                    assignedAt: now
                });
                break;
        }
        res.json({ success: true, message: `Bulk ${action} applied`, modified: result ? result.modifiedCount : 0 });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// GET /api/contact/admin/analytics – detailed analytics
router.get('/admin/analytics', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const now = new Date();
        const daysAgo = (days) => new Date(now.getTime() - days * 86400000);
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        const [messagesByDay, messagesByMonth, topCategories, avgResolutionTime, adminStats] = await Promise.all([
            Contact.aggregate([
                { $match: { createdAt: { $gte: daysAgo(30) } } },
                { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
                { $sort: { _id: 1 } }
            ]),
            Contact.aggregate([
                { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }, count: { $sum: 1 } } },
                { $sort: { _id: -1 } },
                { $limit: 12 }
            ]),
            Contact.aggregate([
                { $group: { _id: '$category', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]),
            Contact.aggregate([
                { $match: { status: { $in: ['resolved', 'closed'] }, resolvedAt: { $ne: null } } },
                { $project: { resolutionTime: { $subtract: ['$resolvedAt', '$createdAt'] } } },
                { $group: { _id: null, avg: { $avg: '$resolutionTime' } } }
            ]),
            Contact.aggregate([
                { $match: { assignedToName: { $ne: '' } } },
                { $group: { _id: '$assignedToName', count: { $sum: 1 }, resolved: { $sum: { $cond: [{ $in: ['$status', ['resolved', 'closed']] }, 1, 0] } } } },
                { $sort: { count: -1 } },
                { $limit: 10 }
            ])
        ]);

        const avgResMs = avgResolutionTime.length > 0 ? Math.round(avgResolutionTime[0].avg) : 0;
        const avgResolutionHours = avgResMs > 0 ? Math.round(avgResMs / 3600000 * 10) / 10 : 0;

        res.json({
            success: true,
            data: {
                messagesByDay,
                messagesByMonth,
                topCategories,
                avgResolutionTime: avgResMs,
                avgResolutionHours,
                adminStats
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ============================================================
// CUSTOMER-FACING ROUTES
// ============================================================

// GET /api/contact/my-tickets – customer's own tickets (requires auth)
router.get('/my-tickets', authenticateToken, async (req, res) => {
    try {
        const tickets = await Contact.find({
            $or: [
                { userId: req.user._id },
                { email: req.user.email.toLowerCase() }
            ]
        }).sort({ createdAt: -1 }).select('ticketId name subject status priority category createdAt updatedAt replies');
        res.json({ success: true, data: tickets });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ============================================================
// PUBLIC ROUTES
// ============================================================

// POST /api/contact – public submit
router.post('/', async (req, res) => {
    try {
        const { name, email, phone, subject, message, category, userId } = req.body;
        if (!name || !email || !message) {
            return res.status(400).json({ success: false, message: 'Name, email, and message are required' });
        }
        const contact = new Contact({
            name, email, phone: phone || '',
            subject: subject || 'General Inquiry',
            message, category: category || 'general',
            userId: userId || null, status: 'new'
        });
        await contact.save();
        sendContactAcknowledgment({ name, email, subject: contact.subject, message }).catch(() => {});
        sendAdminNewContact({ name, email, phone, subject: contact.subject, message }).catch(() => {});
        res.status(201).json({ success: true, message: 'Message sent successfully', ticketId: contact.ticketId });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// GET /api/contact/ – backward compat admin list
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const contacts = await Contact.find().sort({ createdAt: -1 });
        res.json({ success: true, data: contacts });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// GET /api/contact/stats – backward-compat alias (old frontend format)
router.get('/stats', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [total, newCount, readCount, repliedCount] = await Promise.all([
            Contact.countDocuments(),
            Contact.countDocuments({ status: { $in: ['new', 'open'] } }),
            Contact.countDocuments({ status: { $in: ['read', 'in_progress', 'pending', 'waiting_for_customer'] } }),
            Contact.countDocuments({ status: { $in: ['resolved', 'closed'] } })
        ]);
        res.json({ success: true, data: { total, new: newCount, read: readCount, replied: repliedCount } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ============================================================
// PARAMETERIZED ROUTES (must be after static routes)
// ============================================================

// GET /api/contact/:id – get single
router.get('/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const contact = await Contact.findById(req.params.id)
            .populate('assignedTo', 'name email')
            .populate('replies.adminId', 'name')
            .populate('assignmentHistory.assignedTo', 'name email')
            .populate('assignmentHistory.assignedBy', 'name email');
        if (!contact) return res.status(404).json({ success: false, message: 'Contact not found' });
        res.json({ success: true, data: contact });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// POST /api/contact/:id/reply – send reply
router.post('/:id/reply', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { reply, isInternal } = req.body;
        if (!reply || !reply.trim()) {
            return res.status(400).json({ success: false, message: 'Reply text is required' });
        }
        const contact = await Contact.findById(req.params.id);
        if (!contact) return res.status(404).json({ success: false, message: 'Contact not found' });

        contact.replies.push({
            text: reply.trim(),
            adminId: req.user._id,
            adminName: req.user.name || 'Admin',
            isInternal: !!isInternal
        });

        if (!contact.firstReplyAt && !isInternal) {
            contact.firstReplyAt = new Date();
            contact.responseTime = contact.firstReplyAt.getTime() - new Date(contact.createdAt).getTime();
        }

        if (!isInternal) {
            if (['new', 'open'].includes(contact.status)) contact.status = 'in_progress';
            else if (contact.status === 'waiting_for_customer') contact.status = 'in_progress';
        }

        await contact.save();

        if (!isInternal) {
            sendAdminContactReply(
                { name: contact.name, email: contact.email },
                reply.trim(),
                req.user.name || 'Admin'
            ).catch(() => {});
        }

        if (contact.userId && !isInternal) {
            try {
                await Notification.create({
                    userId: contact.userId,
                    type: 'contact',
                    title: 'Support ticket replied',
                    message: `Admin replied to ticket ${contact.ticketId}: ${reply.trim().substring(0, 100)}`,
                    data: { ticketId: contact.ticketId, contactId: contact._id }
                });
            } catch (_) {}
        }

        res.json({ success: true, message: 'Reply sent', data: contact });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// PUT /api/contact/:id/read – mark as read
router.put('/:id/read', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const contact = await Contact.findById(req.params.id);
        if (!contact) return res.status(404).json({ success: false, message: 'Contact not found' });
        if (['new', 'open'].includes(contact.status)) contact.status = 'read';
        await contact.save();
        res.json({ success: true, message: 'Marked as read', data: contact });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// PUT /api/contact/:id/status – update status (validated)
router.put('/:id/status', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { status } = req.body;
        const validStatuses = ['new', 'open', 'read', 'in_progress', 'pending', 'waiting_for_customer', 'resolved', 'closed', 'spam'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }
        const contact = await Contact.findById(req.params.id);
        if (!contact) return res.status(404).json({ success: false, message: 'Contact not found' });
        contact.status = status;
        await contact.save();
        res.json({ success: true, message: 'Status updated', data: contact });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// PUT /api/contact/:id/priority – update priority
router.put('/:id/priority', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { priority } = req.body;
        const validPriorities = ['low', 'medium', 'high', 'urgent'];
        if (!validPriorities.includes(priority)) {
            return res.status(400).json({ success: false, message: 'Invalid priority' });
        }
        const contact = await Contact.findByIdAndUpdate(req.params.id, { priority }, { new: true });
        if (!contact) return res.status(404).json({ success: false, message: 'Contact not found' });
        res.json({ success: true, message: 'Priority updated', data: contact });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// PUT /api/contact/:id/assign – assign to admin
router.put('/:id/assign', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { assignedTo, assignedToName } = req.body;
        const contact = await Contact.findById(req.params.id);
        if (!contact) return res.status(404).json({ success: false, message: 'Contact not found' });

        const now = new Date();
        if (assignedTo && assignedTo !== String(contact.assignedTo || '')) {
            contact.assignmentHistory.push({
                assignedTo: assignedTo,
                assignedToName: assignedToName || '',
                assignedBy: req.user._id,
                assignedByName: req.user.name || 'Admin',
                assignedAt: now
            });
        }

        contact.assignedTo = assignedTo || null;
        contact.assignedToName = assignedToName || '';
        contact.assignedAt = now;
        await contact.save();

        res.json({ success: true, message: 'Ticket assigned', data: contact });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// POST /api/contact/:id/spam – mark as spam
router.post('/:id/spam', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { reason } = req.body;
        const contact = await Contact.findByIdAndUpdate(
            req.params.id,
            { status: 'spam', spamReason: reason || 'Marked as spam by admin' },
            { new: true }
        );
        if (!contact) return res.status(404).json({ success: false, message: 'Contact not found' });
        res.json({ success: true, message: 'Marked as spam', data: contact });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// PUT /api/contact/:id – generic update
router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const allowed = ['name', 'email', 'phone', 'subject', 'message', 'status', 'priority', 'category', 'internalNotes', 'resolutionNotes', 'spamReason'];
        const updates = {};
        for (const key of allowed) {
            if (req.body[key] !== undefined) updates[key] = req.body[key];
        }
        const contact = await Contact.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
        if (!contact) return res.status(404).json({ success: false, message: 'Contact not found' });
        res.json({ success: true, message: 'Contact updated', data: contact });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// DELETE /api/contact/:id – delete
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const contact = await Contact.findByIdAndDelete(req.params.id);
        if (!contact) return res.status(404).json({ success: false, message: 'Contact not found' });
        res.json({ success: true, message: 'Contact deleted' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

module.exports = router;
