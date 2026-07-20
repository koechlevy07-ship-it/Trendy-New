const mongoose = require('mongoose');
const crypto = require('crypto');

const ORDER_STATUSES = ['pending', 'paid', 'processing', 'fulfilled', 'delivered', 'cancelled', 'refunded'];

const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, required: true },
    sku: { type: String, required: true },
    name: { type: String, required: true },
    size: { type: String, required: true },
    color: { type: String, required: true },
    imageUrl: { type: String },
    unitPrice: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: true }
);

const addressSnapshotSchema = new mongoose.Schema(
  {
    recipientName: { type: String, required: true },
    phone: { type: String, required: true },
    line1: { type: String, required: true },
    line2: { type: String },
    city: { type: String, required: true },
    county: { type: String, required: true },
    postalCode: { type: String },
    country: { type: String, default: 'Kenya' },
  },
  { _id: false }
);

const statusHistorySchema = new mongoose.Schema(
  {
    status: { type: String, enum: ORDER_STATUSES, required: true },
    note: { type: String, trim: true },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    changedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true, index: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    items: {
      type: [orderItemSchema],
      validate: { validator: (arr) => arr.length > 0, message: 'Order must contain at least one item' },
    },

    subtotal: { type: Number, required: true, min: 0 },
    shippingFee: { type: Number, required: true, min: 0, default: 0 },
    discount: { type: Number, required: true, min: 0, default: 0 },
    couponCode: { type: String, trim: true, uppercase: true, default: null },
    total: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'KES', enum: ['KES'] },

    shippingAddress: { type: addressSnapshotSchema, required: true },

    status: { type: String, enum: ORDER_STATUSES, default: 'pending', index: true },
    statusHistory: { type: [statusHistorySchema], default: [] },

    paymentMethod: { type: String, enum: ['mpesa', 'card', 'cash_on_delivery'], required: true },
    paymentReference: { type: String, trim: true },
    paidAt: { type: Date },

    customerNote: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

orderSchema.index({ customer: 1, createdAt: -1 });

orderSchema.pre('validate', function generateOrderNumber(next) {
  if (!this.orderNumber) {
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomPart = crypto.randomBytes(3).toString('hex').toUpperCase();
    this.orderNumber = `TW-${datePart}-${randomPart}`;
  }
  next();
});

orderSchema.methods.pushStatus = function pushStatus(status, changedBy, note) {
  this.status = status;
  this.statusHistory.push({ status, changedBy, note, changedAt: new Date() });
};

const Order = mongoose.model('Order', orderSchema);

module.exports = { Order, ORDER_STATUSES };
