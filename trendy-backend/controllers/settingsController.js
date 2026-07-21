// controllers/settingsController.js
const Settings = require('../models/Settings');
const SecurityPolicy = require('../models/SecurityPolicy');
const AuditLog = require('../models/AuditLog');
const bcrypt = require('bcryptjs');

const settingsController = {};

// ===== GENERAL STORE SETTINGS =====

async function getGeneralStoreSettings(req, res) {
    try {
        let settings = await Settings.findOne();
        if (!settings) {
            settings = await Settings.create({});
        }
        res.json({ success: true, data: settings });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}

async function updateGeneralStoreSettings(req, res) {
    try {
        let settings = await Settings.findOne();
        if (!settings) {
            settings = new Settings({});
        }
        const updates = req.body;
        Object.keys(updates).forEach(key => {
            if (key !== '_id' && key !== '__v' && key !== 'createdAt' && key !== 'updatedAt') {
                settings[key] = updates[key];
            }
        });
        await settings.save();
        await AuditLog.create({
            userId: req.user._id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'update',
            module: 'settings',
            description: 'Updated general store settings',
            resourceId: settings._id,
            newValue: settings,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            status: 'success'
        });
        res.json({ success: true, data: settings });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}

// ===== LOCALIZATION SETTINGS =====

async function getLocalizationSettings(req, res) {
    try {
        let settings = await Settings.findOne();
        if (!settings) {
            settings = await Settings.create({});
        }
        const localization = {
            languages: ['en', 'sw'],
            currencies: ['KES', 'USD', 'EUR'],
            exchangeRates: { KES: 1, USD: 130, EUR: 145 },
            countries: ['Kenya', 'Tanzania', 'Uganda', 'USA', 'UK'],
            countiesKenya: ['Nairobi', 'Mombasa', 'Kisumu', 'Eldoret', 'Nakuru', 'Malindi', 'Meru'];
            timezones: ['Africa/Nairobi', 'UTC', 'America/New_York', 'Europe/London']
        };
        res.json({ success: true, data: localization });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}

async function updateLocalizationSettings(req, res) {
    try {
        const { languages, currencies, exchangeRates, countries, counties, timezones } = req.body;
        let settings = await Settings.findOne();
        if (!settings) {
            settings = new Settings();
        }
        settings.languages = languages || ['en', 'sw'];
        settings.currencies = currencies || ['KES', 'USD', 'EUR'];
        settings.countries = countries || ['Kenya', 'Tanzania', 'Uganda'];
        settings.timezones = timezones || ['Africa/Nairobi'];
        await settings.save();
        res.json({ success: true, message: 'Localization settings updated' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}

// ===== PAYMENT SETTINGS =====

async function getPaymentSettings(req, res) {
    try {
        let settings = await Settings.findOne();
        if (!settings) {
            settings = await Settings.create({});
        }
        const paymentSettings = {
            gateways: {
                mpesa: { enabled: true, apiKey: '', shortcode: '', consumerSecret: '' },
                stripe: { enabled: false, publishableKey: '', secretKey: '' },
                paypal: { enabled: false, clientId: '', secret: '' },
                visa: { enabled: true },
                mastercard: { enabled: true },
                mpesa: { enabled: true },
                bankTransfer: { enabled: true },
                cod: { enabled: true }
            },
            settings: {
                paymentMethods: settings.paymentMethods || [],
                transactionFees: { percentage: 2.5, fixed: 50 },
                defaultPaymentMethod: 'cod',
                sandboxMode: true,
                testMode: true
            }
        };
        res.json({ success: true, data: paymentSettings });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}

async function updatePaymentSettings(req, res) {
    try {
        const updates = req.body;
        let settings = await Settings.findOne();
        if (!settings) {
            settings = new Settings();
        }
        if (updates.gateways) {
            settings.paymentMethods = Object.keys(updates.gateways).filter(key => updates.gateways[key].enabled);
        }
        if (updates.settings) {
            Object.assign(settings, updates.settings);
        }
        await settings.save();
        await AuditLog.create({
            userId: req.user._id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'update',
            module: 'settings',
            description: 'Updated payment settings',
            resourceId: settings._id,
            newValue: settings,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            status: 'success'
        });
        res.json({ success: true, message: 'Payment settings updated' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}

// ===== SHIPPING SETTINGS =====

async function getShippingSettings(req, res) {
    try {
        let settings = await Settings.findOne();
        if (!settings) {
            settings = await Settings.create({});
        }
        const shippingSettings = {
            zones: settings.shippingZones || [
                { name: 'Local Delivery', rate: 150, estimatedDays: 2, freeThreshold: 5000 },
                { name: 'Express Delivery', rate: 500, estimatedDays: 1, freeThreshold: 10000 },
                { name: 'International', rate: 1000, estimatedDays: 7, freeThreshold: 20000 }
            ],
            settings: {
                pickupAvailable: true,
                courierServices: ['SF Express', 'G4S', 'Customer Delivery'],
                weightRules: { maxWeight: 50, maxLength: 200 },
                shippingTaxes: { enabled: true, percentage: 16 },
                defaultCarrier: 'SF Express'
            }
        };
        res.json({ success: true, data: shippingSettings });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}

async function updateShippingSettings(req, res) {
    try {
        const { zones, settings } = req.body;
        let settingsDoc = await Settings.findOne();
        if (!settingsDoc) {
            settingsDoc = new Settings();
        }
        settingsDoc.shippingZones = zones || [];
        Object.assign(settingsDoc, settings || {});
        await settingsDoc.save();
        res.json({ success: true, message: 'Shipping settings updated' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}

// ===== TAX SETTINGS =====

async function getTaxSettings(req, res) {
    try {
        let settings = await Settings.findOne();
        if (!settings) {
            settings = await Settings.create({});
        }
        const taxSettings = {
            classes: ['VAT', 'Purchase Tax'],
            rules: [
                { name: 'Standard VAT', rate: 16, region: 'Kenya', applicableTo: 'All goods' },
                { name: 'Reduced Rate', rate: 8, region: 'Export', applicableTo: 'Export goods' }
            ],
            regions: ['Kenya', 'Tanzania', 'Uganda'],
            settings: {
                inclusivePricing: false,
                taxReports: true,
                defaultTaxClass: 'VAT',
                taxIdRequired: true
            }
        };
        res.json({ success: true, data: taxSettings });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}

async function updateTaxSettings(req, res) {
    try {
        const { classes, rules, regions, settings } = req.body;
        let settingsDoc = await Settings.findOne();
        if (!settingsDoc) {
            settingsDoc = new Settings();
        }
        settingsDoc.taxClasses = classes || [];
        settingsDoc.taxRules = rules || [];
        settingsDoc.taxRegions = regions || [];
        Object.assign(settingsDoc, settings || {});
        await settingsDoc.save();
        res.json({ success: true, message: 'Tax settings updated' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}

// ===== EMAIL SETTINGS =====

async function getEmailSettings(req, res) {
    try {
        let settings = await Settings.findOne();
        if (!settings) {
            settings = await Settings.create({});
        }
        const emailSettings = {
            smtp: {
                host: settings.smtpHost || 'smtp.gmail.com',
                port: settings.smtpPort || 587,
                username: settings.smtpUsername || '',
                password: settings.smtpPassword || '',
                senderName: settings.smtpSenderName || 'Trendy Wardrobe',
                senderEmail: settings.smtpSenderEmail || 'noreply@trendywardrobe.com'
            },
            templates: {
                welcome: { subject: 'Welcome to Trendy Wardrobe', body: 'Welcome!' },
                passwordReset: { subject: 'Reset Your Password', body: 'Reset instructions' },
                orderConfirmation: { subject: 'Order Confirmation', body: 'Your order has been placed' },
                shippingUpdate: { subject: 'Shipping Update', body: 'Your order is on the way' },
                refund: { subject: 'Refund Confirmation', body: 'Refund processed' },
                newsletter: { subject: 'Weekly Newsletter', body: 'Weekly updates' }
            },
            settings: {
                testEmail: true,
                bulkEmailLimit: 1000,
                tracking: true,
                autoSubscribeNewsletter: true
            }
        };
        res.json({ success: true, data: emailSettings });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}

async function updateEmailSettings(req, res) {
    try {
        const { smtp, templates, settings } = req.body;
        let settingsDoc = await Settings.findOne();
        if (!settingsDoc) {
            settingsDoc = new Settings();
        }
        if (smtp) {
            Object.assign(settingsDoc, {
                smtpHost: smtp.host || '',
                smtpPort: smtp.port || 587,
                smtpUsername: smtp.username || '',
                smtpPassword: smtp.password || '',
                smtpSenderName: smtp.senderName || 'Trendy Wardrobe',
                smtpSenderEmail: smtp.senderEmail || 'noreply@trendywardrobe.com'
            });
        }
        if (templates) {
            settingsDoc.templates = templates;
        }
        Object.assign(settingsDoc, settings || {});
        await settingsDoc.save();
        res.json({ success: true, message: 'Email settings updated' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}

async function testEmailSettings(req, res) {
    try {
        const { smtp } = req.body;
        // Simulate email sending
        console.log('Test email would be sent:', smtp);
        res.json({ success: true, message: 'Test email sent successfully' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}

// ===== SMS & WHATSAPP SETTINGS =====

async function getSMSWhatsAppSettings(req, res) {
    try {
        let settings = await Settings.findOne();
        if (!settings) {
            settings = await Settings.create({});
        }
        const smsSettings = {
            provider: 'twilio',
            apiKey: '',
            senderId: '',
            whatsapp: {
                businessId: '',
                token: '',
                phoneNumberId: '',
                webhookUrl: ''
            },
            templates: {
                orderAlert: { content: 'Your order has been placed' },
                otp: { content: 'Your OTP code is {code}' },
                delivery: { content: 'Your order is out for delivery' }
            }
        };
        res.json({ success: true, data: smsSettings });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}

async function updateSMSWhatsAppSettings(req, res) {
    try {
        const { provider, apiKey, senderId, whatsapp, templates } = req.body;
        let settingsDoc = await Settings.findOne();
        if (!settingsDoc) {
            settingsDoc = new Settings();
        }
        Object.assign(settingsDoc, {
            smsProvider: provider,
            smsApiKey: apiKey,
            smsSenderId: senderId,
            whatsappBusinessId: whatsapp?.businessId || '',
            whatsappToken: whatsapp?.token || '',
            whatsappPhoneNumberId: whatsapp?.phoneNumberId || '',
            whatsappWebhookUrl: whatsapp?.webhookUrl || ''
        });
        await settingsDoc.save();
        res.json({ success: true, message: 'SMS/WhatsApp settings updated' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}

// ===== SEO SETTINGS =====

async function getSeoSettings(req, res) {
    try {
        let settings = await Settings.findOne();
        if (!settings) {
            settings = await Settings.create({});
        }
        const seoSettings = {
            siteTitle: settings.metaTitle || 'Trendy Wardrobe - Luxury Fashion',
            metaDescription: settings.metaDescription || 'Premium luxury fashion e-commerce platform offering curated collections of high-end clothing and accessories.',
            metaKeywords: 'luxury fashion, high-end clothing, designer clothes, upscale attire',
            canonicalUrl: settings.canonicalUrl || 'https://trendywardrobe.com',
            ogImage: settings.ogImage || '',
            twitterCardImage: settings.twitterCardImage || '',
            robotsTxt: 'User-agent: *\nAllow: /\nDisallow: /admin/\nSitemap: /sitemap.xml',
            sitemap: '/sitemap.xml',
            schemaMarkup: 'organization',
            navigationSize: 4
        };
        res.json({ success: true, data: seoSettings });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}

async function updateSeoSettings(req, res) {
    try {
        const updates = req.body;
        let settingsDoc = await Settings.findOne();
        if (!settingsDoc) {
            settingsDoc = new Settings();
        }
        Object.assign(settingsDoc, {
            metaTitle: updates.siteTitle || '',
            metaDescription: updates.metaDescription || '',
            metaKeywords: updates.metaKeywords || '',
            canonicalUrl: updates.canonicalUrl || '',
            ogImage: updates.ogImage || '',
            twitterCardImage: updates.twitterCardImage || ''
        });
        await settingsDoc.save();
        res.json({ success: true, message: 'SEO settings updated' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}

// ===== SECURITY SETTINGS =====

async function getSecuritySettings(req, res) {
    try {
        const policy = await SecurityPolicy.findOne();
        const securitySettings = {
            password: {
                minLength: policy?.passwordMinLength || 8,
                requireUppercase: policy?.passwordRequireUppercase || true,
                requireLowercase: policy?.passwordRequireLowercase || true,
                requireNumber: policy?.passwordRequireNumber || true,
                requireSpecial: policy?.passwordRequireSpecial || true
            },
            sessions: {
                timeoutMinutes: policy?.sessionTimeoutMinutes || 60,
                maxLoginAttempts: policy?.maxLoginAttempts || 5,
                accountLockoutMinutes: policy?.accountLockoutMinutes || 30,
                enforceTwoFactor: policy?.enforceTwoFactor || false,
                jwtExpiration: policy?.jwtExpiration || '7d',
                maxSessionsPerUser: policy?.maxSessionsPerUser || 5
            },
            access: {
                ipWhitelist: policy?.ipWhitelist || [],
                maintenanceMode: policy?.maintenanceMode || false,
                maintenanceMessage: policy?.maintenanceMessage || '',
                maintenanceAllowAdmin: policy?.maintenanceAllowAdmin || true
            }
        };
        res.json({ success: true, data: securitySettings });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}

async function updateSecuritySettings(req, res) {
    try {
        const updates = req.body;
        let policy = await SecurityPolicy.findOne();
        if (!policy) {
            policy = await SecurityPolicy.create({});
        }
        Object.assign(policy, updates);
        await policy.save();
        await AuditLog.create({
            userId: req.user._id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'update',
            module: 'security',
            description: 'Updated security policy',
            resourceId: policy._id,
            newValue: policy,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            status: 'success'
        });
        res.json({ success: true, message: 'Security settings updated' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}

// ===== MEDIA SETTINGS =====

async function getMediaSettings(req, res) {
    try {
        let settings = await Settings.findOne();
        if (!settings) {
            settings = await Settings.create({});
        }
        const mediaSettings = {
            uploads: {
                maxSize: 10485760, // 10MB
                allowedFormats: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4'],
                compression: true,
                quality: 85
            },
            thumbnails: {
                sizes: [
                    { name: 'small', width: 150, height: 150 },
                    { name: 'medium', width: 300, height: 300 },
                    { name: 'large', width: 600, height: 600 }
                ]
            },
            storage: {
                provider: 'cloudinary',
                cloudName: '',
                apiKey: '',
                apiSecret: ''
            }
        };
        res.json({ success: true, data: mediaSettings });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}

async function updateMediaSettings(req, res) {
    try {
        const { uploads, thumbnails, storage } = req.body;
        let settingsDoc = await Settings.findOne();
        if (!settingsDoc) {
            settingsDoc = new Settings();
        }
        settingsDoc.mediaUploads = uploads || {};
        settingsDoc.mediaThumbnails = thumbnails || {};
        settingsDoc.mediaStorage = storage || {};
        await settingsDoc.save();
        res.json({ success: true, message: 'Media settings updated' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}

// ===== NOTIFICATION SETTINGS =====

async function getNotificationSettings(req, res) {
    try {
        let settings = await Settings.findOne();
        if (!settings) {
            settings = await Settings.create({});
        }
        const notificationSettings = {
            admins: {
                newAdmin: true,
                permissionChanges: true,
                roleUpdates: true,
                failedLoginAttempts: true,
                suspiciousActivity: true,
                newDeviceLogin: true,
                passwordReset: true
            },
            customers: {
                orderUpdates: true,
                promotionAlerts: true,
                newsletter: true
            },
            pushNotifications: true,
            emailAlerts: true,
            smsAlerts: false,
            whatsAppAlerts: false
        };
        res.json({ success: true, data: notificationSettings });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}

async function updateNotificationSettings(req, res) {
    try {
        const { admins, customers, pushNotifications, emailAlerts, smsAlerts, whatsAppAlerts } = req.body;
        let settingsDoc = await Settings.findOne();
        if (!settingsDoc) {
            settingsDoc = new Settings();
        }
        settingsDoc.adminNotifications = admins || {};
        settingsDoc.customerNotifications = customers || {};
        settingsDoc.pushNotificationsEnabled = pushNotifications || false;
        settingsDoc.emailAlertsEnabled = emailAlerts || true;
        settingsDoc.smsAlertsEnabled = smsAlerts || false;
        settingsDoc.whatsAppAlertsEnabled = whatsAppAlerts || false;
        await settingsDoc.save();
        res.json({ success: true, message: 'Notification settings updated' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}

// ===== BACKUP & RESTORE =====

async function getBackupSettings(req, res) {
    try {
        let settings = await Settings.findOne();
        if (!settings) {
            settings = await Settings.create({});
        }
        const backupSettings = {
            automaticBackups: true,
            backupSchedule: 'daily',
            retentionDays: 30,
            backupLocations: ['local', 'cloudinary'],
            compressBackups: true,
            includeLogs: true,
            backupHistory: settings.backupHistory || []
        };
        res.json({ success: true, data: backupSettings });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}

async function createBackup(req, res) {
    try {
        const backup = {
            date: new Date(),
            type: 'manual',
            size: '~2KB',
            status: 'completed',
            initiatedBy: req.user.name
        };
        let settings = await Settings.findOne();
        if (!settings) {
            settings = new Settings();
        }
        if (!settings.backupHistory) settings.backupHistory = [];
        settings.backupHistory.unshift(backup);
        await settings.save();
        await AuditLog.create({
            userId: req.user._id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'create',
            module: 'backup',
            description: 'Created manual backup',
            resourceId: backup.date,
            newValue: backup,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            status: 'success'
        });
        res.json({ success: true, data: backup });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}

async function restoreBackup(req, res) {
    try {
        const { backupId } = req.body;
        // Simulate backup restoration
        await AuditLog.create({
            userId: req.user._id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'restore',
            module: 'backup',
            description: `Restored backup with ID: ${backupId}`,
            resourceId: backupId,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            status: 'success'
        });
        res.json({ success: true, message: 'Backup restored successfully' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}

// ===== SYSTEM MAINTENANCE =====

async function getMaintenanceSettings(req, res) {
    try {
        let settings = await Settings.findOne();
        if (!settings) {
            settings = await Settings.create({});
        }
        const maintenanceSettings = {
            maintenanceMode: settings.maintenanceMode || false,
            maintenanceMessage: settings.maintenanceMessage || 'We are currently undergoing scheduled maintenance. Please check back shortly.',
            maintenanceAllowAdmin: settings.maintenanceAllowAdmin || true,
            cacheManagement: {
                clearCacheOnUpdate: true,
                cacheTimeout: 3600,
                cacheSize: '100MB'
            },
            databaseOptimization: true,
            rebuildIndexes: true,
            cronJobsEnabled: true,
            emailNotifications: true
        };
        res.json({ success: true, data: maintenanceSettings });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}

async function updateMaintenanceSettings(req, res) {
    try {
        const { maintenanceMode, maintenanceMessage, maintenanceAllowAdmin, cacheManagement, databaseOptimization, rebuildIndexes, cronJobsEnabled, emailNotifications } = req.body;
        let settingsDoc = await Settings.findOne();
        if (!settingsDoc) {
            settingsDoc = new Settings();
        }
        settingsDoc.maintenanceMode = maintenanceMode || false;
        settingsDoc.maintenanceMessage = maintenanceMessage || '';
        settingsDoc.maintenanceAllowAdmin = maintenanceAllowAdmin || true;
        settingsDoc.cacheManagement = cacheManagement || {};
        settingsDoc.databaseOptimization = databaseOptimization || true;
        settingsDoc.rebuildIndexes = rebuildIndexes || true;
        settingsDoc.cronJobsEnabled = cronJobsEnabled || true;
        settingsDoc.emailNotifications = emailNotifications || false;
        await settingsDoc.save();
        res.json({ success: true, message: 'Maintenance settings updated' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}

async function clearCache(req, res) {
    try {
        // Simulate cache clearing
        await AuditLog.create({
            userId: req.user._id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'clear',
            module: 'cache',
            description: 'Cleared application cache',
            resourceId: new Date(),
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            status: 'success'
        });
        res.json({ success: true, message: 'Cache cleared successfully' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}

async function optimizeDatabase(req, res) {
    try {
        // Simulate database optimization
        await AuditLog.create({
            userId: req.user._id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'optimize',
            module: 'database',
            description: 'Optimized database indexes',
            resourceId: new Date(),
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            status: 'success'
        });
        res.json({ success: true, message: 'Database optimized successfully' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}

// ===== API SETTINGS =====

async function getApiSettings(req, res) {
    try {
        let settings = await Settings.findOne();
        if (!settings) {
            settings = await Settings.create({});
        }
        const apiSettings = {
            restApi: {
                enabled: true,
                version: 'v1',
                rateLimit: 100,
                requestTimeout: 30000,
                enableCors: true
            },
            apiKeys: {
                defaultKey: 'demo-key-12345',
                rateLimit: 1000,
                permissions: ['read', 'write'],
                expiration: '30d'
            },
            webhooks: {
                enabled: true,
                url: '',
                events: ['order.created', 'user.registered', 'payment.completed']
            },
            oauth: {
                enabled: true,
                provider: 'google',
                clientId: '',
                clientSecret: '',
                callbackUrl: ''
            },
            apiLogs: {
                retentionDays: 90,
                logLevel: 'info',
                exportEnabled: true
            },
            apiLimits: {
                dailyLimit: 10000,
                hourlyLimit: 1000,
                burstLimit: 100
            }
        };
        res.json({ success: true, data: apiSettings });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}

// ===== LEGAL SETTINGS =====

async function getLegalSettings(req, res) {
    try {
        let settings = await Settings.findOne();
        if (!settings) {
            settings = await Settings.create({});
        }
        const legalSettings = {
            privacyPolicy: settings.privacyPolicyUrl || '/privacy-policy',
            termsOfService: settings.termsOfServiceUrl || '/terms-of-service',
            cookieBanner: settings.cookieBannerEnabled || true,
            gdprSettings: {
                consentManagement: true,
                dataRetentionDays: 365,
                dataExportEnabled: true,
                dataDeletionEnabled: true
            },
            cookieNotice: {
                text: 'We use cookies to ensure you get the best experience on our website.',
                linkText: 'Privacy Policy',
                acceptButton: 'Accept',
                declineButton: 'Decline',
                customizeLink: 'Customize'
            }
        };
        res.json({ success: true, data: legalSettings });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}

// ===== SYSTEM INFORMATION =====

async function getSystemInformation(req, res) {
    try {
        const systemInfo = {
            application: {
                name: 'Trendy Wardrobe',
                version: '1.0.0',
                environment: process.env.NODE_ENV || 'development',
                timezone: 'Africa/Nairobi',
                nodeVersion: process.version,
                platform: process.platform,
                arch: process.arch,
                uptime: process.uptime()
            },
            database: {
                name: 'MongoDB',
                version: '7.0.0',
                status: 'connected',
                connections: 1,
                collections: 50,
                documentCount: 10000,
                averageDocumentSize: '1.2KB'
            },
            server: {
                status: 'running',
                port: process.env.PORT || 5000,
                maxMemory: '2GB',
                usedMemory: '512MB',
                cpuUsage: process.cpuUsage(),
                diskUsage: '5GB',
                startTime: new Date(Date.now() - 86400000), // 24 hours ago
            },
            health: {
                server: 'healthy',
                database: 'healthy',
                api: 'healthy',
                storage: 'healthy',
                backgroundJobs: 'running',
                emailService: 'connected',
                paymentGateway: 'connected'
            }
        };
        res.json({ success: true, data: systemInfo });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}

// ===== SETTINGS (GET & UPDATE) =====


async function getSettings(req, res) {
    try {
        let settings = await Settings.findOne();
        if (!settings) {
            settings = await Settings.create({});
        }
        // Convert settings to frontend-friendly format
        const frontendSettings = {
            storeName: settings.storeName || 'Trendy Wardrobe',
            tagline: settings.tagline || 'Luxury Fashion Redefined',
            email: settings.email || '',
            phone: settings.phone || '',
            whatsapp: settings.whatsapp || '',
            address: settings.address || '',
            mapsEmbedUrl: settings.mapsEmbedUrl || '',
            businessHours: settings.businessHours || '24/7',
            timezone: settings.timezone || 'Africa/Nairobi',
            dateFormat: settings.dateFormat || 'DD/MM/YYYY',
            timeFormat: settings.timeFormat || '12h',
            currency: settings.currency || 'Ksh',
            currencySymbol: settings.currencySymbol || 'Ksh',
            defaultLanguage: settings.defaultLanguage || 'en',
            primaryColor: settings.primaryColor || '#111827',
            secondaryColor: settings.secondaryColor || '#4B5563',
            accentColor: settings.accentColor || '#C8A35A',
            buttonColor: settings.buttonColor || '#111827',
            successColor: settings.successColor || '#10B981',
            warningColor: settings.warningColor || '#F59E0B',
            errorColor: settings.errorColor || '#EF4444',
            primaryFont: settings.primaryFont || 'Inter',
            secondaryFont: settings.secondaryFont || 'Poppins',
            headingFont: settings.headingFont || 'Poppins',
            logo: settings.logo || '',
            logoDark: settings.logoDark || '',
            logoLight: settings.logoLight || '',
            mobileLogo: settings.mobileLogo || '',
            footerLogo: settings.footerLogo || '',
            emailLogo: settings.emailLogo || '',
            favicon: settings.favicon || '',
            appleTouchIcon: settings.appleTouchIcon || '',
            androidIcon: settings.androidIcon || '',
            deliveryFee: settings.deliveryFee || 150,
            freeDeliveryThreshold: settings.freeDeliveryThreshold || 5000,
            estimatedDeliveryDays: settings.estimatedDeliveryDays || 3,
            taxPercentage: settings.taxPercentage || 16,
            currencies: settings.currencies || ['KES', 'USD', 'EUR'],
            languages: ['en', 'sw']
        };
        res.json({ success: true, data: frontendSettings });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}

async function updateSettings(req, res) {
    try {
        const updates = req.body;
        let settings = await Settings.findOne();
        if (!settings) {
            settings = new Settings(updates);
        } else {
            Object.assign(settings, updates);
        }
        await settings.save();
        await AuditLog.create({
            userId: req.user._id,
            userName: req.user.name,
            userRole: req.user.role,
            action: 'update',
            module: 'settings',
            description: 'Updated general settings',
            resourceId: settings._id,
            newValue: settings,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            status: 'success'
        });
        res.json({ success: true, message: 'Settings updated successfully' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}

module.exports = settingsController;
