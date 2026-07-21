const express = require('express');
const router = express.Router();
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Multer memory storage for images
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only JPEG, PNG, WebP, and GIF are allowed'), false);
        }
    }
});

// Multer memory storage for video
const uploadVideo = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo'];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only MP4, WebM, MOV, and AVI are allowed'), false);
        }
    }
});

// Helper: upload buffer to Cloudinary
function uploadToCloud(buffer, folder = 'trendy-wardrobe') {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            { folder, use_filename: true, unique_filename: true },
            (error, result) => {
                if (error) return reject(error);
                resolve(result);
            }
        );
        stream.end(buffer);
    });
}

// POST /api/upload – single image (admin only)
router.post('/', authenticateToken, requireAdmin, upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No image file provided' });
        }
        const result = await uploadToCloud(req.file.buffer);
        res.json({ success: true, url: result.secure_url, public_id: result.public_id });
    } catch (err) {
        console.error('Upload error:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// POST /api/upload/products – multiple product images
router.post('/products', authenticateToken, requireAdmin, upload.array('images', 10), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ success: false, message: 'No image files provided' });
        }
        const results = await Promise.all(req.files.map(f => uploadToCloud(f.buffer, 'trendy-products')));
        res.json({ success: true, urls: results.map(r => r.secure_url), publicIds: results.map(r => r.public_id) });
    } catch (err) {
        console.error('Product upload error:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// POST /api/upload/multiple – multiple images
router.post('/multiple', authenticateToken, requireAdmin, upload.array('images', 10), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ success: false, message: 'No image files provided' });
        }
        const results = await Promise.all(req.files.map(f => uploadToCloud(f.buffer)));
        res.json({ success: true, urls: results.map(r => r.secure_url), publicIds: results.map(r => r.public_id) });
    } catch (err) {
        console.error('Multiple upload error:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// POST /api/upload/hero-multiple – hero banner images
router.post('/hero-multiple', authenticateToken, requireAdmin, upload.array('images', 5), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ success: false, message: 'No image files provided' });
        }
        const results = await Promise.all(req.files.map(f => uploadToCloud(f.buffer, 'trendy-hero')));
        res.json({ success: true, urls: results.map(r => r.secure_url), publicIds: results.map(r => r.public_id) });
    } catch (err) {
        console.error('Hero upload error:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// POST /api/upload/gender – gender page images (accepts field name 'image' or 'genderImage')
router.post('/gender', authenticateToken, requireAdmin, upload.any(), async (req, res) => {
    try {
        const file = req.files && req.files[0];
        if (!file) {
            return res.status(400).json({ success: false, message: 'No image file provided' });
        }
        const result = await uploadToCloud(file.buffer, 'trendy-gender');
        res.json({ success: true, url: result.secure_url, public_id: result.public_id });
    } catch (err) {
        console.error('Gender upload error:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// POST /api/upload/category – category image (admin only)
router.post('/category', authenticateToken, requireAdmin, upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No image file provided' });
        }
        const result = await uploadToCloud(req.file.buffer, 'trendy-categories');
        res.json({ success: true, url: result.secure_url, public_id: result.public_id });
    } catch (err) {
        console.error('Category upload error:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// POST /api/upload/video – upload video (hero background, etc.)
router.post('/video', authenticateToken, requireAdmin, uploadVideo.single('video'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No video file provided' });
        }
        const result = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
                { folder: 'trendy-videos', resource_type: 'video', use_filename: true, unique_filename: true },
                (error, result) => {
                    if (error) return reject(error);
                    resolve(result);
                }
            );
            stream.end(req.file.buffer);
        });
        res.json({ success: true, url: result.secure_url, public_id: result.public_id });
    } catch (err) {
        console.error('Video upload error:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

module.exports = router;
