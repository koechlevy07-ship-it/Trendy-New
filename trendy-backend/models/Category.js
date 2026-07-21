const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, index: true },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true, index: true },
    description: { type: String, default: '' },
    shortDescription: { type: String, default: '', maxlength: 300 },
    // Parent hierarchy
    parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null, index: true },
    // Images
    image: { type: String, default: '' },
    bannerImage: { type: String, default: '' },
    mobileBanner: { type: String, default: '' },
    tabletBanner: { type: String, default: '' },
    icon: { type: String, default: 'fa-tag' },
    // Flags
    featured: { type: Boolean, default: false },
    isTrending: { type: Boolean, default: false },
    isSeasonal: { type: Boolean, default: false },
    seasonalLabel: { type: String, default: '' },
    showOnHomepage: { type: Boolean, default: true },
    showInNavigation: { type: Boolean, default: true },
    showInMegaMenu: { type: Boolean, default: true },
    showInMobileMenu: { type: Boolean, default: true },
    // Settings
    status: { type: String, enum: ['published', 'hidden', 'archived'], default: 'published' },
    displayOrder: { type: Number, default: 0 },
    // SEO
    seoTitle: { type: String, default: '', trim: true, maxlength: 70 },
    seoDescription: { type: String, default: '', trim: true, maxlength: 160 },
    seoKeywords: { type: [String], default: [] },
    ogImage: { type: String, default: '' },
    canonicalUrl: { type: String, default: '', trim: true }
}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

categorySchema.virtual('productCount', {
    ref: 'Product', localField: 'slug', foreignField: 'category', count: true
});

categorySchema.virtual('children', {
    ref: 'Category', localField: '_id', foreignField: 'parent'
});

categorySchema.index({ displayOrder: 1 });
categorySchema.index({ featured: 1, status: 1 });

module.exports = mongoose.model('Category', categorySchema);
