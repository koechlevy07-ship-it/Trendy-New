const { getSettings } = require('../models/Settings');
const { sendSuccess } = require('../utils/apiResponse');

async function getPublicSettings(req, res, next) {
  try {
    const settings = await getSettings();
    // Only expose fields the storefront actually needs — not an admin dump
    return sendSuccess(res, 200, {
      settings: {
        storeName: settings.storeName,
        supportEmail: settings.supportEmail,
        supportPhone: settings.supportPhone,
        currency: settings.currency,
        socialLinks: settings.socialLinks,
        maintenanceMode: settings.maintenanceMode,
        maintenanceMessage: settings.maintenanceMode ? settings.maintenanceMessage : undefined,
        homepageAnnouncementBar: settings.homepageAnnouncementBar,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function getAdminSettings(req, res, next) {
  try {
    const settings = await getSettings();
    return sendSuccess(res, 200, { settings });
  } catch (err) {
    next(err);
  }
}

async function updateSettings(req, res, next) {
  try {
    const settings = await getSettings();

    const updatable = [
      'storeName',
      'supportEmail',
      'supportPhone',
      'taxRatePercent',
      'socialLinks',
      'maintenanceMode',
      'maintenanceMessage',
      'homepageAnnouncementBar',
    ];
    updatable.forEach((field) => {
      if (req.body[field] !== undefined) settings[field] = req.body[field];
    });
    settings.updatedBy = req.user._id;

    await settings.save();
    return sendSuccess(res, 200, { settings });
  } catch (err) {
    next(err);
  }
}

module.exports = { getPublicSettings, getAdminSettings, updateSettings };
