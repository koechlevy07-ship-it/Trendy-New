const { Cart } = require('../models/Cart');
const { Product } = require('../models/Product');
const { ApiError } = require('../utils/ApiError');
const { sendSuccess } = require('../utils/apiResponse');

async function getOrCreateCart(userId) {
  let cart = await Cart.findOne({ user: userId });
  if (!cart) {
    cart = await Cart.create({ user: userId, items: [] });
  }
  return cart;
}

async function getCart(req, res, next) {
  try {
    const cart = await getOrCreateCart(req.user._id);
    return sendSuccess(res, 200, { cart });
  } catch (err) {
    next(err);
  }
}

async function addItem(req, res, next) {
  try {
    const { productId, variantId, quantity } = req.body;
    const qty = Number(quantity) || 1;

    if (qty < 1) throw new ApiError(400, 'Quantity must be at least 1');

    const product = await Product.findOne({ _id: productId, status: 'published' });
    if (!product) throw new ApiError(404, 'Product not found or unavailable');

    const variant = product.variants.id(variantId);
    if (!variant || !variant.isActive) throw new ApiError(404, 'Product variant not found or unavailable');

    if (variant.stockQuantity < qty) {
      throw new ApiError(409, `Only ${variant.stockQuantity} unit(s) left in stock for this option`);
    }

    const unitPrice = variant.priceOverride != null ? variant.priceOverride : product.basePrice;
    const primaryImage = product.images.find((img) => img.isPrimary) || product.images[0];

    const cart = await getOrCreateCart(req.user._id);
    const existing = cart.items.find((item) => item.variantId.toString() === variantId);

    if (existing) {
      const newQty = existing.quantity + qty;
      if (variant.stockQuantity < newQty) {
        throw new ApiError(409, `Only ${variant.stockQuantity} unit(s) left in stock for this option`);
      }
      existing.quantity = newQty;
      existing.unitPrice = unitPrice; // refresh snapshot to current price
    } else {
      cart.items.push({
        product: product._id,
        variantId,
        sku: variant.sku,
        name: product.name,
        size: variant.size,
        color: variant.color,
        imageUrl: primaryImage ? primaryImage.url : undefined,
        unitPrice,
        quantity: qty,
      });
    }

    await cart.save();
    return sendSuccess(res, 200, { cart });
  } catch (err) {
    next(err);
  }
}

async function updateItemQuantity(req, res, next) {
  try {
    const { quantity } = req.body;
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1) {
      throw new ApiError(400, 'Quantity must be a whole number of at least 1');
    }

    const cart = await getOrCreateCart(req.user._id);
    const item = cart.items.id(req.params.itemId);
    if (!item) throw new ApiError(404, 'Cart item not found');

    const product = await Product.findById(item.product);
    const variant = product ? product.variants.id(item.variantId) : null;
    if (!product || !variant) {
      throw new ApiError(409, 'This item is no longer available and should be removed');
    }
    if (variant.stockQuantity < qty) {
      throw new ApiError(409, `Only ${variant.stockQuantity} unit(s) left in stock for this option`);
    }

    item.quantity = qty;
    await cart.save();
    return sendSuccess(res, 200, { cart });
  } catch (err) {
    next(err);
  }
}

async function removeItem(req, res, next) {
  try {
    const cart = await getOrCreateCart(req.user._id);
    const item = cart.items.id(req.params.itemId);
    if (!item) throw new ApiError(404, 'Cart item not found');

    item.deleteOne();
    await cart.save();
    return sendSuccess(res, 200, { cart });
  } catch (err) {
    next(err);
  }
}

async function clearCart(req, res, next) {
  try {
    const cart = await getOrCreateCart(req.user._id);
    cart.items = [];
    await cart.save();
    return sendSuccess(res, 200, { cart });
  } catch (err) {
    next(err);
  }
}

module.exports = { getCart, addItem, updateItemQuantity, removeItem, clearCart, getOrCreateCart };
