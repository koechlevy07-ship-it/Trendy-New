const express = require('express');
const router = express.Router();
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only JPEG, PNG, WebP, GIF, and SVG are allowed'), false);
        }
    }
});

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

// POST /api/media/upload — upload to a specific folder
router.post('/upload', authenticateToken, requireAdmin, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file provided' });
        }
        const folder = req.body.folder || 'trendy-wardrobe';
        const result = await uploadToCloud(req.file.buffer, folder);
        res.json({
            success: true,
            url: result.secure_url,
            publicId: result.public_id,
            width: result.width,
            height: result.height,
            format: result.format,
            bytes: result.bytes,
            createdAt: result.created_at
        });
    } catch (err) {
        console.error('Media upload error:', err);
        res.status(500).json({ success: false, message: 'Upload failed' });
    }
});

// GET /api/media — list assets from Cloudinary (with optional folder filter)
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const folder = req.query.folder || 'trendy-wardrobe';
        const maxResults = parseInt(req.query.limit) || 50;
        const result = await cloudinary.search
            .expression(`folder:${folder}/*`)
            .sort_by('created_at', 'desc')
            .max_results(maxResults)
            .execute();
        const assets = (result.resources || []).map(r => ({
            publicId: r.public_id,
            url: r.secure_url,
            width: r.width,
            height: r.height,
            format: r.format,
            bytes: r.bytes,
            createdAt: r.created_at,
            folder: r.folder
        }));
        res.json({ success: true, data: assets, total: result.total_count });
    } catch (err) {
        console.error('Media list error:', err);
        res.status(500).json({ success: false, message: 'Failed to list media' });
    }
});

// GET /api/media/search — search Cloudinary assets
router.get('/search', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const query = req.query.q || '';
        const maxResults = parseInt(req.query.limit) || 50;
        const expression = query
            ? `resource_type:image AND (filename:*${query}* OR tags:*${query}*)`
            : `resource_type:image`;
        const result = await cloudinary.search
            .expression(expression)
            .sort_by('created_at', 'desc')
            .max_results(maxResults)
            .execute();
        const assets = (result.resources || []).map(r => ({
            publicId: r.public_id,
            url: r.secure_url,
            width: r.width,
            height: r.height,
            format: r.format,
            bytes: r.bytes,
            createdAt: r.created_at,
            folder: r.folder
        }));
        res.json({ success: true, data: assets, total: result.total_count });
    } catch (err) {
        console.error('Media search error:', err);
        res.status(500).json({ success: false, message: 'Search failed' });
    }
});

// DELETE /api/media/:publicId — delete asset from Cloudinary
router.delete('/:publicId', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const result = await cloudinary.uploader.destroy(req.params.publicId);
        res.json({ success: true, result });
    } catch (err) {
        console.error('Media delete error:', err);
        res.status(500).json({ success: false, message: 'Delete failed' });
    }
});

// GET /api/media/folders — list top-level folders
router.get('/folders', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const result = await cloudinary.api.root_folders();
        const folders = (result.folders || []).map(f => f.name);
        res.json({ success: true, data: folders });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to list folders' });
    }
});

module.exports = router;
