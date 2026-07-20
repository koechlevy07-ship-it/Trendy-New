const { Category } = require('../models/Category');
const { Product } = require('../models/Product');
const cloudinary = require('../config/cloudinary');
const { ApiError } = require('../utils/ApiError');
const { sendSuccess } = require('../utils/apiResponse');

async function listCategories(req, res, next) {
  try {
    const filter = req.query.includeInactive === 'true' ? {} : { isActive: true };
    if (req.query.parent === 'null') {
      filter.parent = null;
    } else if (req.query.parent) {
      filter.parent = req.query.parent;
    }

    const categories = await Category.find(filter).sort('displayOrder name');
    return sendSuccess(res, 200, { categories });
  } catch (err) {
    next(err);
  }
}

async function getCategory(req, res, next) {
  try {
    const category = await Category.findOne({ slug: req.params.slug });
    if (!category) throw new ApiError(404, 'Category not found');
    return sendSuccess(res, 200, { category });
  } catch (err) {
    next(err);
  }
}

async function createCategory(req, res, next) {
  try {
    const { name, description, parent, displayOrder, seo } = req.body;

    if (parent) {
      const parentExists = await Category.findById(parent);
      if (!parentExists) throw new ApiError(400, 'Parent category does not exist');
    }

    let imageUrl = null;
    let imagePublicId = null;
    if (req.file) {
      imageUrl = req.file.path;
      imagePublicId = req.file.filename;
    }

    const category = await Category.create({
      name,
      description,
      parent: parent || null,
      displayOrder,
      seo,
      imageUrl,
      imagePublicId,
    });

    return sendSuccess(res, 201, { category });
  } catch (err) {
    next(err);
  }
}

async function updateCategory(req, res, next) {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) throw new ApiError(404, 'Category not found');

    const updatable = ['name', 'description', 'parent', 'displayOrder', 'isActive', 'seo'];
    updatable.forEach((field) => {
      if (req.body[field] !== undefined) category[field] = req.body[field];
    });

    if (req.file) {
      if (category.imagePublicId) {
        await cloudinary.uploader.destroy(category.imagePublicId).catch(() => null);
      }
      category.imageUrl = req.file.path;
      category.imagePublicId = req.file.filename;
    }

    await category.save();
    return sendSuccess(res, 200, { category });
  } catch (err) {
    next(err);
  }
}

async function deleteCategory(req, res, next) {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) throw new ApiError(404, 'Category not found');

    const [childCount, productCount] = await Promise.all([
      Category.countDocuments({ parent: category._id }),
      Product.countDocuments({ category: category._id }),
    ]);

    if (childCount > 0) {
      throw new ApiError(409, 'Cannot delete a category that has subcategories');
    }
    if (productCount > 0) {
      throw new ApiError(409, 'Cannot delete a category that has products assigned to it');
    }

    if (category.imagePublicId) {
      await cloudinary.uploader.destroy(category.imagePublicId).catch(() => null);
    }

    await category.deleteOne();
    return sendSuccess(res, 200, { message: 'Category deleted' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
};
