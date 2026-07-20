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

const addItemRules = [
  body('productId').isMongoId().withMessage('Invalid product id'),
  body('variantId').isMongoId().withMessage('Invalid variant id'),
  body('quantity').optional().isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  handleValidation,
];

const updateQuantityRules = [
  body('quantity').isInt({ min: 1 }).withMessage('Quantity must be a whole number of at least 1'),
  handleValidation,
];

module.exports = { addItemRules, updateQuantityRules };
