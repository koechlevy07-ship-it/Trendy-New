const express = require('express');
const router = express.Router();
const QuestionAnswer = require('../models/QuestionAnswer');
const Product = require('../models/Product');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// ============================================================
// PUBLIC ROUTES
// ============================================================

// GET /api/qa/product/:productId – get questions for a product (approved only)
router.get('/product/:productId', async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(50, Math.max(1, parseInt(limit)));

        const filter = { product: req.params.productId, status: 'approved' };

        const [questions, total] = await Promise.all([
            QuestionAnswer.find(filter)
                .populate('user', 'name')
                .populate('answers.user', 'name')
                .sort({ helpful: -1, createdAt: -1 })
                .skip((pageNum - 1) * limitNum)
                .limit(limitNum)
                .lean(),
            QuestionAnswer.countDocuments(filter)
        ]);

        res.json({
            success: true,
            data: questions,
            pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// POST /api/qa – ask a question (authenticated)
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { productId, text } = req.body;
        if (!productId || !text || !text.trim()) {
            return res.status(400).json({ success: false, message: 'Product ID and question text required' });
        }

        const product = await Product.findById(productId);
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

        const question = new QuestionAnswer({
            product: productId,
            user: req.user._id,
            text: text.trim()
        });
        await question.save();
        await question.populate('user', 'name');

        res.status(201).json({ success: true, data: question });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// POST /api/qa/:id/answer – answer a question (authenticated)
router.post('/:id/answer', authenticateToken, async (req, res) => {
    try {
        const { text } = req.body;
        if (!text || !text.trim()) {
            return res.status(400).json({ success: false, message: 'Answer text required' });
        }

        const question = await QuestionAnswer.findById(req.params.id);
        if (!question) return res.status(404).json({ success: false, message: 'Question not found' });

        question.answers.push({ user: req.user._id, text: text.trim() });
        await question.save();
        await question.populate('answers.user', 'name');

        res.status(201).json({ success: true, data: question });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// PUT /api/qa/:id/helpful – mark question as helpful
router.put('/:id/helpful', async (req, res) => {
    try {
        const question = await QuestionAnswer.findByIdAndUpdate(
            req.params.id,
            { $inc: { helpful: 1 } },
            { new: true }
        );
        if (!question) return res.status(404).json({ success: false, message: 'Question not found' });
        res.json({ success: true, data: { helpful: question.helpful } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ============================================================
// ADMIN ROUTES
// ============================================================

// GET /api/qa/admin/all – all questions (admin)
router.get('/admin/all', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { status, page = 1, limit = 50 } = req.query;
        const filter = {};
        if (status) filter.status = status;

        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

        const [questions, total] = await Promise.all([
            QuestionAnswer.find(filter)
                .populate('product', 'name slug')
                .populate('user', 'name email')
                .populate('answers.user', 'name')
                .sort({ createdAt: -1 })
                .skip((pageNum - 1) * limitNum)
                .limit(limitNum)
                .lean(),
            QuestionAnswer.countDocuments(filter)
        ]);

        res.json({
            success: true,
            data: questions,
            pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// PUT /api/qa/:id/status – update question status (admin)
router.put('/:id/status', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { status } = req.body;
        if (!['approved', 'pending', 'hidden'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }
        const question = await QuestionAnswer.findByIdAndUpdate(req.params.id, { status }, { new: true });
        if (!question) return res.status(404).json({ success: false, message: 'Question not found' });
        res.json({ success: true, data: question });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// DELETE /api/qa/:id – delete question (admin)
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const question = await QuestionAnswer.findByIdAndDelete(req.params.id);
        if (!question) return res.status(404).json({ success: false, message: 'Question not found' });
        res.json({ success: true, message: 'Question deleted' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

module.exports = router;
