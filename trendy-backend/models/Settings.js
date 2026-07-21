const mongoose = require('mongoose');

const footerLinkSchema = new mongoose.Schema({
    text: { type: String, default: '' },
    url: { type: String, default: '' }
}, { _id: false });

const settingsSchema = new mongoose.Schema({
    // Website Identity
    storeName: { type: String, default: 'Trendy_Wardrobe' },
    tagline: { type: String, default: 'Luxury Fashion Redefined' },
    brandDescription: { type: String, default: '' },
    companyName: { type: String, default: 'Trendy Wardrobe Ltd' },
    copyright: { type: String, default: '© 2026 Trendy_Wardrobe' },
    businessRegistrationNumber: { type: String, default: '' },
    defaultLanguage: { type: String, default: 'en' },
    currency: { type: String, default: 'Ksh' },
    currencySymbol: { type: String, default: 'Ksh' },
    timezone: { type: String, default: 'Africa/Nairobi' },

    // Logos
    logo: { type: String, default: '' },
    logoDark: { type: String, default: '' },
    logoLight: { type: String, default: '' },
    secondaryLogo: { type: String, default: '' },
    mobileLogo: { type: String, default: '' },
    footerLogo: { type: String, default: '' },
    emailLogo: { type: String, default: '' },

    // Favicon
    favicon: { type: String, default: '' },
    appleTouchIcon: { type: String, default: '' },
    androidIcon: { type: String, default: '' },

    // Brand Colors
    primaryColor: { type: String, default: '#111827' },
    secondaryColor: { type: String, default: '#4B5563' },
    accentColor: { type: String, default: '#C8A35A' },
    backgroundColor: { type: String, default: '#F8F9FA' },
    textColor: { type: String, default: '#111827' },
    buttonColor: { type: String, default: '#111827' },
    successColor: { type: String, default: '#10B981' },
    warningColor: { type: String, default: '#F59E0B' },
    errorColor: { type: String, default: '#EF4444' },

    // Typography
    primaryFont: { type: String, default: 'Inter' },
    secondaryFont: { type: String, default: 'Poppins' },
    headingFont: { type: String, default: 'Poppins' },

    // Contact
    email: { type: String, default: '' },
    phone: { type: String, default: '' },
    whatsapp: { type: String, default: '' },
    address: { type: String, default: '' },
    businessHours: { type: String, default: '24/7' },
    mapsEmbedUrl: { type: String, default: '' },

    // Footer
    aboutText: { type: String, default: '' },
    quickLinks: [footerLinkSchema],
    customerServiceLinks: [footerLinkSchema],
    policies: [footerLinkSchema],
    newsletterText: { type: String, default: 'Subscribe for exclusive offers' },
    paymentIcons: { type: [String], default: [] },

    // SEO
    metaTitle: { type: String, default: '' },
    metaDescription: { type: String, default: '' },
    metaKeywords: { type: String, default: '' },
    ogImage: { type: String, default: '' },
    twitterCardImage: { type: String, default: '' },
    canonicalUrl: { type: String, default: '' },

    // Legacy / misc
    deliveryFee: { type: Number, default: 150 },
    freeDeliveryThreshold: { type: Number, default: 0 },
    paymentMethods: { type: [String], default: ['Cash on Delivery'] },
    heroImages: { type: [String], default: [] },
    menImage: { type: String, default: '' },
    womenImage: { type: String, default: '' },
    kidsImage: { type: String, default: '' },
    announcementText: { type: String, default: '' },
    announcementEnabled: { type: Boolean, default: false },
    googleAnalyticsId: { type: String, default: '' },
    timeZone: { type: String, default: 'Africa/Nairobi' },
    defaultCurrency: { type: String, default: 'KES' },
    defaultLanguage: { type: String, default: 'en' },
    dateFormat: { type: String, default: 'DD/MM/YYYY' },
    timeFormat: { type: String, default: '12h' },
    homepageLayout: { type: String, default: 'default' },
    productListingStyle: { type: String, default: 'grid' },
    defaultPagination: { type: Number, default: 12 },
    maintenanceBanner: { type: String, default: '' },
    announcementBarText: { type: String, default: '' },
    announcementBarEnabled: { type: Boolean, default: false },
    cookieNoticeEnabled: { type: Boolean, default: false },
    privacySettings: { type: mongoose.Schema.Types.Mixed, default: {} },
    smtpHost: { type: String, default: '' },
    smtpPort: { type: Number, default: 587 },
    smtpUsername: { type: String, default: '' },
    smtpPassword: { type: String, default: '' },
    smtpSenderName: { type: String, default: 'Trendy Wardrobe' },
    smtpSenderEmail: { type: String, default: 'noreply@trendywardrobe.com' },
    paymentMethods: { type: mongoose.Schema.Types.Mixed, default: {
        mpesa: { enabled: false }, stripe: { enabled: false, publishableKey: '', secretKey: '' },
        paypal: { enabled: false, clientId: '', secret: '' },
        visa: { enabled: false }, mastercard: { enabled: false },
        bankTransfer: { enabled: false, bankName: '', accountNumber: '', accountName: '' },
        cod: { enabled: true }
    } },
    shippingZones: { type: [mongoose.Schema.Types.Mixed], default: [] },
    deliveryFee: { type: Number, default: 150 },
    freeDeliveryThreshold: { type: Number, default: 0 },
    estimatedDeliveryDays: { type: Number, default: 3 },
    taxPercentage: { type: Number, default: 16 },
    taxRegions: { type: [mongoose.Schema.Types.Mixed], default: [] },
    taxInclusivePricing: { type: Boolean, default: false },
    currencies: { type: [String], default: ['KES', 'USD', 'EUR'] },
    measurementUnit: { type: String, default: 'metric' },
    backupHistory: { type: [mongoose.Schema.Types.Mixed], default: [] }
}, { timestamps: true });

module.exports = mongoose.model('Settings', settingsSchema);
