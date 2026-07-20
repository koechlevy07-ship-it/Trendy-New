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

const createProductRules = [
  body('name').trim().notEmpty().withMessage('Product name is required').isLength({ max: 150 }),
  body('description').trim().notEmpty().withMessage('Description is required'),
  body('category').notEmpty().withMessage('Category is required').isMongoId().withMessage('Invalid category id'),
  body('basePrice')
    .notEmpty()
    .withMessage('Base price is required')
    .isFloat({ min: 0 })
    .withMessage('Base price must be a positive number (KSh)'),
  body('compareAtPrice')
    .optional({ checkFalsy: true })
    .isFloat({ min: 0 })
    .withMessage('Compare-at price must be a positive number'),
  body('status').optional().isIn(['draft', 'published', 'archived']).withMessage('Invalid status'),
  handleValidation,
];

const stockAdjustRules = [
  body('delta').isNumeric().withMessage('delta must be a number'),
  handleValidation,
];

module.exports = { createProductRules, stockAdjustRules };
