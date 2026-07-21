const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Inventory = require('../models/Inventory');
const Product = require('../models/Product');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

function escapeRegex(str) { return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

async function syncProductStock(productId) {
    const inv = await Inventory.findOne({ product: productId });
    const product = await Product.findById(productId);
    if (!product) return;
    if (inv) {
        product.stock = inv.quantity;
        product.reservedStock = inv.reservedQuantity;
        product.stockThreshold = inv.lowStockThreshold;
        product.inStock = inv.quantity > 0;
        product.soldOut = inv.quantity <= 0 && !product.preOrder && !product.limitedAvailable;
        await product.save();
    }
}

async function getOrCreateInventory(productId) {
    let inv = await Inventory.findOne({ product: productId });
    if (!inv) {
        const product = await Product.findById(productId);
        inv = new Inventory({
            product: productId,
            sku: product?.sku || '',
            quantity: product?.stock || 0,
            reservedQuantity: product?.reservedStock || 0,
            lowStockThreshold: product?.stockThreshold || 5
        });
        inv.history.push({
            previousQty: 0, newQty: inv.quantity, delta: inv.quantity,
            type: 'correction', reason: 'Initial sync from product', admin: 'system'
        });
        await inv.save();
    }
    return inv;
}

// GET /api/inventory/stats – dashboard stats
router.get('/stats', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [totalProducts, totalStock, inStock, lowStock, outOfStock, reservedStock, totalValue, recentChanges] = await Promise.all([
            Inventory.countDocuments(),
            Inventory.aggregate([{ $group: { _id: null, total: { $sum: '$quantity' } } }]),
            Inventory.countDocuments({ status: 'in_stock' }),
            Inventory.countDocuments({ status: 'low_stock' }),
            Inventory.countDocuments({ status: 'out_of_stock' }),
            Inventory.aggregate([{ $group: { _id: null, total: { $sum: '$reservedQuantity' } } }]),
            Inventory.aggregate([
                { $lookup: { from: 'products', localField: 'product', foreignField: '_id', as: 'p' } },
                { $unwind: { path: '$p', preserveNullAndEmptyArrays: true } },
                { $group: { _id: null, total: { $sum: { $multiply: ['$quantity', { $ifNull: ['$p.price', 0] }] } } } }
            ]),
            Inventory.find({ 'history.createdAt': { $gte: new Date(Date.now() - 86400000) } }).countDocuments()
        ]);
        res.json({
            success: true, data: {
                totalProducts: totalProducts || 0, totalStock: totalStock[0]?.total || 0,
                inStock: inStock || 0, lowStock: lowStock || 0, outOfStock: outOfStock || 0,
                reservedStock: reservedStock[0]?.total || 0,
                inventoryValue: totalValue[0]?.total || 0,
                recentChanges: recentChanges || 0
            }
        });
    } catch (err) { res.status(500).json({ success: false, message: 'Failed to fetch stats' }); }
});

// GET /api/inventory – list all inventory
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { page = 1, limit = 50, search, status, sort, warehouse } = req.query;
        const filter = {};
        if (status) filter.status = status;
        if (warehouse) filter.warehouse = warehouse;
        if (search) {
            const s = escapeRegex(search);
            const products = await Product.find({
                $or: [{ name: { $regex: s, $options: 'i' } }, { sku: { $regex: s, $options: 'i' } }, { brand: { $regex: s, $options: 'i' } }]
            }).select('_id').lean();
            filter.product = { $in: products.map(p => p._id) };
        }
        let sortObj = { updatedAt: -1 };
        if (sort === 'quantity') sortObj = { quantity: -1 };
        else if (sort === '-quantity') sortObj = { quantity: 1 };
        else if (sort === 'name') sortObj = { 'product.name': 1 };
        else if (sort === 'status') sortObj = { status: 1 };
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(500, Math.max(1, parseInt(limit)));
        const [items, total] = await Promise.all([
            Inventory.find(filter).sort(sortObj).skip((pageNum - 1) * limitNum).limit(limitNum)
                .populate('product', 'name sku brand category images price stockThreshold status'),
            Inventory.countDocuments(filter)
        ]);
        const data = items.map(i => ({
            _id: i._id, product: i.product, sku: i.sku, variantKey: i.variantKey,
            quantity: i.quantity, reservedQuantity: i.reservedQuantity,
            availableQuantity: Math.max(0, i.quantity - i.reservedQuantity),
            lowStockThreshold: i.lowStockThreshold, status: i.status, warehouse: i.warehouse,
            updatedAt: i.updatedAt, createdAt: i.createdAt
        }));
        res.json({ success: true, data, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } });
    } catch (err) { res.status(500).json({ success: false, message: 'Failed to fetch inventory' }); }
});

