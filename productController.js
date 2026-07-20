const { CmsPage } = require('../models/CmsPage');
const cloudinary = require('../config/cloudinary');
const { ApiError } = require('../utils/ApiError');
const { sendSuccess } = require('../utils/apiResponse');

function liveFilter() {
  const now = new Date();
  return {
    isPublished: true,
    $and: [
      { $or: [{ publishAt: null }, { publishAt: { $lte: now } }] },
      { $or: [{ expireAt: null }, { expireAt: { $gte: now } }] },
    ],
  };
}

async function listPublic(req, res, next) {
  try {
    const filter = liveFilter();
    if (req.query.type) filter.type = req.query.type;

    const pages = await CmsPage.find(filter).sort('displayOrder -createdAt');
    return sendSuccess(res, 200, { pages });
  } catch (err) {
    next(err);
  }
}

async function getPublicBySlug(req, res, next) {
  try {
    const page = await CmsPage.findOne({ slug: req.params.slug, ...liveFilter() });
    if (!page) throw new ApiError(404, 'Page not found');
    return sendSuccess(res, 200, { page });
  } catch (err) {
    next(err);
  }
}

async function listAdmin(req, res, next) {
  try {
    const filter = {};
    if (req.query.type) filter.type = req.query.type;
    const pages = await CmsPage.find(filter).sort('-updatedAt');
    return sendSuccess(res, 200, { pages });
  } catch (err) {
    next(err);
  }
}

async function createPage(req, res, next) {
  try {
    let imageUrl = null;
    let imagePublicId = null;
    if (req.file) {
      imageUrl = req.file.path;
      imagePublicId = req.file.filename;
    }

    const page = await CmsPage.create({
      ...req.body,
      imageUrl,
      imagePublicId,
      updatedBy: req.user._id,
    });

    return sendSuccess(res, 201, { page });
  } catch (err) {
    next(err);
  }
}

async function updatePage(req, res, next) {
  try {
    const page = await CmsPage.findById(req.params.id);
    if (!page) throw new ApiError(404, 'Page not found');

    const updatable = [
      'title',
      'type',
      'content',
      'linkUrl',
      'displayOrder',
      'isPublished',
      'publishAt',
      'expireAt',
      'seo',
    ];
    updatable.forEach((field) => {
      if (req.body[field] !== undefined) page[field] = req.body[field];
    });

    if (req.file) {
      if (page.imagePublicId) {
        await cloudinary.uploader.destroy(page.imagePublicId).catch(() => null);
      }
      page.imageUrl = req.file.path;
      page.imagePublicId = req.file.filename;
    }

    page.updatedBy = req.user._id;
    await page.save();
    return sendSuccess(res, 200, { page });
  } catch (err) {
    next(err);
  }
}

async function deletePage(req, res, next) {
  try {
    const page = await CmsPage.findById(req.params.id);
    if (!page) throw new ApiError(404, 'Page not found');

    if (page.imagePublicId) {
      await cloudinary.uploader.destroy(page.imagePublicId).catch(() => null);
    }

    await page.deleteOne();
    return sendSuccess(res, 200, { message: 'Page deleted' });
  } catch (err) {
    next(err);
  }
}

module.exports = { listPublic, getPublicBySlug, listAdmin, createPage, updatePage, deletePage };
