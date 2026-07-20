const mongoose = require('mongoose');

const cmsPageSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 150 },
    slug: { type: String, required: true, unique: true, lowercase: true, index: true, trim: true },
    type: {
      type: String,
      enum: ['static_page', 'homepage_banner', 'homepage_section'],
      default: 'static_page',
    },
    content: { type: String, default: '' }, // HTML/rich content for static pages
    imageUrl: { type: String, default: null },
    imagePublicId: { type: String, default: null },
    linkUrl: { type: String, trim: true }, // for banners: where the CTA points
    displayOrder: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: false },
    publishAt: { type: Date, default: null },
    expireAt: { type: Date, default: null },
    seo: {
      metaTitle: { type: String, trim: true, maxlength: 70 },
      metaDescription: { type: String, trim: true, maxlength: 160 },
    },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

cmsPageSchema.index({ type: 1, isPublished: 1, displayOrder: 1 });

cmsPageSchema.methods.isCurrentlyLive = function isCurrentlyLive() {
  const now = new Date();
  if (!this.isPublished) return false;
  if (this.publishAt && this.publishAt > now) return false;
  if (this.expireAt && this.expireAt < now) return false;
  return true;
};

const CmsPage = mongoose.model('CmsPage', cmsPageSchema);

module.exports = { CmsPage };
