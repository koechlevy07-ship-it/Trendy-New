const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    method: { type: String, enum: ['mpesa', 'card', 'cash_on_delivery'], required: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'KES' },

    status: {
      type: String,
      enum: ['initiated', 'pending', 'succeeded', 'failed', 'cancelled'],
      default: 'initiated',
      index: true,
    },

    // M-Pesa specific
    mpesaCheckoutRequestId: { type: String, index: true },
    mpesaMerchantRequestId: { type: String },
    mpesaReceiptNumber: { type: String },
    phone: { type: String },

    // Generic gateway reference (card processor transaction id, etc.)
    gatewayReference: { type: String },

    failureReason: { type: String },
    rawCallbackPayload: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

const Payment = mongoose.model('Payment', paymentSchema);

module.exports = { Payment };
