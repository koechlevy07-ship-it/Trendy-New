const { User } = require('../models/User');
const { Product } = require('../models/Product');
const { ApiError } = require('../utils/ApiError');
const { sendSuccess } = require('../utils/apiResponse');

async function getWishlist(req, res, next) {
  try {
    const user = await User.findById(req.user._id).populate({
      path: 'wishlist',
      match: { status: 'published' },
      select: 'name slug basePrice compareAtPrice images ratingAverage',
    });
    return sendSuccess(res, 200, { wishlist: user.wishlist });
  } catch (err) {
    next(err);
  }
}

async function addToWishlist(req, res, next) {
  try {
    const { productId } = req.params;
    const product = await Product.findOne({ _id: productId, status: 'published' });
    if (!product) throw new ApiError(404, 'Product not found');

    const user = await User.findById(req.user._id);
    const alreadySaved = user.wishlist.some((id) => id.toString() === productId);

    if (!alreadySaved) {
      user.wishlist.push(productId);
      await user.save({ validateBeforeSave: false });
    }

    return sendSuccess(res, 200, { wishlist: user.wishlist });
  } catch (err) {
    next(err);
  }
}

async function removeFromWishlist(req, res, next) {
  try {
    const { productId } = req.params;
    const user = await User.findById(req.user._id);
    user.wishlist = user.wishlist.filter((id) => id.toString() !== productId);
    await user.save({ validateBeforeSave: false });
    return sendSuccess(res, 200, { wishlist: user.wishlist });
  } catch (err) {
    next(err);
  }
}

module.exports = { getWishlist, addToWishlist, removeFromWishlist };
