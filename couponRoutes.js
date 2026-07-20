const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema(
  {
    // Enforces a single document — see getSettings() below
    singletonKey: { type: String, default: 'global', unique: true },

    storeName: { type: String, default: 'Trendy Wardrobe' },
    supportEmail: { type: String, default: 'support@trendywardrobe.co.ke' },
    supportPhone: { type: String, default: '' },

    currency: { type: String, default: 'KES' },
    taxRatePercent: { type: Number, default: 0, min: 0, max: 100 },

    socialLinks: {
      instagram: { type: String, default: '' },
      facebook: { type: String, default: '' },
      tiktok: { type: String, default: '' },
      whatsapp: { type: String, default: '' },
    },

    maintenanceMode: { type: Boolean, default: false },
    maintenanceMessage: { type: String, default: 'We are currently upgrading. Please check back shortly.' },

    homepageAnnouncementBar: { type: String, default: '' },

    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

const Settings = mongoose.model('Settings', settingsSchema);

async function getSettings() {
  let settings = await Settings.findOne({ singletonKey: 'global' });
  if (!settings) {
    settings = await Settings.create({ singletonKey: 'global' });
  }
  return settings;
}

module.exports = { Settings, getSettings };
