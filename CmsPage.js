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

const registerRules = [
  body('firstName').trim().notEmpty().withMessage('First name is required').isLength({ max: 60 }),
  body('lastName').trim().notEmpty().withMessage('Last name is required').isLength({ max: 60 }),
  body('email').trim().isEmail().withMessage('A valid email is required').normalizeEmail(),
  body('phone')
    .optional({ checkFalsy: true })
    .matches(/^\+?[0-9]{7,15}$/)
    .withMessage('A valid phone number is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/\d/)
    .withMessage('Password must contain at least one number'),
  handleValidation,
];

const loginRules = [
  body('email').trim().isEmail().withMessage('A valid email is required').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
  handleValidation,
];

module.exports = { registerRules, loginRules };
