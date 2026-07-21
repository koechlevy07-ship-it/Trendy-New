const mongoose = require('mongoose');

const specificationSchema = new mongoose.Schema({
    key: { type: String, trim: true },
    value: { type: String, trim: true }
}, { _id: false });

const productSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Product name is required'],
        trim: true,
        maxlength: 200
    },
    slug: {
        type: String,
        unique: true,
        sparse: true,
        trim: true,
        lowercase: true
    },
    description: {
        type: String,
        default: ''
    },
    shortDescription: {
        type: String,
        default: '',
        maxlength: 300
    },
    price: {
        type: Number,
        required: [true, 'Price is required'],
        min: 0,
        default: 0
    },
    originalPrice: {
        type: Number,
        default: null,
        min: 0
    },
    stock: {
        type: Number,
        default: 0,
        min: 0
    },
    stockThreshold: {
        type: Number,
        default: 5,
        min: 0
    },
    sku: {
        type: String,
        unique: true,
        sparse: true,
        trim: true
    },
    brand: {
        type: String,
        default: '',
        trim: true
    },
    material: {
        type: String,
        default: ''
    },
    category: {
        type: String,
        default: '',
        trim: true
    },
    gender: {
        type: String,
        enum: ['men', 'women', 'kids', 'unisex', ''],
        default: 'unisex'
    },
    thumbnail: {
        type: String,
        default: ''
    },
    images: {
        type: [String],
        default: []
    },
    gallery: {
        type: [String],
        default: []
    },
    images360: {
        type: [String],
        default: []
    },
    sizes: {
        type: [String],
        default: []
    },
    ukSize: {
        type: String,
        default: ''
    },
    colors: {
        type: [String],
        default: []
    },
    colorSwatches: {
        type: [{
            name: { type: String, trim: true },
            hex: { type: String, trim: true },
            image: { type: String, default: '' }
        }],
        default: []
    },
    specifications: {
        type: [specificationSchema],
        default: []
    },
    tags: {
        type: [String],
        default: []
    },
    limitedPieces: {
        type: Number,
        default: 0,
        min: 0
    },
    limitedAvailable: {
        type: Boolean,
        default: false
    },
    preOrder: {
        type: Boolean,
        default: false
    },
    soldOut: {
        type: Boolean,
        default: false
    },
    deliveryEstimate: {
        type: String,
        default: '2-5 business days',
        trim: true
    },
    featured: {
        type: Boolean,
        default: false
    },
    isNewArrival: {
        type: Boolean,
        default: false
    },
    isBestSeller: {
        type: Boolean,
        default: false
    },
    flashSale: {
        type: Boolean,
        default: false
    },
    flashSalePrice: {
        type: Number,
        default: null,
        min: 0
    },
    flashSaleEnd: {
        type: Date,
        default: null
    },
    sponsored: {
        type: Boolean,
        default: false
    },
    installmentEligible: {
        type: Boolean,
        default: false
    },
    installmentPrice: {
        type: Number,
        default: null,
        min: 0
    },
    visibility: {
        type: String,
        enum: ['visible', 'hidden', 'featured-only'],
        default: 'visible'
    },
    rating: {
        type: Number,
        default: 0,
        min: 0,
        max: 5
    },
    totalReviews: {
        type: Number,
        default: 0,
        min: 0
    },
    totalSold: {
        type: Number,
        default: 0,
        min: 0
    },
    relatedProducts: {
        type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
        default: []
    },
    status: {
        type: String,
        enum: ['published', 'draft', 'archived', 'scheduled'],
        default: 'published'
    },
    inStock: {
        type: Boolean,
        default: true
    },
    // NEW FIELDS
    barcode: { type: String, default: '', trim: true },
    subcategory: { type: String, default: '', trim: true },
    collection: { type: String, default: '', trim: true },
    ageGroup: { type: String, default: '', trim: true },
    discountType: { type: String, enum: ['percentage', 'fixed', ''], default: '' },
    discountValue: { type: Number, default: null, min: 0 },
    discountStart: { type: Date, default: null },
    discountEnd: { type: Date, default: null },
    allowBackorders: { type: Boolean, default: false },
    reservedStock: { type: Number, default: 0, min: 0 },
    isTrending: { type: Boolean, default: false },
    isLimitedEdition: { type: Boolean, default: false },
    isScheduled: { type: Boolean, default: false },
    scheduledPublishDate: { type: Date, default: null },
    seoTitle: { type: String, default: '', trim: true, maxlength: 70 },
    seoDescription: { type: String, default: '', trim: true, maxlength: 160 },
    seoKeywords: { type: [String], default: [] },
    ogImage: { type: String, default: '' },
    canonicalUrl: { type: String, default: '', trim: true }
}, { timestamps: true });

productSchema.index({ category: 1 });
productSchema.index({ gender: 1 });
productSchema.index({ status: 1 });
productSchema.index({ featured: 1 });
productSchema.index({ slug: 1 });
productSchema.index({ name: 'text', description: 'text', tags: 'text', brand: 'text' });
productSchema.index({ createdAt: -1 });
productSchema.index({ price: 1 });
productSchema.index({ rating: -1 });
productSchema.index({ totalSold: -1 });
productSchema.index({ flashSale: 1, flashSaleEnd: 1 });

productSchema.post('findOneAndDelete', async function(doc) {
    if (doc) {
        const Wishlist = mongoose.model('Wishlist');
        await Wishlist.updateMany({ 'items.productId': doc._id }, { $pull: { items: { productId: doc._id } } });
    }
});

productSchema.post('deleteOne', { document: true, query: false }, async function(doc) {
    if (doc) {
        const Wishlist = mongoose.model('Wishlist');
        await Wishlist.updateMany({ 'items.productId': doc._id }, { $pull: { items: { productId: doc._id } } });
    }
});

module.exports = mongoose.model('Product', productSchema);
