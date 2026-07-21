const mongoose = require('mongoose');

const homepageSectionSchema = new mongoose.Schema({
    sectionKey: { type: String, required: true, unique: true, trim: true },
    title: { type: String, default: '' },
    subtitle: { type: String, default: '' },
    enabled: { type: Boolean, default: true },
    displayOrder: { type: Number, default: 0 },
    content: { type: mongoose.Schema.Types.Mixed, default: {} },
    settings: {
        backgroundColor: { type: String, default: '' },
        textColor: { type: String, default: '' },
        fullWidth: { type: Boolean, default: false },
        paddingTop: { type: Number, default: 60 },
        paddingBottom: { type: Number, default: 60 },
        maxProducts: { type: Number, default: 8 }
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

homepageSectionSchema.index({ sectionKey: 1 });
homepageSectionSchema.index({ displayOrder: 1 });

module.exports = mongoose.model('HomepageSection', homepageSectionSchema);