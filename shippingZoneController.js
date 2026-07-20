const { Order } = require('../models/Order');
const { Payment } = require('../models/Payment');
const mpesaService = require('../services/mpesaService');
const notificationService = require('../services/notificationService');
const { ApiError } = require('../utils/ApiError');
const { sendSuccess } = require('../utils/apiResponse');

/**
 * Customer-initiated: triggers the M-Pesa STK push for a pending order they own.
 */
async function initiateMpesaPayment(req, res, next) {
  try {
    const { orderId, phone } = req.body;
    if (!phone) throw new ApiError(400, 'Phone number is required');

    const order = await Order.findOne({ _id: orderId, customer: req.user._id });
    if (!order) throw new ApiError(404, 'Order not found');
    if (order.status !== 'pending') {
      throw new ApiError(409, `Order is already "${order.status}" and cannot be paid again`);
    }

    const stkResponse = await mpesaService.initiateStkPush({
      phone,
      amount: order.total,
      orderNumber: order.orderNumber,
    });

    if (stkResponse.ResponseCode !== '0') {
      throw new ApiError(502, stkResponse.ResponseDescription || 'Failed to initiate M-Pesa payment');
    }

    const payment = await Payment.create({
      order: order._id,
      method: 'mpesa',
      amount: order.total,
      currency: order.currency,
      status: 'pending',
      mpesaCheckoutRequestId: stkResponse.CheckoutRequestID,
      mpesaMerchantRequestId: stkResponse.MerchantRequestID,
      phone,
    });

    return sendSuccess(res, 202, {
      message: 'Payment prompt sent to your phone. Enter your M-Pesa PIN to complete payment.',
      paymentId: payment._id,
      checkoutRequestId: stkResponse.CheckoutRequestID,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Safaricom calls this asynchronously once the customer completes (or cancels)
 * the STK push on their phone. This endpoint must be publicly reachable (no auth) —
 * it's on the internet-facing side of M-Pesa's infrastructure, not the customer's.
 * Always respond 200 to Safaricom regardless of outcome, or they'll retry indefinitely.
 */
async function mpesaCallback(req, res) {
  try {
    const callback = req.body?.Body?.stkCallback;
    if (!callback) {
      return res.status(200).json({ ResultCode: 0, ResultDesc: 'Ignored: no callback body' });
    }

    const payment = await Payment.findOne({ mpesaCheckoutRequestId: callback.CheckoutRequestID });
    if (!payment) {
      return res.status(200).json({ ResultCode: 0, ResultDesc: 'Ignored: unknown payment reference' });
    }

    payment.rawCallbackPayload = callback;

    if (callback.ResultCode === 0) {
      const metadata = callback.CallbackMetadata?.Item || [];
      const receipt = metadata.find((i) => i.Name === 'MpesaReceiptNumber')?.Value;

      payment.status = 'succeeded';
      payment.mpesaReceiptNumber = receipt;
      await payment.save();

      const order = await Order.findById(payment.order);
      if (order && order.status === 'pending') {
        order.pushStatus('paid', undefined, `M-Pesa receipt ${receipt}`);
        order.paymentReference = receipt;
        order.paidAt = new Date();
        await order.save();

        notificationService.notifyOrderPaid(order).catch(() => null);
      }
    } else {
      payment.status = callback.ResultCode === 1032 ? 'cancelled' : 'failed';
      payment.failureReason = callback.ResultDesc;
      await payment.save();
    }

    return res.status(200).json({ ResultCode: 0, ResultDesc: 'Received' });
  } catch (err) {
    // Still acknowledge receipt to Safaricom even if our internal processing errored,
    // to avoid endless retries; the error is logged for investigation.
    // eslint-disable-next-line no-console
    console.error('[mpesa-callback] processing error:', err);
    return res.status(200).json({ ResultCode: 0, ResultDesc: 'Received with internal error' });
  }
}

/**
 * Fallback for when the callback is delayed: customer/frontend can poll this
 * to check whether payment succeeded.
 */
async function getPaymentStatus(req, res, next) {
  try {
    const payment = await Payment.findById(req.params.id).populate('order', 'orderNumber status customer');
    if (!payment || payment.order.customer.toString() !== req.user._id.toString()) {
      throw new ApiError(404, 'Payment not found');
    }

    if (payment.status === 'pending' && payment.mpesaCheckoutRequestId) {
      try {
        const queryResult = await mpesaService.queryStkStatus(payment.mpesaCheckoutRequestId);
        if (queryResult.ResultCode === '0') {
          payment.status = 'succeeded';
          await payment.save();
        }
      } catch {
        // Query can fail if Safaricom hasn't processed it yet — not a hard error, just keep polling.
      }
    }

    return sendSuccess(res, 200, { payment });
  } catch (err) {
    next(err);
  }
}

module.exports = { initiateMpesaPayment, mpesaCallback, getPaymentStatus };
