const mongoose = require('mongoose');
const { Cart } = require('../models/Cart');
const { Product } = require('../models/Product');
const { Order } = require('../models/Order');
const { Coupon } = require('../models/Coupon');
const { ApiError } = require('../utils/ApiError');
const { sendSuccess } = require('../utils/apiResponse');
const { QueryFeatures } = require('../utils/queryFeatures');
const { calculateShipping } = require('../services/shippingService');
const notificationService = require('../services/notificationService');

/**
 * Checkout: converts the customer's cart into an Order, decrementing variant
 * stock atomically so two customers can't oversell the last unit. Runs inside
 * a MongoDB transaction — requires the Atlas cluster to be a replica set
 * (standard on Atlas, including the free tier).
 */
async function checkout(req, res, next) {
  const session = await mongoose.startSession();
  try {
    const { shippingAddress, paymentMethod, customerNote, couponCode } = req.body;

    if (!shippingAddress) throw new ApiError(400, 'Shipping address is required');
    if (!paymentMethod) throw new ApiError(400, 'Payment method is required');

    let createdOrder;

    await session.withTransaction(async () => {
      const cart = await Cart.findOne({ user: req.user._id }).session(session);
      if (!cart || cart.items.length === 0) {
        throw new ApiError(400, 'Your cart is empty');
      }

      const orderItems = [];

      for (const cartItem of cart.items) {
        const product = await Product.findOne({ _id: cartItem.product, status: 'published' }).session(session);
        if (!product) {
          throw new ApiError(409, `"${cartItem.name}" is no longer available`);
        }

        const variant = product.variants.id(cartItem.variantId);
        if (!variant || !variant.isActive) {
          throw new ApiError(409, `"${cartItem.name}" (${cartItem.size}/${cartItem.color}) is no longer available`);
        }
        if (variant.stockQuantity < cartItem.quantity) {
          throw new ApiError(
            409,
            `Only ${variant.stockQuantity} unit(s) of "${cartItem.name}" (${cartItem.size}/${cartItem.color}) left in stock`
          );
        }

        variant.stockQuantity -= cartItem.quantity;
        product.soldCount += cartItem.quantity;
        await product.save({ session });

        const unitPrice = variant.priceOverride != null ? variant.priceOverride : product.basePrice;
        orderItems.push({
          product: product._id,
          variantId: variant._id,
          sku: variant.sku,
          name: product.name,
          size: variant.size,
          color: variant.color,
          imageUrl: cartItem.imageUrl,
          unitPrice,
          quantity: cartItem.quantity,
          lineTotal: unitPrice * cartItem.quantity,
        });
      }

      const subtotal = orderItems.reduce((sum, item) => sum + item.lineTotal, 0);
      const shippingQuote = await calculateShipping({ county: shippingAddress.county, subtotal });
      const shippingFee = shippingQuote.fee;

      let discount = 0;
      let appliedCouponCode = null;

      if (couponCode) {
        const coupon = await Coupon.findOne({ code: String(couponCode).toUpperCase() }).session(session);
        if (!coupon || !coupon.isCurrentlyValid()) {
          throw new ApiError(404, 'This coupon is invalid or has expired');
        }
        if (subtotal < coupon.minOrderValue) {
          throw new ApiError(
            409,
            `This coupon requires a minimum order of KSh ${coupon.minOrderValue.toLocaleString('en-KE')}`
          );
        }

        const priorUses = await Order.countDocuments({
          customer: req.user._id,
          couponCode: coupon.code,
          status: { $nin: ['cancelled'] },
        }).session(session);
        if (priorUses >= coupon.usageLimitPerCustomer) {
          throw new ApiError(409, "You've already used this coupon the maximum number of times");
        }

        discount = coupon.calculateDiscount(subtotal);
        appliedCouponCode = coupon.code;

        coupon.usedCount += 1;
        await coupon.save({ session });
      }

      const total = subtotal + shippingFee - discount;

      const [order] = await Order.create(
        [
          {
            customer: req.user._id,
            items: orderItems,
            subtotal,
            shippingFee,
            discount,
            couponCode: appliedCouponCode,
            total,
            shippingAddress,
            paymentMethod,
            customerNote,
            status: 'pending',
            statusHistory: [{ status: 'pending', changedBy: req.user._id, changedAt: new Date() }],
          },
        ],
        { session }
      );

      cart.items = [];
      await cart.save({ session });

      createdOrder = order;
    });

    notifyAfterCommit(createdOrder, req.user).catch(() => null);

    return sendSuccess(res, 201, { order: createdOrder });
  } catch (err) {
    next(err);
  } finally {
    session.endSession();
  }
}