// GET /api/inventory/alerts – low stock / out of stock alerts
router.get('/alerts', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const critical = await Inventory.find({ status: 'out_of_stock' }).populate('product', 'name sku brand images price').sort({ updatedAt: -1 }).limit(20).lean();
        const low = await Inventory.find({ status: 'low_stock' }).populate('product', 'name sku brand images price').sort({ quantity: 1 }).limit(20).lean();
        const alerts = [
            ...critical.map(i => ({ ...i, alertType: 'out_of_stock', severity: 'critical' })),
            ...low.map(i => ({ ...i, alertType: 'low_stock', severity: 'warning' }))
        ];
        res.json({ success: true, data: alerts, total: alerts.length });
    } catch (err) { res.status(500).json({ success: false, message: 'Failed' }); }
});

// GET /api/inventory/history – full audit log
router.get('/history', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { page = 1, limit = 50, productId, type } = req.query;
        const match = {};
        if (productId) match['product'] = new mongoose.Types.ObjectId(productId);
        if (type) match['history.type'] = type;
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(200, Math.max(1, parseInt(limit)));
        const results = await Inventory.aggregate([
            { $match: productId ? { product: new mongoose.Types.ObjectId(productId) } : {} },
            { $unwind: '$history' },
            { $match: type ? { 'history.type': type } : {} },
            { $sort: { 'history.createdAt': -1 } },
            { $skip: (pageNum - 1) * limitNum },
            { $limit: limitNum },
            {
                $lookup: {
                    from: 'products', localField: 'product', foreignField: '_id', as: 'product'
                }
            },
            { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    _id: '$history._id', productId: '$product._id', productName: '$product.name',
                    productSku: '$product.sku', previousQty: '$history.previousQty',
                    newQty: '$history.newQty', delta: '$history.delta',
                    type: '$history.type', reason: '$history.reason',
                    reference: '$history.reference', admin: '$history.admin',
                    createdAt: '$history.createdAt'
                }
            }
        ]);
        const totalResult = await Inventory.aggregate([
            { $match: productId ? { product: new mongoose.Types.ObjectId(productId) } : {} },
            { $unwind: '$history' },
            { $match: type ? { 'history.type': type } : {} },
            { $count: 'total' }
        ]);
        res.json({ success: true, data: results, pagination: { page: pageNum, limit: limitNum, total: totalResult[0]?.total || 0, pages: Math.ceil((totalResult[0]?.total || 0) / limitNum) } });
    } catch (err) { res.status(500).json({ success: false, message: 'Failed to fetch history' }); }
});

// GET /api/inventory/export – CSV export data
router.get('/export', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const items = await Inventory.find({}).populate('product', 'name sku brand category price').lean();
        const data = items.map(i => ({
            'Product Name': i.product?.name || '', SKU: i.sku || i.product?.sku || '',
            Brand: i.product?.brand || '', Category: i.product?.category || '',
            Quantity: i.quantity, 'Reserved Stock': i.reservedQuantity,
            'Available Stock': Math.max(0, i.quantity - i.reservedQuantity),
            Threshold: i.lowStockThreshold, Status: i.status,
            Warehouse: i.warehouse || '', 'Last Updated': i.updatedAt ? new Date(i.updatedAt).toISOString() : ''
        }));
        res.json({ success: true, data });
    } catch (err) { res.status(500).json({ success: false, message: 'Export failed' }); }
});

// GET /api/inventory/:productId – single product inventory
router.get('/:productId', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const inv = await getOrCreateInventory(req.params.productId);
        res.json({ success: true, data: { ...inv.toObject(), availableQuantity: inv.availableQuantity } });
    } catch (err) { res.status(500).json({ success: false, message: 'Failed' }); }
});

// PUT /api/inventory/:productId – update stock (set)
router.put('/:productId', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { quantity, reason } = req.body;
        if (quantity === undefined || quantity < 0) return res.status(400).json({ success: false, message: 'Valid quantity required' });
        const inv = await getOrCreateInventory(req.params.productId);
        const previousQty = inv.quantity;
        const delta = parseInt(quantity) - previousQty;
        inv.quantity = parseInt(quantity);
        inv.history.push({ previousQty, newQty: inv.quantity, delta, type: 'manual', reason: reason || 'Manual stock update', admin: req.user?.name || req.user?.email || 'admin' });
        await inv.save();
        await syncProductStock(req.params.productId);
        res.json({ success: true, data: { ...inv.toObject(), availableQuantity: inv.availableQuantity } });
    } catch (err) { res.status(500).json({ success: false, message: 'Failed to update inventory' }); }
});

