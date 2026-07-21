const Order = require('../models/Order');

exports.getMyOrders = async (req, res) => {
    try {
        const orders = await Order.find({ userId: req.user.id })
            .sort({ createdAt: -1 });
        res.json(orders);
    } catch (error) {
        console.error('Get orders error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.createOrder = async (req, res) => {
    try {
        const { items, shippingAddress, total, paymentMethod } = req.body;
        if (!items || !items.length || !shippingAddress || !total) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: items, shippingAddress, total'
            });
        }
        const order = new Order({
            userId: req.user.id,
            items,
            total,
            shippingAddress,
            paymentMethod: paymentMethod || 'cash',
        });
        await order.save();
        res.status(201).json({ success: true, order });
    } catch (error) {
        console.error('Create order error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};