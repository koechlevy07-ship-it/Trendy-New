const mongoose = require('mongoose');

const historySchema = new mongoose.Schema({
    previousQty: { type: Number, required: true },
    newQty: { type: Number, required: true },
    delta: { type: Number, required: true },
    type: {
        type: String,
        enum: ['manual', 'order', 'cancel', 'refund', 'correction', 'import', 'bulk', 'adjustment'],
        default: 'manual'
    },
    reason: { type: String, default: '' },
    reference: { type: String, default: '' },
    admin: { type: String, default: '' }
}, { timestamps: true });

const inventorySchema = new mongoose.Schema({
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true,
        unique: true,
        index: true
    },
    sku: { type: String, default: '', trim: true, index: true },
    variantKey: { type: String, default: '', trim: true },
    quantity: { type: Number, default: 0, min: 0 },
    reservedQuantity: { type: Number, default: 0, min: 0 },
    lowStockThreshold: { type: Number, default: 5, min: 0 },
    warehouse: { type: String, default: '' },
    status: {
        type: String,
        enum: ['in_stock', 'low_stock', 'out_of_stock', 'discontinued', 'backorder'],
        default: 'out_of_stock'
    },
    history: [historySchema]
}, { timestamps: true });

inventorySchema.virtual('availableQuantity').get(function () {
    return Math.max(0, this.quantity - this.reservedQuantity);
});

inventorySchema.methods.computeStatus = function () {
    const available = this.quantity - this.reservedQuantity;
    if (this.quantity <= 0) return 'out_of_stock';
    if (available <= 0) return 'out_of_stock';
    if (this.quantity <= this.lowStockThreshold) return 'low_stock';
    return 'in_stock';
};

inventorySchema.pre('save', function (next) {
    this.status = this.computeStatus();
    next();
});

inventorySchema.index({ status: 1 });
inventorySchema.index({ quantity: 1 });
inventorySchema.index({ 'history.createdAt': -1 });

module.exports = mongoose.model('Inventory', inventorySchema);