// Fire-and-forget: notification failures should never block the checkout response
async function notifyAfterCommit(order, customer) {
  await notificationService.notifyOrderPlaced(order, customer);
}

async function listMyOrders(req, res, next) {
  try {
    let query = Order.find({ customer: req.user._id });
    const features = new QueryFeatures(query, req.query);
    features.sort().paginate();

    const [orders, total] = await Promise.all([
      features.mongooseQuery,
      Order.countDocuments({ customer: req.user._id }),
    ]);

    return sendSuccess(res, 200, { orders }, {
      page: features.pagination.page,
      limit: features.pagination.limit,
      total,
      totalPages: Math.ceil(total / features.pagination.limit),
    });
  } catch (err) {
    next(err);
  }
}

async function getMyOrder(req, res, next) {
  try {
    const order = await Order.findOne({ _id: req.params.id, customer: req.user._id });
    if (!order) throw new ApiError(404, 'Order not found');
    return sendSuccess(res, 200, { order });
  } catch (err) {
    next(err);
  }
}

async function cancelMyOrder(req, res, next) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const order = await Order.findOne({ _id: req.params.id, customer: req.user._id }).session(session);
      if (!order) throw new ApiError(404, 'Order not found');

      if (!['pending', 'paid'].includes(order.status)) {
        throw new ApiError(409, `Order cannot be cancelled once it is ${order.status}`);
      }

      // Restock
      for (const item of order.items) {
        const product = await Product.findById(item.product).session(session);
        if (product) {
          const variant = product.variants.id(item.variantId);
          if (variant) {
            variant.stockQuantity += item.quantity;
            product.soldCount = Math.max(0, product.soldCount - item.quantity);
            await product.save({ session });
          }
        }
      }

      order.pushStatus('cancelled', req.user._id, 'Cancelled by customer');
      await order.save({ session });
    });

    const order = await Order.findById(req.params.id);
    return sendSuccess(res, 200, { order });
  } catch (err) {
    next(err);
  } finally {
    session.endSession();
  }
}

// --- Admin ---

async function listAllOrders(req, res, next) {
  try {
    let query = Order.find({}).populate('customer', 'firstName lastName email');
    const features = new QueryFeatures(query, req.query);
    features.filter().sort().paginate();

    const [orders, total] = await Promise.all([features.mongooseQuery, Order.countDocuments()]);

    return sendSuccess(res, 200, { orders }, {
      page: features.pagination.page,
      limit: features.pagination.limit,
      total,
      totalPages: Math.ceil(total / features.pagination.limit),
    });
  } catch (err) {
    next(err);
  }
}

async function getOrderAdmin(req, res, next) {
  try {
    const order = await Order.findById(req.params.id).populate('customer', 'firstName lastName email phone');
    if (!order) throw new ApiError(404, 'Order not found');
    return sendSuccess(res, 200, { order });
  } catch (err) {
    next(err);
  }
}

const VALID_TRANSITIONS = {
  pending: ['paid', 'cancelled'],
  paid: ['processing', 'cancelled', 'refunded'],
  processing: ['fulfilled', 'cancelled'],
  fulfilled: ['delivered'],
  delivered: ['refunded'],
  cancelled: [],
  refunded: [],
};

async function updateOrderStatus(req, res, next) {
  try {
    const { status, note } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) throw new ApiError(404, 'Order not found');

    const allowedNext = VALID_TRANSITIONS[order.status] || [];
    if (!allowedNext.includes(status)) {
      throw new ApiError(409, `Cannot transition order from "${order.status}" to "${status}"`);
    }

    order.pushStatus(status, req.user._id, note);
    if (status === 'paid') order.paidAt = new Date();

    await order.save();
    notificationService.notifyOrderStatusChanged(order).catch(() => null);
    return sendSuccess(res, 200, { order });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  checkout,
  listMyOrders,
  getMyOrder,
  cancelMyOrder,
  listAllOrders,
  getOrderAdmin,
  updateOrderStatus,
};
