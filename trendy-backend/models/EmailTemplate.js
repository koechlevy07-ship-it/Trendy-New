const mongoose = require('mongoose');

const templateBlockSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: [
            'logo', 'hero', 'heading', 'product_grid', 'featured_products', 
            'cta', 'discount', 'coupon', 'newsletter_footer', 'social_links', 
            'contact', 'divider', 'spacer', 'text', 'image', 'button', 'html',
            'countdown', 'video', 'map', 'survey', 'poll'
        ],
        required: true
    },
    order: { type: Number, default: 0 },
    content: { type: mongoose.Schema.Types.Mixed, default: {} },
    settings: {
        backgroundColor: String,
        textColor: String,
        fontFamily: String,
        fontSize: Number,
        lineHeight: Number,
        fontWeight: { type: String, enum: ['normal', 'bold', 'lighter'] },
        textTransform: { type: String, enum: ['none', 'uppercase', 'lowercase', 'capitalize'] },
        letterSpacing: Number,
        padding: { top: Number, right: Number, bottom: Number, left: Number },
        margin: { top: Number, right: Number, bottom: Number, left: Number },
        borderRadius: Number,
        border: { width: Number, style: String, color: String },
        boxShadow: String,
        alignment: { type: String, enum: ['left', 'center', 'right'], default: 'left' },
        width: { type: String, default: '100%' },
        maxWidth: Number,
        mobileSettings: {
            stackColumns: Boolean,
            hideOnMobile: Boolean,
            fontSize: Number,
            padding: { top: Number, right: Number, bottom: Number, left: Number },
            alignment: { type: String, enum: ['left', 'center', 'right'] }
        },
        backgroundImage: String,
        backgroundSize: { type: String, enum: ['cover', 'contain', 'auto'] },
        backgroundPosition: { type: String, enum: ['center', 'top', 'bottom', 'left', 'right'] },
        backgroundRepeat: { type: String, enum: ['repeat', 'no-repeat', 'repeat-x', 'repeat-y'] }
    }
}, { _id: true });

const templateSettingsSchema = new mongoose.Schema({
    width: { type: Number, default: 600 },
    maxWidth: { type: Number, default: 600 },
    backgroundColor: { type: String, default: '#ffffff' },
    backgroundImage: String,
    fontFamily: { type: String, default: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" },
    fontSize: { type: Number, default: 16 },
    lineHeight: { type: Number, default: 1.5 },
    textColor: { type: String, default: '#111827' },
    linkColor: { type: String, default: '#C8A35A' },
    linkUnderline: { type: Boolean, default: true },
    headingFontFamily: String,
    headingColor: String,
    headingFontWeight: { type: String, enum: ['normal', 'bold', 'bolder', 'lighter'], default: 'bold' },
    headingLineHeight: { type: Number, default: 1.3 },
    buttonBorderRadius: { type: Number, default: 8 },
    buttonFontSize: { type: Number, default: 16 },
    buttonFontWeight: { type: String, enum: ['normal', 'bold', '500', '600'], default: '600' },
    buttonPadding: { vertical: { type: Number, default: 14 }, horizontal: { type: Number, default: 28 } },
    buttonAlignment: { type: String, enum: ['left', 'center', 'right'], default: 'center' },
    containerBackgroundColor: String,
    containerBorderRadius: { type: Number, default: 12 },
    containerBorder: { width: Number, style: String, color: String },
    containerShadow: String,
    preheaderText: String,
    viewInBrowserLink: { type: Boolean, default: true },
    unsubscribeLink: { type: Boolean, default: true },
    trackingEnabled: { type: Boolean, default: true },
    autoInlineCSS: { type: Boolean, default: true },
    removeComments: { type: Boolean, default: true },
    minifyHTML: { type: Boolean, default: false },
    rtl: { type: Boolean, default: false }
}, { _id: false });

const emailTemplateSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, maxlength: 100 },
    slug: { type: String, unique: true, lowercase: true, trim: true },
    description: { type: String, trim: true, maxlength: 500 },
    category: {
        type: String,
        enum: [
            'welcome', 'order_confirmation', 'shipping_update', 'delivery_confirmation',
            'password_reset', 'loyalty_reward', 'coupon_notification', 'newsletter',
            'cart_recovery', 'birthday', 'referral', 'post_purchase', 'review_request',
            'promotional', 'flash_sale', 'product_launch', 'back_in_stock', 'price_drop',
            'win_back', 're_engagement', 'educational', 'survey', 'transactional', 'custom'
        ],
        required: true
    },
    subcategory: String,
    
    // Template blocks (visual builder structure)
    blocks: [templateBlockSchema],
    settings: { type: templateSettingsSchema, default: () => ({}) },
    
    // Legacy support - HTML content
    html: String,
    text: String,
    subject: { type: String, default: '' },
    preheader: String,
    previewText: String,
    
    // Versioning
    version: { type: Number, default: 1 },
    versions: [{
        version: Number,
        html: String,
        text: String,
        subject: String,
        preheader: String,
        blocks: [templateBlockSchema],
        settings: templateSettingsSchema,
        createdAt: { type: Date, default: Date.now },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        changelog: String
    }],
    currentVersion: { type: Number, default: 1 },
    
    // Status
    status: {
        type: String,
        enum: ['draft', 'active', 'archived', 'deprecated'],
        default: 'draft'
    },
    isDefault: { type: Boolean, default: false },
    isSystem: { type: Boolean, default: false },
    isGlobal: { type: Boolean, default: false },
    
    // Usage tracking
    usageCount: { type: Number, default: 0 },
    campaignsUsed: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' }],
    lastUsedAt: Date,
    lastUsedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    
    // Variables and personalization
    variables: [{
        name: { type: String, required: true },
        label: String,
        type: { type: String, enum: ['string', 'number', 'date', 'boolean', 'url', 'image', 'color'], default: 'string' },
        defaultValue: mongoose.Schema.Types.Mixed,
        required: { type: Boolean, default: false },
        description: String,
        group: String,
        options: [String]
    }],
    requiredVariables: [String],
    
    // Testing
    testData: mongoose.Schema.Types.Mixed,
    testRecipients: [String],
    
    // Localization
    locales: [{
        locale: { type: String, required: true },
        subject: String,
        preheader: String,
        blocks: [templateBlockSchema],
        html: String,
        text: String
    }],
    defaultLocale: { type: String, default: 'en' },
    
    // Metadata
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: Date,
    tags: [{ type: String, trim: true }],
    notes: String,
    
    // Render settings
    renderEngine: { type: String, enum: ['mjml', 'handlebars', 'nunjucks', 'raw'], default: 'handlebars' },
    minifyOutput: { type: Boolean, default: true },
    inlineCSS: { type: Boolean, default: true },
    removeComments: { type: Boolean, default: true }
}, { timestamps: true });

