const { ShippingZone } = require('../models/ShippingZone');
const { calculateShipping } = require('../services/shippingService');
const { ApiError } = require('../utils/ApiError');
const { sendSuccess } = require('../utils/apiResponse');

/**
 * Public: lets the storefront show the delivery fee/estimate at cart/checkout
 * time, before the order is actually placed.
 */
async function getQuote(req, res, next) {
  try {
    const { county, subtotal } = req.query;
    if (!county) throw new ApiError(400, 'county is required');

    const quote = await calculateShipping({ county, subtotal: Number(subtotal) || 0 });
    return sendSuccess(res, 200, { quote });
  } catch (err) {
    next(err);
  }
}

async function listZones(req, res, next) {
  try {
    const filter = req.query.includeInactive === 'true' ? {} : { isActive: true };
    const zones = await ShippingZone.find(filter).sort('name');
    return sendSuccess(res, 200, { zones });
  } catch (err) {
    next(err);
  }
}

async function createZone(req, res, next) {
  try {
    const zone = await ShippingZone.create(req.body);
    return sendSuccess(res, 201, { zone });
  } catch (err) {
    next(err);
  }
}

async function updateZone(req, res, next) {
  try {
    const zone = await ShippingZone.findById(req.params.id);
    if (!zone) throw new ApiError(404, 'Shipping zone not found');

    const updatable = [
      'name',
      'counties',
      'baseFee',
      'estimatedDaysMin',
      'estimatedDaysMax',
      'freeShippingThreshold',
      'isActive',
    ];
    updatable.forEach((field) => {
      if (req.body[field] !== undefined) zone[field] = req.body[field];
    });

    await zone.save();
    return sendSuccess(res, 200, { zone });
  } catch (err) {
    next(err);
  }
}

async function deleteZone(req, res, next) {
  try {
    const zone = await ShippingZone.findById(req.params.id);
    if (!zone) throw new ApiError(404, 'Shipping zone not found');
    await zone.deleteOne();
    return sendSuccess(res, 200, { message: 'Shipping zone deleted' });
  } catch (err) {
    next(err);
  }
}

module.exports = { getQuote, listZones, createZone, updateZone, deleteZone };
