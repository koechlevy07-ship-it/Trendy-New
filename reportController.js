const { Coupon } = require('../models/Coupon');
const { Order } = require('../models/Order');
const { Cart } = require('../models/Cart');
const { ApiError } = require('../utils/ApiError');
const { sendSuccess } = require('../utils/apiResponse');

/**
 * Customer: checks whether a coupon code is usable right now, against their
 * own current cart subtotal and their own past usage. Does not consume it —
 * consumption happens at checkout.
 */
async function validateCoupon(req, res, next) {
  try {
    const { code } = req.params;
    const coupon = await Coupon.findOne({ code: code.toUpperCase() });
    if (!coupon || !coupon.isCurrentlyValid()) {
      throw new ApiError(404, 'This coupon is invalid or has expired');
    }

    const cart = await Cart.findOne({ user: req.user._id });
    const subtotal = cart ? cart.subtotal : 0;

    const priorUses = await Order.countDocuments({
      customer: req.user._id,
      couponCode: coupon.code,
      status: { $nin: ['cancelled'] },
    });
    if (priorUses >= coupon.usageLimitPerCustomer) {
      throw new ApiError(409, "You've already used this coupon the maximum number of times");
    }

    if (subtotal < coupon.minOrderValue) {
      throw new ApiError(
        409,
        `This coupon requires a minimum order of KSh ${coupon.minOrderValue.toLocaleString('en-KE')}`
      );
    }

    const discount = coupon.calculateDiscount(subtotal);
    return sendSuccess(res, 200, { code: coupon.code, discount, discountType: coupon.discountType });
  } catch (err) {
    next(err);
  }
}

// --- Admin ---

async function listCoupons(req, res, next) {
  try {
    const coupons = await Coupon.find({}).sort('-createdAt');
    return sendSuccess(res, 200, { coupons });
  } catch (err) {
    next(err);
  }
}

async function createCoupon(req, res, next) {
  try {
    const coupon = await Coupon.create({ ...req.body, createdBy: req.user._id });
    return sendSuccess(res, 201, { coupon });
  } catch (err) {
    next(err);
  }
}

async function updateCoupon(req, res, next) {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) throw new ApiError(404, 'Coupon not found');

    const updatable = [
      'description',
      'discountType',
      'discountValue',
      'minOrderValue',
      'maxDiscountAmount',
      'usageLimit',
      'usageLimitPerCustomer',
      'applicableCategories',
      'startsAt',
      'expiresAt',
      'isActive',
    ];
    updatable.forEach((field) => {
      if (req.body[field] !== undefined) coupon[field] = req.body[field];
    });

    await coupon.save();
    return sendSuccess(res, 200, { coupon });
  } catch (err) {
    next(err);
  }
}

async function deleteCoupon(req, res, next) {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) throw new ApiError(404, 'Coupon not found');
    await coupon.deleteOne();
    return sendSuccess(res, 200, { message: 'Coupon deleted' });
  } catch (err) {
    next(err);
  }
}

module.exports = { validateCoupon, listCoupons, createCoupon, updateCoupon, deleteCoupon };
