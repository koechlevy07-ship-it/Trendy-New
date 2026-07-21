const mongoose = require('mongoose');

const heroSlideSchema = new mongoose.Schema({
    desktopImage: { type: String, default: '' },
    mobileImage: { type: String, default: '' },
    videoUrl: { type: String, default: '' },
    heading: { type: String, default: '' },
    subheading: { type: String, default: '' },
    buttonText: { type: String, default: 'Shop Now' },
    buttonLink: { type: String, default: '/products' },
    displayOrder: { type: Number, default: 0 },
    active: { type: Boolean, default: true }
}, { _id: true });

const genderCatalogueSchema = new mongoose.Schema({
    title: { type: String, default: '' },
    image: { type: String, default: '' },
    subtitle: { type: String, default: '' },
    buttonText: { type: String, default: 'Shop Now' },
    buttonLink: { type: String, default: '/products' },
    displayOrder: { type: Number, default: 0 },
    visible: { type: Boolean, default: true }
}, { _id: true });

const homepageSchema = new mongoose.Schema({
    heroSlides: [heroSlideSchema],
    genderCatalogues: [genderCatalogueSchema],
    featuredCollections: {
        title: { type: String, default: 'Featured Collections' },
        subtitle: { type: String, default: 'Curated for the modern connoisseur' },
        products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }]
    }
}, { timestamps: true });

module.exports = mongoose.model('Homepage', homepageSchema);
