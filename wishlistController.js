const { Product } = require('../models/Product');
const { Category } = require('../models/Category');
const cloudinary = require('../config/cloudinary');
const { ApiError } = require('../utils/ApiError');
const { sendSuccess } = require('../utils/apiResponse');
const { QueryFeatures } = require('../utils/queryFeatures');

/**
 * Public: list products. Customers only ever see status: 'published'.
 * Supports ?search=, ?category=, ?minPrice=, ?maxPrice=, ?sort=, ?page=, ?limit=
 */
async function listProducts(req, res, next) {
  try {
    const baseFilter = { status: 'published' };

    if (req.query.category) baseFilter.category = req.query.category;
    if (req.query.isFeatured === 'true') baseFilter.isFeatured = true;

    if (req.query.minPrice || req.query.maxPrice) {
      baseFilter.basePrice = {};
      if (req.query.minPrice) baseFilter.basePrice.$gte = Number(req.query.minPrice);
      if (req.query.maxPrice) baseFilter.basePrice.$lte = Number(req.query.maxPrice);
    }

    let query = Product.find(baseFilter).populate('category', 'name slug');

    const features = new QueryFeatures(query, req.query);
    features.search(['name', 'shortDescription', 'tags']).sort().paginate();

    const [products, total] = await Promise.all([
      features.mongooseQuery,
      Product.countDocuments(baseFilter),
    ]);

    return sendSuccess(res, 200, { products }, {
      page: features.pagination.page,
      limit: features.pagination.limit,
      total,
      totalPages: Math.ceil(total / features.pagination.limit),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Admin: list all products regardless of status, for the dashboard.
 */
async function listProductsAdmin(req, res, next) {
  try {
    let query = Product.find({}).populate('category', 'name slug');
    const features = new QueryFeatures(query, req.query);
    features.filter().search(['name', 'shortDescription', 'tags']).sort().paginate();

    const [products, total] = await Promise.all([
      features.mongooseQuery,
      Product.countDocuments(),
    ]);

    return sendSuccess(res, 200, { products }, {
      page: features.pagination.page,
      limit: features.pagination.limit,
      total,
      totalPages: Math.ceil(total / features.pagination.limit),
    });
  } catch (err) {
    next(err);
  }
}

async function getProduct(req, res, next) {
  try {
    const product = await Product.findOne({ slug: req.params.slug, status: 'published' }).populate(
      'category',
      'name slug'
    );
    if (!product) throw new ApiError(404, 'Product not found');
    return sendSuccess(res, 200, { product });
  } catch (err) {
    next(err);
  }
}

async function getProductAdmin(req, res, next) {
  try {
    const product = await Product.findById(req.params.id).populate('category', 'name slug');
    if (!product) throw new ApiError(404, 'Product not found');
    return sendSuccess(res, 200, { product });
  } catch (err) {
    next(err);
  }
}

async function createProduct(req, res, next) {
  try {
    const category = await Category.findById(req.body.category);
    if (!category) throw new ApiError(400, 'Category does not exist');

    let variants = req.body.variants;
    if (typeof variants === 'string') variants = JSON.parse(variants);
    if (!Array.isArray(variants) || variants.length === 0) {
      throw new ApiError(400, 'At least one product variant is required');
    }

    const images = (req.files || []).map((file, index) => ({
      url: file.path,
      publicId: file.filename,
      isPrimary: index === 0,
      displayOrder: index,
    }));
    if (images.length === 0) {
      throw new ApiError(400, 'At least one product image is required');
    }

    const product = await Product.create({
      name: req.body.name,
      brand: req.body.brand,
      description: req.body.description,
      shortDescription: req.body.shortDescription,
      category: req.body.category,
      tags: req.body.tags ? String(req.body.tags).split(',').map((t) => t.trim().toLowerCase()) : [],
      basePrice: req.body.basePrice,
      compareAtPrice: req.body.compareAtPrice || null,
      images,
      variants,
      material: req.body.material,
      careInstructions: req.body.careInstructions,
      status: req.body.status || 'draft',
      isFeatured: req.body.isFeatured === 'true' || req.body.isFeatured === true,
      seo: req.body.seo,
      createdBy: req.user._id,
    });

    return sendSuccess(res, 201, { product });
  } catch (err) {
    next(err);
  }
}

async function updateProduct(req, res, next) {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) throw new ApiError(404, 'Product not found');

    if (req.body.category) {
      const category = await Category.findById(req.body.category);
      if (!category) throw new ApiError(400, 'Category does not exist');
    }

    const updatable = [
      'name',
      'brand',
      'description',
      'shortDescription',
      'category',
      'basePrice',
      'compareAtPrice',
      'material',
      'careInstructions',
      'status',
      'isFeatured',
      'seo',
    ];
    updatable.forEach((field) => {
      if (req.body[field] !== undefined) product[field] = req.body[field];
    });

    if (req.body.tags !== undefined) {
      product.tags = String(req.body.tags)
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);
    }

    if (req.body.variants !== undefined) {
      const variants = typeof req.body.variants === 'string' ? JSON.parse(req.body.variants) : req.body.variants;
      if (!Array.isArray(variants) || variants.length === 0) {
        throw new ApiError(400, 'At least one product variant is required');
      }
      product.variants = variants;
    }

    // Newly uploaded files are appended; removing individual images is a separate endpoint
    if (req.files && req.files.length > 0) {
      const startOrder = product.images.length;
      const newImages = req.files.map((file, index) => ({
        url: file.path,
        publicId: file.filename,
        isPrimary: product.images.length === 0 && index === 0,
        displayOrder: startOrder + index,
      }));
      product.images.push(...newImages);
    }

    await product.save();
    return sendSuccess(res, 200, { product });
  } catch (err) {
    next(err);
  }
}

async function removeProductImage(req, res, next) {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) throw new ApiError(404, 'Product not found');

    const image = product.images.id(req.params.imageId);
    if (!image) throw new ApiError(404, 'Image not found on this product');

    if (product.images.length <= 1) {
      throw new ApiError(409, 'Cannot remove the last remaining image; at least one is required');
    }

    await cloudinary.uploader.destroy(image.publicId).catch(() => null);
    const wasPrimary = image.isPrimary;
    image.deleteOne();

    if (wasPrimary && product.images.length > 0) {
      product.images[0].isPrimary = true;
    }

    await product.save();
    return sendSuccess(res, 200, { product });
  } catch (err) {
    next(err);
  }
}

