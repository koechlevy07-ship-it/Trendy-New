const { Order } = require('../models/Order');
const { Product } = require('../models/Product');
const { User } = require('../models/User');
const { sendSuccess } = require('../utils/apiResponse');

function parseDateRange(query) {
  const to = query.to ? new Date(query.to) : new Date();
  const from = query.from ? new Date(query.from) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from, to };
}

/**
 * Revenue, order count, and average order value over a date range —
 * excludes cancelled/refunded orders from revenue figures.
 */
async function salesSummary(req, res, next) {
  try {
    const { from, to } = parseDateRange(req.query);
    const revenueStatuses = ['paid', 'processing', 'fulfilled', 'delivered'];

    const [summary] = await Order.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to }, status: { $in: revenueStatuses } } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$total' },
          orderCount: { $sum: 1 },
          avgOrderValue: { $avg: '$total' },
        },
      },
    ]);

    const statusCounts = await Order.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    return sendSuccess(res, 200, {
      range: { from, to },
      totalRevenue: summary?.totalRevenue || 0,
      orderCount: summary?.orderCount || 0,
      avgOrderValue: Math.round(summary?.avgOrderValue || 0),
      currency: 'KES',
      statusBreakdown: statusCounts.reduce((acc, s) => ({ ...acc, [s._id]: s.count }), {}),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Daily revenue series for charting.
 */
async function revenueTimeSeries(req, res, next) {
  try {
    const { from, to } = parseDateRange(req.query);
    const revenueStatuses = ['paid', 'processing', 'fulfilled', 'delivered'];

    const series = await Order.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to }, status: { $in: revenueStatuses } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          revenue: { $sum: '$total' },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return sendSuccess(res, 200, { series });
  } catch (err) {
    next(err);
  }
}

/**
 * Best-selling products by units sold within the date range.
 */
async function topProducts(req, res, next) {
  try {
    const { from, to } = parseDateRange(req.query);
    const limit = Math.min(Number(req.query.limit) || 10, 50);

    const results = await Order.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to }, status: { $ne: 'cancelled' } } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          name: { $first: '$items.name' },
          unitsSold: { $sum: '$items.quantity' },
          revenue: { $sum: '$items.lineTotal' },
        },
      },
      { $sort: { unitsSold: -1 } },
      { $limit: limit },
    ]);

    return sendSuccess(res, 200, { products: results });
  } catch (err) {
    next(err);
  }
}

async function inventoryAlerts(req, res, next) {
  try {
    const products = await Product.find({ status: 'published' }).select('name slug variants');

    const lowStock = [];
    const outOfStock = [];

    products.forEach((product) => {
      product.variants.forEach((variant) => {
        const entry = {
          productId: product._id,
          productName: product.name,
          slug: product.slug,
          sku: variant.sku,
          size: variant.size,
          color: variant.color,
          stockQuantity: variant.stockQuantity,
        };
        if (variant.stockQuantity === 0) outOfStock.push(entry);
        else if (variant.stockQuantity <= variant.lowStockThreshold) lowStock.push(entry);
      });
    });

    return sendSuccess(res, 200, { lowStock, outOfStock });
  } catch (err) {
    next(err);
  }
}

async function customerSummary(req, res, next) {
  try {
    const { from, to } = parseDateRange(req.query);

    const [totalCustomers, newCustomers] = await Promise.all([
      User.countDocuments({ role: 'customer' }),
      User.countDocuments({ role: 'customer', createdAt: { $gte: from, $lte: to } }),
    ]);

    return sendSuccess(res, 200, { totalCustomers, newCustomers, range: { from, to } });
  } catch (err) {
    next(err);
  }
}

module.exports = { salesSummary, revenueTimeSeries, topProducts, inventoryAlerts, customerSummary };
