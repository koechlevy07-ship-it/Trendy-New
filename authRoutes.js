const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    description: { type: String, trim: true, maxlength: 300 },

    discountType: { type: String, enum: ['percentage', 'fixed'], required: true },
    discountValue: { type: Number, required: true, min: 0 }, // % (0-100) or KSh amount depending on type

    minOrderValue: { type: Number, min: 0, default: 0 }, // KSh
    maxDiscountAmount: { type: Number, min: 0, default: null }, // caps percentage discounts

    usageLimit: { type: Number, min: 1, default: null }, // null = unlimited total uses
    usageLimitPerCustomer: { type: Number, min: 1, default: 1 },
    usedCount: { type: Number, default: 0, min: 0 },

    applicableCategories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }], // empty = all categories

    startsAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    isActive: { type: Boolean, default: true },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

couponSchema.methods.isCurrentlyValid = function isCurrentlyValid() {
  const now = new Date();
  if (!this.isActive) return false;
  if (this.startsAt && this.startsAt > now) return false;
  if (this.expiresAt && this.expiresAt < now) return false;
  if (this.usageLimit != null && this.usedCount >= this.usageLimit) return false;
  return true;
};

couponSchema.methods.calculateDiscount = function calculateDiscount(subtotal) {
  if (subtotal < this.minOrderValue) return 0;

  let discount =
    this.discountType === 'percentage' ? (subtotal * this.discountValue) / 100 : this.discountValue;

  if (this.maxDiscountAmount != null) {
    discount = Math.min(discount, this.maxDiscountAmount);
  }
  return Math.min(discount, subtotal);
};

const Coupon = mongoose.model('Coupon', couponSchema);

module.exports = { Coupon };
