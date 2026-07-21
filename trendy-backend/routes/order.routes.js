const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const Settings = require('../models/Settings');
const Inventory = require('../models/Inventory');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');
const { sendOrderConfirmation, sendAdminNewOrder, sendOrderStatusUpdate } = require('../services/emailService');

function escapeRegex(str) { return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

async function logInventoryChange(productId, qty, type, reason, ref = '') {
    try {
        let inv = await Inventory.findOne({ product: productId });
        if (!inv) {
            const product = await Product.findById(productId);
            inv = new Inventory({
                product: productId,
                sku: product?.sku || '',
                quantity: Math.max(0, (product?.stock || 0)),
                reservedQuantity: product?.reservedStock || 0,
                lowStockThreshold: product?.stockThreshold || 5
            });
        }
        const previousQty = inv.quantity;
        const newQty = Math.max(0, previousQty + qty);
        inv.quantity = newQty;
        inv.history.push({ previousQty, newQty, delta: qty, type, reason, reference: ref, admin: 'system' });
        await inv.save();
    } catch (err) { console.error('Inventory sync error:', err.message); }
}

function generateOrderNumber() {
    const ts = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    return 'TW-' + ts + rand;
}

const validTransitions = {
    'pending': ['confirmed', 'cancelled'],
    'confirmed': ['processing', 'cancelled'],
    'processing': ['packed', 'cancelled'],
    'packed': ['ready-for-dispatch', 'cancelled'],
    'ready-for-dispatch': ['shipped', 'cancelled'],
    'shipped': ['out-for-delivery'],
    'out-for-delivery': ['delivered'],
    'delivered': ['returned'],
    'returned': ['refunded'],
    'cancelled': [],
    'refunded': []
};

function isValidTransition(from, to) {
    if (from === to) return true;
    const allowed = validTransitions[from];
    return allowed && allowed.includes(to);
}

// ============================================================
// GET ROUTES – Static paths before parameterized
// ============================================================

// GET /api/orders/my-orders – user's order list
router.get('/my-orders', authenticateToken, async (req, res) => {
    try {
        const orders = await Order.find({ user: req.user.id })
            .populate('items.productId', 'name images')
            .sort({ createdAt: -1 });
        res.json({ success: true, data: orders });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// GET /api/orders/shipping-options
router.get('/shipping-options', async (req, res) => {
    try {
        let settings = await Settings.findOne();
        const freeThreshold = settings?.freeDeliveryThreshold || 15000;
        const options = [
            { type: 'standard', label: 'Standard Delivery', fee: 500, estimatedDays: '3-7 business days', provider: 'Courier Service', freeThreshold },
            { type: 'express', label: 'Express Delivery', fee: 1200, estimatedDays: '1-2 business days', provider: 'Express Courier', freeThreshold },
            { type: 'same-day', label: 'Same-Day Delivery', fee: 2000, estimatedDays: 'Today (order before 2PM)', provider: 'SpeedX', freeThreshold },
            { type: 'pickup', label: 'Store Pickup', fee: 0, estimatedDays: 'Ready in 2-4 hours', provider: '' }
        ];
        res.json({ success: true, data: options });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// GET /api/orders/payment-methods
router.get('/payment-methods', async (req, res) => {
    try {
        let settings = await Settings.findOne();
        const methods = settings?.paymentMethods?.length ? settings.paymentMethods : ['Cash on Delivery', 'M-Pesa', 'Card Payment', 'PayPal', 'Stripe'];
        const mapped = methods.map(m => {
            const mKey = m.toLowerCase().replace(/\s+/g, '-');
            return { id: mKey, label: m };
        });
        res.json({ success: true, data: mapped });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// GET /api/orders/export – CSV export
router.get('/export', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { status, startDate, endDate, paymentStatus, search } = req.query;
        const filter = {};
        if (status && status !== 'all') filter.status = status;
        if (paymentStatus) filter['paymentDetails.paymentStatus'] = paymentStatus;
        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) filter.createdAt.$gte = new Date(startDate);
            if (endDate) filter.createdAt.$lte = new Date(endDate);
        }
        if (search) {
            const s = escapeRegex(search);
            filter.$or = [
                { orderNumber: { $regex: s, $options: 'i' } },
                { 'shippingAddress.fullName': { $regex: s, $options: 'i' } },
                { 'shippingAddress.phone': { $regex: s, $options: 'i' } },
                { email: { $regex: s, $options: 'i' } }
            ];
        }
        const orders = await Order.find(filter).populate('user', 'name email').sort({ createdAt: -1 });
        const headers = 'Order #,Customer,Email,Phone,County,City,Address,Items,Subtotal,Delivery,Tax,Discount,Coupon,Total,Payment,Payment Status,Status,Courier,Tracking,Date';
        const csv = orders.map(o => {
            const items = o.items.map(i => `${i.name} x${i.quantity}`).join('; ');
            return `"${o.orderNumber}","${o.shippingAddress?.fullName || ''}","${o.email || o.user?.email || ''}","${o.shippingAddress?.phone || ''}","${o.shippingAddress?.county || ''}","${o.shippingAddress?.city || ''}","${o.shippingAddress?.street || ''} ${o.shippingAddress?.apartment || ''}","${items}",${o.subtotal},${o.deliveryFee},${o.tax || 0},${o.discount || 0},"${o.couponCode || ''}",${o.total},"${o.paymentMethod}","${o.paymentDetails?.paymentStatus || 'pending'}","${o.status}","${o.courier || ''}","${o.trackingNumber || ''}","${o.createdAt}"`;
        }).join('\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=orders-${Date.now()}.csv`);
        res.send(headers + '\n' + csv);
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// GET /api/orders/admin/statistics – enhanced stats
router.get('/admin/statistics', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        const [
            totalOrders, pendingOrders, confirmedOrders, processingOrders,
            packedOrders, shippedOrders, outForDeliveryOrders, deliveredOrders,
            cancelledOrders, refundedOrders, returnedOrders, todayOrders, monthOrders,
            revenueResult, ordersByDay, ordersByMonth, revenueByMonth, topProducts, topReturned
        ] = await Promise.all([
            Order.countDocuments(),
            Order.countDocuments({ status: 'pending' }),
            Order.countDocuments({ status: 'confirmed' }),
            Order.countDocuments({ status: 'processing' }),
            Order.countDocuments({ status: 'packed' }),
            Order.countDocuments({ status: 'shipped' }),
            Order.countDocuments({ status: 'out-for-delivery' }),
            Order.countDocuments({ status: 'delivered' }),
            Order.countDocuments({ status: 'cancelled' }),
            Order.countDocuments({ status: 'refunded' }),
            Order.countDocuments({ status: 'returned' }),
            Order.countDocuments({ createdAt: { $gte: todayStart } }),
            Order.countDocuments({ createdAt: { $gte: monthStart } }),
            Order.aggregate([
                { $match: { status: { $nin: ['cancelled', 'refunded'] } } },
                { $group: { _id: null, total: { $sum: '$total' } } }
            ]),
            Order.aggregate([
                { $match: { createdAt: { $gte: new Date(now.getTime() - 30 * 86400000) } } },
                { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 }, revenue: { $sum: { $cond: [{ $in: ['$status', ['cancelled', 'refunded']] }, 0, '$total'] } } } },
                { $sort: { _id: 1 } }
            ]),
            Order.aggregate([
                { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, count: { $sum: 1 }, revenue: { $sum: { $cond: [{ $in: ['$status', ['cancelled', 'refunded']] }, 0, '$total'] } } } },
                { $sort: { '_id.year': -1, '_id.month': -1 } }
            ]),
            Order.aggregate([
                { $match: { createdAt: { $gte: monthStart }, status: { $nin: ['cancelled', 'refunded'] } } },
                { $unwind: '$items' },
                { $group: { _id: '$items.name', count: { $sum: '$items.quantity' }, revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } } } },
                { $sort: { count: -1 } },
                { $limit: 10 }
            ]),
            Order.aggregate([
                { $match: { status: 'returned' } },
                { $unwind: '$items' },
                { $group: { _id: '$items.name', count: { $sum: '$items.quantity' } } },
                { $sort: { count: -1 } },
                { $limit: 10 }
            ])
        ]);

        const totalRevenue = revenueResult.length > 0 ? revenueResult[0].total : 0;
        const avgOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;
        const cancellationRate = totalOrders > 0 ? ((cancelledOrders / totalOrders) * 100).toFixed(1) : 0;
        const refundRate = totalOrders > 0 ? ((refundedOrders / totalOrders) * 100).toFixed(1) : 0;

        res.json({
            success: true,
            data: {
                totalOrders, pendingOrders, confirmedOrders, processingOrders,
                packedOrders, shippedOrders, outForDeliveryOrders, deliveredOrders,
                cancelledOrders, refundedOrders, returnedOrders, todayOrders, monthOrders,
                totalRevenue, avgOrderValue, cancellationRate, refundRate,
                ordersByDay, ordersByMonth, revenueByMonth: ordersByMonth,
                topProducts, topReturned
            }
        });
    } catch (err) {
        console.error('Statistics error:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch statistics' });
    }
});

// GET /api/orders/admin/all – all orders (admin)
router.get('/admin/all', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { status, search, sort, page, limit, paymentStatus, startDate, endDate, paymentMethod } = req.query;
        const filter = {};
        if (status && status !== 'all') filter.status = status;
        if (paymentStatus) filter['paymentDetails.paymentStatus'] = paymentStatus;
        if (paymentMethod) filter.paymentMethod = paymentMethod;
        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) filter.createdAt.$gte = new Date(startDate);
            if (endDate) filter.createdAt.$lte = new Date(endDate);
        }
        if (search) {
            const s = escapeRegex(search);
            filter.$or = [
                { orderNumber: { $regex: s, $options: 'i' } },
                { 'shippingAddress.fullName': { $regex: s, $options: 'i' } },
                { 'shippingAddress.phone': { $regex: s, $options: 'i' } },
                { email: { $regex: s, $options: 'i' } },
                { 'items.name': { $regex: s, $options: 'i' } },
                { 'items.sku': { $regex: s, $options: 'i' } }
            ];
        }
        let sortOption = { createdAt: -1 };
        if (sort === 'oldest') sortOption = { createdAt: 1 };
        if (sort === 'total-high') sortOption = { total: -1 };
        if (sort === 'total-low') sortOption = { total: 1 };
        if (sort === 'status') sortOption = { status: 1 };

        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.min(200, Math.max(1, parseInt(limit) || 50));

        const [orders, total] = await Promise.all([
            Order.find(filter)
                .populate('user', 'name email')
                .sort(sortOption)
                .skip((pageNum - 1) * limitNum)
                .limit(limitNum),
            Order.countDocuments(filter)
        ]);

        res.json({
            success: true,
            data: orders,
            pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// GET /api/orders/admin/:id – single order detail (admin)
router.get('/admin/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id).populate('user', 'name email phone');
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
        res.json({ success: true, data: order });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// GET /api/orders/number/:orderNumber – lookup by order number
router.get('/number/:orderNumber', authenticateToken, async (req, res) => {
    try {
        const order = await Order.findOne({ orderNumber: req.params.orderNumber }).populate('items.productId', 'name images');
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
        if (order.user.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }
        res.json({ success: true, data: order });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// GET /api/orders/:id – single order (user facing)
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id).populate('items.productId', 'name images slug');
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
        if (order.user.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }
        res.json({ success: true, data: order });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ============================================================
// POST ROUTES
// ============================================================

// POST /api/orders – create order
router.post('/', authenticateToken, validate(schemas.order), async (req, res) => {
    try {
        const { items, shippingAddress, billingAddress, deliveryMethod, paymentMethod, couponCode, couponDiscount, notes } = req.body;
        if (!shippingAddress || !shippingAddress.fullName || !shippingAddress.phone || !shippingAddress.city)
            return res.status(400).json({ success: false, message: 'Shipping address is required' });

        let subtotal = 0;
        const orderItems = [];
        const stockUpdates = [];

        for (const item of items) {
            const product = await Product.findById(item.productId || item.id);
            if (!product) return res.status(400).json({ success: false, message: `Product not found: ${item.productId || item.id}` });
            const qty = item.quantity || 1;

            if (!product.preOrder && !product.limitedAvailable) {
                if (product.stock < qty) {
                    return res.status(400).json({ success: false, message: `Insufficient stock for "${product.name}". Available: ${product.stock}, requested: ${qty}` });
                }
                stockUpdates.push({ productId: product._id, qty });
            }

            const price = product.price;
            const img = product.images && product.images.length > 0 ? product.images[0] : '';
            const lineTotal = price * qty;
            subtotal += lineTotal;
            orderItems.push({
                productId: product._id,
                name: product.name,
                quantity: qty,
                price,
                originalPrice: product.originalPrice || 0,
                discount: 0,
                lineTotal,
                image: img,
                size: item.size || '',
                color: item.color || '',
                sku: product.sku || '',
                brand: product.brand || '',
                category: product.category || ''
            });
        }

        let deliveryFee = 500;
        let deliveryLabel = 'Standard Delivery';
        let deliveryEstimatedDays = '3-7 business days';
        let deliveryProvider = '';
        if (deliveryMethod) {
            if (deliveryMethod.type === 'express') {
                deliveryFee = 1200;
                deliveryLabel = 'Express Delivery';
                deliveryEstimatedDays = '1-2 business days';
                deliveryProvider = 'Express Courier';
            } else if (deliveryMethod.type === 'same-day') {
                deliveryFee = 2000;
                deliveryLabel = 'Same-Day Delivery';
                deliveryEstimatedDays = 'Today';
                deliveryProvider = 'SpeedX';
            } else if (deliveryMethod.type === 'pickup') {
                deliveryFee = 0;
                deliveryLabel = 'Store Pickup';
                deliveryEstimatedDays = 'Ready in 2-4 hours';
                deliveryProvider = '';
            }
        }
        if (subtotal >= 15000 && deliveryMethod?.type !== 'pickup') {
            deliveryFee = 0;
        }

        const discountAmount = couponDiscount || 0;
        const tax = Math.round(subtotal * 0.0);
        const total = subtotal + deliveryFee + tax - discountAmount;
        const orderNumber = generateOrderNumber();

        const user = await User.findById(req.user.id).select('name email');

        const order = new Order({
            orderNumber,
            user: req.user.id,
            email: shippingAddress.email || (user ? user.email : ''),
            items: orderItems,
            shippingAddress,
            billingAddress: billingAddress || {},
            deliveryMethod: {
                type: deliveryMethod?.type || 'standard',
                label: deliveryLabel,
                fee: deliveryFee,
                estimatedDays: deliveryEstimatedDays,
                provider: deliveryProvider
            },
            subtotal,
            deliveryFee,
            tax,
            total,
            paymentMethod: paymentMethod || 'cash',
            couponCode: couponCode || undefined,
            couponDiscount: discountAmount || undefined,
            discount: discountAmount || 0,
            status: 'pending',
            notes: notes || '',
            timeline: [{ status: 'pending', note: 'Order placed', timestamp: new Date() }],
            paymentDetails: { paymentStatus: paymentMethod === 'cash' ? 'pending' : 'pending' }
        });
        await order.save();

        for (const update of stockUpdates) {
            await Product.findByIdAndUpdate(update.productId, {
                $inc: { stock: -update.qty, totalSold: update.qty }
            });
            const updated = await Product.findById(update.productId);
            if (updated && updated.stock <= 0 && !updated.preOrder && !updated.limitedAvailable) {
                await Product.findByIdAndUpdate(update.productId, { $set: { inStock: false, soldOut: true } });
            }
            await logInventoryChange(update.productId, -update.qty, 'order', 'Order placed', order.orderNumber);
        }

        const Cart = require('../models/Cart');
        await Cart.findOneAndUpdate(
            { userId: req.user.id },
            { $set: { items: [], couponCode: '', couponDiscount: 0 } }
        );

        if (user) {
            sendOrderConfirmation(order, user).catch(() => {});
            sendAdminNewOrder(order, user).catch(() => {});
        }

        res.status(201).json({ success: true, data: order });
    } catch (err) {
        console.error('POST /orders error:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// POST /api/orders/:id/refund-request – request refund
router.post('/:id/refund-request', authenticateToken, async (req, res) => {
    try {
        const { reason } = req.body;
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
        if (order.user.toString() !== req.user.id)
            return res.status(403).json({ success: false, message: 'Not authorized' });
        if (order.status !== 'delivered')
            return res.status(400).json({ success: false, message: 'Refund only available for delivered orders' });
        if (order.refundStatus !== 'none')
            return res.status(400).json({ success: false, message: 'Refund already requested' });

        order.refundStatus = 'requested';
        order.refundReason = reason || '';
        order.refundAmount = order.total;
        order.timeline.push({ status: order.status, note: `Refund requested: ${reason || 'No reason provided'}`, timestamp: new Date() });
        await order.save();
        res.json({ success: true, data: order });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// POST /api/orders/:id/return – process return
router.post('/:id/return', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { reason, note } = req.body;
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
        if (order.status !== 'delivered')
            return res.status(400).json({ success: false, message: 'Only delivered orders can be returned' });
        if (order.status === 'returned')
            return res.status(400).json({ success: false, message: 'Order already returned' });

        order.status = 'returned';
        order.returnReason = reason || '';
        order.returnDate = new Date();
        order.timeline.push({ status: 'returned', note: note || 'Return processed', admin: req.user?.name || req.user?.email || 'admin', timestamp: new Date() });

        for (const item of order.items) {
            await Product.findByIdAndUpdate(item.productId, {
                $inc: { stock: item.quantity, totalSold: -item.quantity },
                $set: { inStock: true, soldOut: false }
            });
            await logInventoryChange(item.productId, item.quantity, 'return', 'Return processed', order.orderNumber);
        }
        await order.save();
        res.json({ success: true, data: order });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// POST /api/orders/admin/bulk – bulk actions
router.post('/admin/bulk', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { orderIds, action, value, note } = req.body;
        if (!orderIds || !Array.isArray(orderIds) || !orderIds.length || !action)
            return res.status(400).json({ success: false, message: 'orderIds and action required' });

        const adminName = req.user?.name || req.user?.email || 'admin';
        const results = { updated: 0, errors: [] };

        for (const id of orderIds) {
            try {
                const order = await Order.findById(id);
                if (!order) { results.errors.push({ id, message: 'Not found' }); continue; }

                if (action === 'update-status') {
                    if (!value || !isValidTransition(order.status, value)) {
                        results.errors.push({ id, message: `Invalid transition: ${order.status} -> ${value}` }); continue;
                    }
                    const old = order.status;
                    order.status = value;
                    order.timeline.push({ status: value, note: note || `Bulk status update to ${value}`, admin: adminName, timestamp: new Date() });
                    if (value === 'cancelled' && old !== 'cancelled') {
                        for (const item of order.items) {
                            await Product.findByIdAndUpdate(item.productId, { $inc: { stock: item.quantity, totalSold: -item.quantity }, $set: { inStock: true, soldOut: false } });
                            await logInventoryChange(item.productId, item.quantity, 'cancel', 'Bulk cancel', order.orderNumber);
                        }
                    }
                    const user = await User.findById(order.user).select('name email');
                    if (user) sendOrderStatusUpdate(order, user, old).catch(() => {});
                } else if (action === 'mark-shipped') {
                    order.status = 'shipped';
                    if (value) order.courier = value;
                    if (note) order.trackingNumber = note;
                    order.timeline.push({ status: 'shipped', note: `Marked as shipped${note ? ': ' + note : ''}`, admin: adminName, timestamp: new Date() });
                } else if (action === 'add-tracking') {
                    if (value) order.trackingNumber = value;
                    order.timeline.push({ status: order.status, note: `Tracking updated: ${value || ''}`, admin: adminName, timestamp: new Date() });
                } else if (action === 'cancel') {
                    if (!isValidTransition(order.status, 'cancelled')) {
                        results.errors.push({ id, message: `Cannot cancel ${order.status}` }); continue;
                    }
                    const old = order.status;
                    order.status = 'cancelled';
                    order.cancelReason = note || 'Bulk cancelled';
                    order.timeline.push({ status: 'cancelled', note: note || 'Bulk cancelled', admin: adminName, timestamp: new Date() });
                    for (const item of order.items) {
                        await Product.findByIdAndUpdate(item.productId, { $inc: { stock: item.quantity, totalSold: -item.quantity }, $set: { inStock: true, soldOut: false } });
                        await logInventoryChange(item.productId, item.quantity, 'cancel', 'Bulk cancel', order.orderNumber);
                    }
                } else {
                    results.errors.push({ id, message: `Unknown action: ${action}` }); continue;
                }
                await order.save();
                results.updated++;
            } catch (err) { results.errors.push({ id, message: err.message }); }
        }
        res.json({ success: true, data: results, message: `${results.updated} updated, ${results.errors.length} errors` });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Bulk action failed' });
    }
});

// POST /api/orders/export – JSON export for frontend
router.post('/export', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { status, startDate, endDate, paymentStatus, search, format = 'json' } = req.body;
        const filter = {};
        if (status && status !== 'all') filter.status = status;
        if (paymentStatus) filter['paymentDetails.paymentStatus'] = paymentStatus;
        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) filter.createdAt.$gte = new Date(startDate);
            if (endDate) filter.createdAt.$lte = new Date(endDate);
        }
        if (search) {
            const s = escapeRegex(search);
            filter.$or = [
                { orderNumber: { $regex: s, $options: 'i' } },
                { 'shippingAddress.fullName': { $regex: s, $options: 'i' } },
                { email: { $regex: s, $options: 'i' } }
            ];
        }
        const orders = await Order.find(filter).populate('user', 'name email').sort({ createdAt: -1 });

        if (format === 'csv') {
            const headers = 'Order #,Customer,Email,Phone,Items,Subtotal,Delivery,Discount,Total,Payment,Status,Courier,Tracking,Date';
            const csv = orders.map(o => {
                const items = o.items.map(i => `${i.name} x${i.quantity}`).join('; ');
                return `"${o.orderNumber}","${o.shippingAddress?.fullName || ''}","${o.email || o.user?.email || ''}","${o.shippingAddress?.phone || ''}","${items}",${o.subtotal},${o.deliveryFee},${o.discount || 0},${o.total},"${o.paymentMethod}","${o.status}","${o.courier || ''}","${o.trackingNumber || ''}","${o.createdAt}"`;
            }).join('\n');
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=orders-${Date.now()}.csv`);
            return res.send(headers + '\n' + csv);
        }

        const data = orders.map(o => ({
            orderNumber: o.orderNumber, customer: o.shippingAddress?.fullName || '', email: o.email || o.user?.email || '',
            phone: o.shippingAddress?.phone || '', items: o.items.map(i => ({ name: i.name, qty: i.quantity, price: i.price })),
            subtotal: o.subtotal, deliveryFee: o.deliveryFee, discount: o.discount, total: o.total,
            paymentMethod: o.paymentMethod, paymentStatus: o.paymentDetails?.paymentStatus || 'pending',
            status: o.status, courier: o.courier || '', trackingNumber: o.trackingNumber || '',
            createdAt: o.createdAt, updatedAt: o.updatedAt
        }));
        res.json({ success: true, data, total: data.length });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Export failed' });
    }
});

// ============================================================
// PUT ROUTES
// ============================================================

// PUT /api/orders/:id/cancel – cancel order (customer)
router.put('/:id/cancel', authenticateToken, async (req, res) => {
    try {
        const { reason } = req.body;
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
        if (order.user.toString() !== req.user.id)
            return res.status(403).json({ success: false, message: 'Not authorized' });
        if (!['pending', 'confirmed'].includes(order.status))
            return res.status(400).json({ success: false, message: 'Order cannot be cancelled at this stage' });

        order.status = 'cancelled';
        order.cancelReason = reason || '';
        order.timeline.push({ status: 'cancelled', note: reason || 'Cancelled by customer', timestamp: new Date() });
        await order.save();

        for (const item of order.items) {
            await Product.findByIdAndUpdate(item.productId, {
                $inc: { stock: item.quantity, totalSold: -item.quantity },
                $set: { inStock: true, soldOut: false }
            });
            await logInventoryChange(item.productId, item.quantity, 'cancel', 'Order cancelled by customer', order.orderNumber);
        }

        res.json({ success: true, data: order });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// PUT /api/orders/:id/status – update order status (admin)
router.put('/:id/status', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { status, note, trackingNumber } = req.body;
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
        const oldStatus = order.status;

        if (status && status !== oldStatus) {
            if (!isValidTransition(oldStatus, status)) {
                return res.status(400).json({
                    success: false,
                    message: `Cannot transition from "${oldStatus}" to "${status}". Allowed: ${(validTransitions[oldStatus] || []).join(', ') || 'none'}`
                });
            }
            const adminName = req.user?.name || req.user?.email || 'admin';
            order.status = status;
            order.timeline.push({ status, note: note || `Status updated to ${status}`, admin: adminName, timestamp: new Date() });

            if (status === 'cancelled' && oldStatus !== 'cancelled') {
                for (const item of order.items) {
                    await Product.findByIdAndUpdate(item.productId, {
                        $inc: { stock: item.quantity, totalSold: -item.quantity },
                        $set: { inStock: true, soldOut: false }
                    });
                    await logInventoryChange(item.productId, item.quantity, 'cancel', 'Order cancelled by admin', order.orderNumber);
                }
            }
        }

        if (trackingNumber !== undefined) order.trackingNumber = trackingNumber;
        if (note !== undefined && !status) {
            order.adminNotes = note;
            order.timeline.push({ status: order.status, note: `Admin note: ${note}`, admin: req.user?.name || req.user?.email || 'admin', timestamp: new Date() });
        }
        await order.save();

        if (status && status !== oldStatus) {
            const user = await User.findById(order.user).select('name email');
            if (user) sendOrderStatusUpdate(order, user, oldStatus).catch(() => {});
        }

        res.json({ success: true, data: order });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// PUT /api/orders/:id/payment – update payment status
router.put('/:id/payment', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { paymentStatus, transactionId, paymentRef, paidAt } = req.body;
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        const validStatuses = ['pending', 'completed', 'failed', 'refunded', 'partially_refunded'];
        if (paymentStatus && !validStatuses.includes(paymentStatus))
            return res.status(400).json({ success: false, message: 'Invalid payment status' });

        if (paymentStatus) order.paymentDetails.paymentStatus = paymentStatus;
        if (transactionId) order.paymentDetails.transactionId = transactionId;
        if (paymentRef) order.paymentDetails.paymentRef = paymentRef;
        if (paidAt) order.paymentDetails.paidAt = new Date(paidAt);
        if (paymentStatus === 'completed' && !order.paymentDetails.paidAt) order.paymentDetails.paidAt = new Date();

        order.timeline.push({
            status: order.status,
            note: `Payment status updated to ${paymentStatus || order.paymentDetails.paymentStatus}${transactionId ? ` (TX: ${transactionId})` : ''}`,
            admin: req.user?.name || req.user?.email || 'admin',
            timestamp: new Date()
        });
        await order.save();
        res.json({ success: true, data: order });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// PUT /api/orders/:id/tracking – update tracking number and courier
router.put('/:id/tracking', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { trackingNumber, courier, estDeliveryDate } = req.body;
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        if (trackingNumber !== undefined) order.trackingNumber = trackingNumber;
        if (courier !== undefined) order.courier = courier;
        if (estDeliveryDate !== undefined) order.estDeliveryDate = new Date(estDeliveryDate);

        order.timeline.push({
            status: order.status,
            note: `Shipping updated: ${courier || order.courier} ${trackingNumber ? `(${trackingNumber})` : ''}${estDeliveryDate ? ` ETA: ${new Date(estDeliveryDate).toLocaleDateString()}` : ''}`,
            admin: req.user?.name || req.user?.email || 'admin',
            timestamp: new Date()
        });
        await order.save();
        res.json({ success: true, data: order });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// PUT /api/orders/:id/refund – process refund (admin)
router.put('/:id/refund', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { refundStatus, refundAmount, note } = req.body;
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
        if (!['approved', 'rejected', 'completed'].includes(refundStatus))
            return res.status(400).json({ success: false, message: 'Invalid refund status' });

        const oldRefundStatus = order.refundStatus;
        order.refundStatus = refundStatus;
        if (refundAmount !== undefined) order.refundAmount = refundAmount;
        if (refundStatus === 'approved' || refundStatus === 'completed') {
            order.refundDate = new Date();
            order.paymentDetails.paymentStatus = refundStatus === 'completed' ? 'refunded' : 'partially_refunded';
            if (refundStatus === 'completed') order.status = 'refunded';
            order.timeline.push({ status: 'refunded', note: `Refund ${refundStatus}${note ? ': ' + note : ''}`, admin: req.user?.name || req.user?.email || 'admin', timestamp: new Date() });

            if (oldRefundStatus !== 'completed') {
                for (const item of order.items) {
                    await Product.findByIdAndUpdate(item.productId, {
                        $inc: { stock: item.quantity, totalSold: -item.quantity },
                        $set: { inStock: true, soldOut: false }
                    });
                    await logInventoryChange(item.productId, item.quantity, 'refund', 'Stock restored from refund', order.orderNumber);
                }
            }
        } else {
            order.timeline.push({ status: order.status, note: `Refund ${refundStatus}${note ? ': ' + note : ''}`, admin: req.user?.name || req.user?.email || 'admin', timestamp: new Date() });
        }
        await order.save();

        const user = await User.findById(order.user).select('name email');
        if (user && (refundStatus === 'approved' || refundStatus === 'completed')) {
            sendOrderStatusUpdate(order, user, '').catch(() => {});
        }

        res.json({ success: true, data: order });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// PUT /api/orders/:id – generic order update (admin)
router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const allowedFields = ['shippingAddress', 'billingAddress', 'notes', 'adminNotes', 'courier', 'trackingNumber', 'estDeliveryDate'];
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                if (typeof req.body[field] === 'object' && !Array.isArray(req.body[field])) {
                    Object.assign(order[field], req.body[field]);
                } else {
                    order[field] = req.body[field];
                }
            }
        }

        if (req.body.note) {
            order.timeline.push({ status: order.status, note: req.body.note, admin: req.user?.name || req.user?.email || 'admin', timestamp: new Date() });
        }
        await order.save();

        res.json({ success: true, data: order });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

module.exports = router;