async function deleteProduct(req, res, next) {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) throw new ApiError(404, 'Product not found');

    await Promise.all(
      product.images.map((img) => cloudinary.uploader.destroy(img.publicId).catch(() => null))
    );

    await product.deleteOne();
    return sendSuccess(res, 200, { message: 'Product deleted' });
  } catch (err) {
    next(err);
  }
}

/**
 * Adjust stock for a single variant. Used by inventory management and,
 * later, order placement/cancellation/restocking.
 */
async function adjustVariantStock(req, res, next) {
  try {
    const { id, variantId } = req.params;
    const { delta } = req.body; // positive to add stock, negative to deduct

    if (typeof delta !== 'number' || !Number.isFinite(delta)) {
      throw new ApiError(400, 'delta must be a number');
    }

    const product = await Product.findById(id);
    if (!product) throw new ApiError(404, 'Product not found');

    const variant = product.variants.id(variantId);
    if (!variant) throw new ApiError(404, 'Variant not found on this product');

    const newQuantity = variant.stockQuantity + delta;
    if (newQuantity < 0) {
      throw new ApiError(409, 'Insufficient stock for this adjustment');
    }

    variant.stockQuantity = newQuantity;
    await product.save();

    return sendSuccess(res, 200, { variant });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listProducts,
  listProductsAdmin,
  getProduct,
  getProductAdmin,
  createProduct,
  updateProduct,
  removeProductImage,
  deleteProduct,
  adjustVariantStock,
};
