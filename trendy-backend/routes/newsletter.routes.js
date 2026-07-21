const express = require('express');
const router = express.Router();
const Newsletter = require('../models/Newsletter');

router.post('/', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ success: false, message: 'Email is required' });
        await Newsletter.findOneAndUpdate(
            { email: email.toLowerCase() },
            { email: email.toLowerCase(), active: true },
            { upsert: true, new: true }
        );
        res.status(201).json({ success: true, message: 'Subscribed successfully' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

module.exports = router;
