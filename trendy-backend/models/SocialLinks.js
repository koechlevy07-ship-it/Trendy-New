const mongoose = require('mongoose');

const socialPlatformSchema = new mongoose.Schema({
    url: { type: String, default: '' },
    enabled: { type: Boolean, default: false },
    openInNewTab: { type: Boolean, default: true }
}, { _id: false });

const socialLinksSchema = new mongoose.Schema({
    facebook: { type: socialPlatformSchema, default: () => ({}) },
    instagram: { type: socialPlatformSchema, default: () => ({}) },
    tiktok: { type: socialPlatformSchema, default: () => ({}) },
    twitter: { type: socialPlatformSchema, default: () => ({}) },
    pinterest: { type: socialPlatformSchema, default: () => ({}) },
    linkedin: { type: socialPlatformSchema, default: () => ({}) },
    youtube: { type: socialPlatformSchema, default: () => ({}) },
    whatsapp: { type: socialPlatformSchema, default: () => ({}) },
    threads: { type: socialPlatformSchema, default: () => ({}) },
    telegram: { type: socialPlatformSchema, default: () => ({}) },
    snapchat: { type: socialPlatformSchema, default: () => ({}) }
}, { timestamps: true });

module.exports = mongoose.model('SocialLinks', socialLinksSchema);