emailTemplateSchema.index({ slug: 1 }, { unique: true });
emailTemplateSchema.index({ category: 1, status: 1 });
emailTemplateSchema.index({ createdBy: 1, createdAt: -1 });
emailTemplateSchema.index({ tags: 1, status: 1 });
emailTemplateSchema.index({ isDefault: 1, category: 1 });

emailTemplateSchema.pre('save', function(next) {
    if (this.isModified('name') && !this.slug) {
        this.slug = this.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    }
    if (this.isModified('html') || this.isModified('blocks')) {
        this.version += 1;
        if (!this.versions) this.versions = [];
        this.versions.push({
            version: this.version,
            html: this.html,
            text: this.text,
            subject: this.subject,
            preheader: this.preheader,
            blocks: this.blocks,
            settings: this.settings,
            createdAt: new Date(),
            createdBy: this.updatedBy || this.createdBy,
            changelog: this.isNew ? 'Initial version' : 'Updated'
        });
        this.currentVersion = this.version;
    }
    next();
});

// Static method to get template by slug with version
emailTemplateSchema.statics.getBySlug = async function(slug, version = null) {
    const query = { slug };
    if (version) {
        // Return specific version from versions array
        const template = await this.findOne({ slug });
        if (!template) return null;
        const v = template.versions.find(v => v.version === version);
        if (v) return { ...template.toObject(), ...v };
        return template;
    }
    return this.findOne({ slug });
};

// Method to create new version
emailTemplateSchema.methods.createVersion = function(changelog, userId) {
    this.versions.push({
        version: this.version + 1,
        html: this.html,
        text: this.text,
        subject: this.subject,
        preheader: this.preheader,
        blocks: this.blocks,
        settings: this.settings,
        createdAt: new Date(),
        createdBy: this.updatedBy,
        changelog
    });
    this.version += 1;
    this.currentVersion = this.version;
    return this.save();
};

// Method to rollback to previous version
emailTemplateSchema.methods.rollbackToVersion = function(version) {
    const v = this.versions.find(v => v.version === version);
    if (!v) throw new Error('Version not found');
    
    this.html = v.html;
    this.text = v.text;
    this.subject = v.subject;
    this.preheader = v.preheader;
    this.blocks = v.blocks;
    this.settings = v.settings;
    this.currentVersion = version;
    
    return this.save();
};

// Static method to get default template for category
emailTemplateSchema.statics.getDefaultForCategory = async function(category) {
    return this.findOne({ category, isDefault: true, status: 'active' });
};

// Static method to clone template
emailTemplateSchema.statics.cloneTemplate = async function(templateId, newName, userId) {
    const template = await this.findById(templateId);
    if (!template) throw new Error('Template not found');
    
    const clone = new this({
        ...template.toObject(),
        _id: undefined,
        name: newName,
        slug: undefined,
        version: 1,
        versions: [],
        currentVersion: 1,
        status: 'draft',
        isDefault: false,
        usageCount: 0,
        campaignsUsed: [],
        lastUsedAt: undefined,
        lastUsedBy: undefined,
        createdBy: userId,
        updatedBy: userId,
        createdAt: undefined,
        updatedAt: undefined
    });
    
    return clone.save();
};

module.exports = mongoose.model('EmailTemplate', emailTemplateSchema);