// POST /api/inventory/adjust – adjust stock (+/-)
router.post('/adjust', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { productId, delta, reason, type } = req.body;
        if (!productId || delta === undefined) return res.status(400).json({ success: false, message: 'productId and delta required' });
        const inv = await getOrCreateInventory(productId);
        const previousQty = inv.quantity;
        const newQty = Math.max(0, previousQty + parseInt(delta));
        inv.quantity = newQty;
        inv.history.push({ previousQty, newQty, delta: newQty - previousQty, type: type || 'adjustment', reason: reason || 'Stock adjustment', admin: req.user?.name || req.user?.email || 'admin' });
        await inv.save();
        await syncProductStock(productId);
        res.json({ success: true, data: { ...inv.toObject(), availableQuantity: inv.availableQuantity } });
    } catch (err) { res.status(500).json({ success: false, message: 'Failed to adjust stock' }); }
});

// POST /api/inventory/bulk-update – bulk operations
router.post('/bulk-update', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { products: updates, operation = 'set', reason } = req.body;
        if (!updates || !Array.isArray(updates) || !updates.length) return res.status(400).json({ success: false, message: 'No products provided' });
        const results = { updated: 0, errors: [] };
        for (const item of updates) {
            try {
                const inv = await getOrCreateInventory(item.productId);
                const previousQty = inv.quantity;
                let newQty;
                if (operation === 'set') newQty = Math.max(0, parseInt(item.quantity) || 0);
                else if (operation === 'increment') newQty = Math.max(0, previousQty + (parseInt(item.quantity) || 0));
                else if (operation === 'decrement') newQty = Math.max(0, previousQty - (parseInt(item.quantity) || 0));
                else if (operation === 'threshold') { inv.lowStockThreshold = Math.max(0, parseInt(item.quantity) || 5); await inv.save(); results.updated++; continue; }
                else continue;
                inv.quantity = newQty;
                inv.history.push({ previousQty, newQty, delta: newQty - previousQty, type: 'bulk', reason: reason || 'Bulk update', admin: req.user?.name || req.user?.email || 'admin' });
                await inv.save();
                await syncProductStock(item.productId);
                results.updated++;
            } catch (err) { results.errors.push({ productId: item.productId, message: err.message }); }
        }
        res.json({ success: true, data: results, message: `${results.updated} updated, ${results.errors.length} errors` });
    } catch (err) { res.status(500).json({ success: false, message: 'Bulk update failed' }); }
});

// POST /api/inventory/import – CSV import
router.post('/import', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { items } = req.body;
        if (!items || !Array.isArray(items) || !items.length) return res.status(400).json({ success: false, message: 'No items' });
        const results = { created: 0, updated: 0, errors: [] };
        for (let i = 0; i < items.length; i++) {
            const row = items[i];
            try {
                if (!row.sku && !row.productId) { results.errors.push({ row: i + 1, message: 'SKU or productId required' }); continue; }
                let product;
                if (row.productId) product = await Product.findById(row.productId);
                else product = await Product.findOne({ sku: row.sku });
                if (!product) { results.errors.push({ row: i + 1, message: `Product not found: ${row.sku || row.productId}` }); continue; }
                const qty = parseInt(row.quantity) || 0;
                const inv = await getOrCreateInventory(product._id);
                const previousQty = inv.quantity;
                if (row.operation === 'add' || row.operation === 'increment') inv.quantity = Math.max(0, previousQty + qty);
                else if (row.operation === 'set') inv.quantity = qty;
                else inv.quantity = qty;
                if (row.threshold !== undefined) inv.lowStockThreshold = Math.max(0, parseInt(row.threshold));
                inv.history.push({ previousQty, newQty: inv.quantity, delta: inv.quantity - previousQty, type: 'import', reason: row.reason || 'CSV import', admin: req.user?.name || req.user?.email || 'admin' });
                await inv.save();
                await syncProductStock(product._id);
                results.updated++;
            } catch (err) { results.errors.push({ row: i + 1, message: err.message }); }
        }
        res.json({ success: true, data: results, message: `${results.updated} updated, ${results.errors.length} errors` });
    } catch (err) { res.status(500).json({ success: false, message: 'Import failed' }); }
});

module.exports = router;
