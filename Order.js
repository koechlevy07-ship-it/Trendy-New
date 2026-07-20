const { body, validationResult } = require('express-validator');
const { ApiError } = require('../../utils/ApiError');

function handleValidation(req, res, next) {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    const messages = result.array().map((e) => e.msg);
    return next(new ApiError(400, 'Validation failed', messages));
  }
  next();
}

const checkoutRules = [
  body('shippingAddress.recipientName').trim().notEmpty().withMessage('Recipient name is required'),
  body('shippingAddress.phone')
    .matches(/^\+?[0-9]{7,15}$/)
    .withMessage('A valid phone number is required'),
  body('shippingAddress.line1').trim().notEmpty().withMessage('Address line 1 is required'),
  body('shippingAddress.city').trim().notEmpty().withMessage('City is required'),
  body('shippingAddress.county').trim().notEmpty().withMessage('County is required'),
  body('paymentMethod').isIn(['mpesa', 'card', 'cash_on_delivery']).withMessage('Invalid payment method'),
  handleValidation,
];

const updateStatusRules = [
  body('status')
    .isIn(['pending', 'paid', 'processing', 'fulfilled', 'delivered', 'cancelled', 'refunded'])
    .withMessage('Invalid order status'),
  handleValidation,
];

module.exports = { checkoutRules, updateStatusRules };
