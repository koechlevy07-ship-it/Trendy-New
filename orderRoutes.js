const mongoose = require('mongoose');

const shippingZoneSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // e.g. "Nairobi", "Major Towns", "Rest of Kenya"
    counties: {
      type: [String],
      required: true,
      validate: { validator: (arr) => arr.length > 0, message: 'A zone must cover at least one county' },
    },
    baseFee: { type: Number, required: true, min: 0 }, // KSh
    estimatedDaysMin: { type: Number, required: true, min: 0, default: 1 },
    estimatedDaysMax: { type: Number, required: true, min: 0, default: 3 },
    freeShippingThreshold: { type: Number, min: 0, default: null }, // order subtotal (KSh) above which shipping is free
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

shippingZoneSchema.index({ counties: 1 });

const ShippingZone = mongoose.model('ShippingZone', shippingZoneSchema);

module.exports = { ShippingZone };
