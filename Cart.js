const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary');
const { ApiError } = require('../utils/ApiError');

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function fileFilter(req, file, cb) {
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return cb(new ApiError(400, 'Only JPEG, PNG, and WebP images are allowed'), false);
  }
  cb(null, true);
}

function makeUploader(folder, maxFiles) {
  const storage = new CloudinaryStorage({
    cloudinary,
    params: {
      folder: `trendy-wardrobe/${folder}`,
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      transformation: [{ width: 2000, height: 2000, crop: 'limit', quality: 'auto' }],
    },
  });

  return multer({
    storage,
    fileFilter,
    limits: { fileSize: MAX_FILE_SIZE_BYTES, files: maxFiles },
  });
}

const uploadProductImages = makeUploader('products', 8);
const uploadCategoryImage = makeUploader('categories', 1);
const uploadCmsImage = makeUploader('cms', 1);

module.exports = { uploadProductImages, uploadCategoryImage, uploadCmsImage };
