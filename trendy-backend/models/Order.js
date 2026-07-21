const mongoose = require('mongoose');

const timelineEventSchema = new mongoose.Schema({
    status: { type: String, required: true },
    note: { type: String, default: '' },
    admin: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now }
}, { _id: false });

const orderItemSchema = new mongoose.Schema({
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: String,
    quantity: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true },
    originalPrice: Number,
    discount: { type: Number, default: 0 },
    lineTotal: { type: Number, default: 0 },
    image: { type: String, default: '' },
    size: { type: String, default: '' },
    color: { type: String, default: '' },
    sku: { type: String, default: '' },
    brand: { type: String, default: '' },
    category: { type: String, default: '' }
}, { _id: false });

const orderSchema = new mongoose.Schema({
    orderNumber: { type: String, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    email: { type: String, default: '' },
    items: [orderItemSchema],
    shippingAddress: {
        fullName: { type: String, required: true },
        phone: { type: String, required: true },
        email: { type: String, default: '' },
        county: { type: String, default: '' },
        city: { type: String, required: true },
        street: { type: String, default: '' },
        apartment: { type: String, default: '' },
        postalCode: { type: String, default: '' },
        country: { type: String, default: 'Kenya' },
        deliveryInstructions: { type: String, default: '' }
    },
    billingAddress: {
        fullName: { type: String, default: '' },
        phone: { type: String, default: '' },
        email: { type: String, default: '' },
        county: { type: String, default: '' },
        city: { type: String, default: '' },
        street: { type: String, default: '' },
        apartment: { type: String, default: '' },
        postalCode: { type: String, default: '' },
        country: { type: String, default: 'Kenya' }
    },
    deliveryMethod: {
        type: { type: String, enum: ['standard', 'express', 'same-day', 'pickup'], default: 'standard' },
        label: { type: String, default: 'Standard Delivery' },
        fee: { type: Number, default: 0 },
        estimatedDays: { type: String, default: '3-7 business days' },
        provider: { type: String, default: '' }
    },
    subtotal: { type: Number, default: 0 },
    deliveryFee: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    couponCode: { type: String, default: '' },
    couponDiscount: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    paymentMethod: { type: String, default: 'cash' },
    paymentDetails: {
        transactionId: { type: String, default: '' },
        paymentRef: { type: String, default: '' },
        paidAt: { type: Date },
        paymentStatus: {
            type: String,
            enum: ['pending', 'completed', 'failed', 'refunded', 'partially_refunded'],
            default: 'pending'
        },
        providerResponse: { type: mongoose.Schema.Types.Mixed }
    },
    status: {
        type: String,
        enum: [
            'pending', 'confirmed', 'processing', 'packed',
            'ready-for-dispatch', 'shipped', 'out-for-delivery',
            'delivered', 'cancelled', 'returned', 'refunded'
        ],
        default: 'pending'
    },
    trackingNumber: { type: String, default: '' },
    courier: { type: String, default: '' },
    estDeliveryDate: { type: Date },
    notes: { type: String, default: '' },
    adminNotes: { type: String, default: '' },
    timeline: [timelineEventSchema],
    refundStatus: { type: String, enum: ['none', 'requested', 'approved', 'rejected', 'completed'], default: 'none' },
    refundAmount: { type: Number, default: 0 },
    refundReason: { type: String, default: '' },
    refundDate: { type: Date },
    cancelReason: { type: String, default: '' },
    returnReason: { type: String, default: '' },
    returnDate: { type: Date },
    invoiceUrl: { type: String, default: '' }
}, { timestamps: true });

orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ status: 1 });
orderSchema.index({ orderNumber: 1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ 'paymentDetails.paymentStatus': 1 });
orderSchema.index({ 'shippingAddress.fullName': 'text', email: 'text', orderNumber: 'text' });

module.exports = mongoose.model('Order', orderSchema);
