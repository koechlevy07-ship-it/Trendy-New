const mongoose = require('mongoose');
const { slugify } = require('./Category');

const imageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    altText: { type: String, trim: true, default: '' },
    isPrimary: { type: Boolean, default: false },
    displayOrder: { type: Number, default: 0 },
  },
  { _id: true }
);

const variantSchema = new mongoose.Schema(
  {
    sku: { type: String, required: true, trim: true, uppercase: true },
    size: { type: String, trim: true, required: true },
    color: { type: String, trim: true, required: true },
    colorHex: { type: String, trim: true },
    priceOverride: { type: Number, min: 0, default: null }, // null = use base price
    stockQuantity: { type: Number, required: true, min: 0, default: 0 },
    lowStockThreshold: { type: Number, default: 5, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  { _id: true, timestamps: true }
);

variantSchema.virtual('inStock').get(function inStock() {
  return this.stockQuantity > 0;
});
variantSchema.set('toJSON', { virtuals: true });
variantSchema.set('toObject', { virtuals: true });

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 150 },
    slug: { type: String, required: true, unique: true, lowercase: true, index: true },
    brand: { type: String, trim: true, maxlength: 80, default: 'Trendy Wardrobe' },
    description: { type: String, required: true, trim: true, maxlength: 3000 },
    shortDescription: { type: String, trim: true, maxlength: 300 },

    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true, index: true },
    tags: [{ type: String, trim: true, lowercase: true }],

    // All prices stored as KES (KSh) integers/decimals — no currency conversion in v1
    basePrice: { type: Number, required: true, min: 0 },
    compareAtPrice: { type: Number, min: 0, default: null }, // for "was/now" discount display
    currency: { type: String, default: 'KES', enum: ['KES'] },

    images: {
      type: [imageSchema],
      validate: {
        validator: (arr) => arr.length > 0,
        message: 'At least one product image is required',
      },
    },
    variants: {
      type: [variantSchema],
      validate: {
        validator: (arr) => arr.length > 0,
        message: 'At least one product variant is required',
      },
    },

    material: { type: String, trim: true },
    careInstructions: { type: String, trim: true, maxlength: 1000 },

    status: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      default: 'draft',
      index: true,
    },
    isFeatured: { type: Boolean, default: false, index: true },

    ratingAverage: { type: Number, min: 0, max: 5, default: 0 },
    ratingCount: { type: Number, min: 0, default: 0 },
    soldCount: { type: Number, min: 0, default: 0 },

    seo: {
      metaTitle: { type: String, trim: true, maxlength: 70 },
      metaDescription: { type: String, trim: true, maxlength: 160 },
    },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

productSchema.index({ name: 'text', description: 'text', tags: 'text' });
productSchema.index({ status: 1, category: 1 });
productSchema.index({ basePrice: 1 });

productSchema.pre('validate', function generateSlug(next) {
  if (this.name && (!this.slug || this.isModified('name'))) {
    this.slug = `${slugify(this.name)}-${this._id.toString().slice(-6)}`;
  }
  next();
});

productSchema.virtual('totalStock').get(function totalStock() {
  if (!this.variants || this.variants.length === 0) return 0;
  return this.variants.reduce((sum, v) => sum + v.stockQuantity, 0);
});

productSchema.virtual('isInStock').get(function isInStock() {
  return this.totalStock > 0;
});

productSchema.virtual('discountPercent').get(function discountPercent() {
  if (!this.compareAtPrice || this.compareAtPrice <= this.basePrice) return 0;
  return Math.round(((this.compareAtPrice - this.basePrice) / this.compareAtPrice) * 100);
});

productSchema.set('toJSON', { virtuals: true });
productSchema.set('toObject', { virtuals: true });

const Product = mongoose.model('Product', productSchema);

module.exports = { Product };
