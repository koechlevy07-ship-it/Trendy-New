const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, required: true },
    sku: { type: String, required: true },
    name: { type: String, required: true }, // snapshot, survives product renames
    size: { type: String, required: true },
    color: { type: String, required: true },
    imageUrl: { type: String },
    unitPrice: { type: Number, required: true, min: 0 }, // KSh snapshot at time of add
    quantity: { type: Number, required: true, min: 1, default: 1 },
  },
  { _id: true, timestamps: true }
);

const cartSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    items: [cartItemSchema],
  },
  { timestamps: true }
);

cartSchema.virtual('subtotal').get(function subtotal() {
  return this.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
});

cartSchema.virtual('itemCount').get(function itemCount() {
  return this.items.reduce((sum, item) => sum + item.quantity, 0);
});

cartSchema.set('toJSON', { virtuals: true });
cartSchema.set('toObject', { virtuals: true });

const Cart = mongoose.model('Cart', cartSchema);

module.exports = { Cart };
