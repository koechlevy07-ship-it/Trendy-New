const mongoose = require('mongoose');

const checkoutItemSchema = new mongoose.Schema({
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    originalPrice: Number,
    quantity: { type: Number, required: true, min: 1, default: 1 },
    size: { type: String, default: '' },
    color: { type: String, default: '' },
    image: { type: String, default: '' },
    sku: String,
    category: String,
    brand: String,
    lineTotal: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    originalPrice: Number,
    deliveryEstimate: String
}, { _id: true });

const checkoutAddressSchema = new mongoose.Schema({
    label: { type: String, default: 'Shipping' },
    fullName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    county: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    street: { type: String, required: true, trim: true },
    apartment: { type: String, default: '', trim: true },
    postalCode: { type: String, default: '', trim: true },
    country: { type: String, default: 'Kenya', trim: true },
    deliveryInstructions: { type: String, default: '', trim: true },
    isDefault: { type: Boolean, default: false }
}, { _id: true });

const deliveryMethodSchema = new mongoose.Schema({
    type: { type: String, enum: ['standard', 'express', 'same-day', 'pickup', 'scheduled'], required: true },
    label: { type: String, required: true },
    fee: { type: Number, required: true, min: 0, default: 0 },
    estimatedDays: { type: String, required: true },
    provider: { type: String, default: '' },
    trackingAvailable: { type: Boolean, default: false },
    minOrderValue: { type: Number, default: 0 },
    maxOrderValue: { type: Number, default: 0 },
    availableRegions: [String],
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 }
}, { _id: false });

const paymentMethodConfigSchema = new mongoose.Schema({
    type: { type: String, enum: ['mpesa', 'stripe', 'paypal', 'visa', 'mastercard', 'apple-pay', 'google-pay', 'bank-transfer', 'cash-on-delivery', 'bank-transfer'], required: true },
    label: { type: String, required: true },
    isEnabled: { type: Boolean, default: true },
    isDefault: { type: Boolean, default: false },
    config: mongoose.Schema.Types.Mixed, // Gateway-specific config
    fees: {
        fixed: { type: Number, default: 0 },
        percentage: { type: Number, default: 0 },
        minAmount: { type: Number, default: 0 },
        maxAmount: { type: Number, default: 0 }
    },
    supportedCurrencies: [String],
    supportedCountries: [String],
    minAmount: { type: Number, default: 0 },
    maxAmount: { type: Number, default: 1000000 },
    sortOrder: { type: Number, default: 0 },
    displayIcon: String,
    displayColor: String,
    requiresRedirect: { type: Boolean, default: false },
    supportsRefunds: { type: Boolean, default: true },
    supportsPartialRefunds: { type: Boolean, default: true },
    processingTime: String, // e.g., "Instant", "1-2 business days"
    requirements: [String] // e.g., ["Phone number required", "Safaricom SIM required"]
}, { _id: false });

const paymentTransactionSchema = new mongoose.Schema({
    checkoutSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'CheckoutSession' },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    transactionId: { type: String, required: true, unique: true }, // External gateway transaction ID
    paymentRef: String, // Internal reference
    provider: { type: String, required: true }, // mpesa, stripe, paypal, etc.
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'KES' },
    status: {
        type: String,
        enum: ['initiated', 'pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded', 'partially_refunded', 'expired'],
        default: 'initiated'
    },
    paymentMethod: {
        type: String,
        enum: ['mpesa', 'stripe', 'paypal', 'visa', 'mastercard', 'apple-pay', 'google-pay', 'bank-transfer', 'cash-on-delivery', 'bank-transfer'],
        required: true
    },
    gatewayResponse: mongoose.Schema.Types.Mixed, // Full gateway response
    gatewayError: String,
    fees: {
        gatewayFee: { type: Number, default: 0 },
        platformFee: { type: Number, default: 0 },
        totalFees: { type: Number, default: 0 }
    },
    netAmount: { type: Number, default: 0 }, // Amount after fees
    metadata: mongoose.Schema.Types.Mixed,
    initiatedAt: { type: Date, default: Date.now },
    completedAt: Date,
    failedAt: Date,
    expiresAt: Date,
    retryCount: { type: Number, default: 0 },
    maxRetries: { type: Number, default: 3 },
    callbackUrl: String,
    returnUrl: String,
    cancelUrl: String,
    ipAddress: String,
    userAgent: String,
    deviceFingerprint: String
}, { timestamps: true });

paymentTransactionSchema.index({ checkoutSessionId: 1 });
paymentTransactionSchema.index({ orderId: 1 });
paymentTransactionSchema.index({ transactionId: 1 });
paymentTransactionSchema.index({ userId: 1, createdAt: -1 });
paymentTransactionSchema.index({ status: 1, createdAt: -1 });
paymentTransactionSchema.index({ provider: 1, status: 1 });

const checkoutSessionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    guestId: { type: String, index: true }, // For guest checkouts
    sessionToken: { type: String, unique: true, index: true },
    status: {
        type: String,
        enum: ['active', 'expired', 'completed', 'abandoned', 'payment_pending', 'payment_failed', 'completed'],
        default: 'active'
    },
    step: {
        type: Number,
        enum: [1, 2, 3, 4, 5, 6, 7],
        default: 1
    },
    items: [checkoutItemSchema],
    shippingAddress: checkoutAddressSchema,
    billingAddress: checkoutAddressSchema,
    deliveryMethod: deliveryMethodSchema,
    paymentMethod: paymentMethodConfigSchema,
    couponCode: { type: String, default: '' },
    couponDiscount: { type: Number, default: 0 },
    subtotal: { type: Number, default: 0, min: 0 },
    deliveryFee: { type: Number, default: 0, min: 0 },
    tax: { type: Number, default: 0, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    total: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: 'KES' },
    paymentStatus: {
        type: String,
        enum: ['pending', 'processing', 'completed', 'failed', 'refunded', 'partially_refunded'],
        default: 'pending'
    },
    paymentTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentTransaction' },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    shippingMethods: [deliveryMethodSchema],
    paymentMethods: [paymentMethodConfigSchema],
    appliedCoupon: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon' },
    appliedCouponCode: String,
    appliedCouponDiscount: { type: Number, default: 0 },
    estimatedTax: { type: Number, default: 0 },
    estimatedDeliveryDate: Date,
    notes: String,
    customerNotes: String,
    internalNotes: String,
    metadata: {
        userAgent: String,
        ipAddress: String,
        referrer: String,
        utmSource: String,
        utmMedium: String,
        utmCampaign: String,
        utmTerm: String,
        utmContent: String,
        deviceFingerprint: String,
        locale: String,
        timezone: String
    },
    abandonedAt: Date,
    completedAt: Date,
    expiresAt: Date,
    recoveryEmailsSent: { type: Number, default: 0 },
    lastRecoveryEmailAt: Date,
    recoveryCouponCode: String,
    recoveryCouponDiscount: { type: Number, default: 0 }
}, { timestamps: true });

checkoutSessionSchema.index({ userId: 1, status: 1 });
checkoutSessionSchema.index({ sessionToken: 1 });
checkoutSessionSchema.index({ guestId: 1, status: 1 });
checkoutSessionSchema.index({ status: 1, createdAt: -1 });
checkoutSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const invoiceSchema = new mongoose.Schema({
    invoiceNumber: { type: String, required: true, unique: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
        type: String,
        enum: ['draft', 'pending', 'issued', 'paid', 'cancelled', 'voided'],
        default: 'draft'
    },
    invoiceDate: { type: Date, default: Date.now },
    dueDate: Date,
    paidDate: Date,
    currency: { type: String, default: 'KES' },
    subtotal: { type: Number, required: true, min: 0 },
    tax: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    deliveryFee: { type: Number, default: 0 },
    total: { type: Number, required: true, min: 0 },
    paidAmount: { type: Number, default: 0 },
    balanceDue: { type: Number, default: 0 },
    items: [{
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        name: String,
        quantity: { type: Number, required: true, min: 1 },
        unitPrice: { type: Number, required: true, min: 0 },
        originalPrice: Number,
        discount: { type: Number, default: 0 },
        taxRate: { type: Number, default: 0 },
        taxAmount: { type: Number, default: 0 },
        lineTotal: { type: Number, required: true, min: 0 },
        sku: String,
        category: String
    }],
    billingAddress: {
        fullName: String,
        email: String,
        phone: String,
        address: String,
        city: String,
        county: String,
        postalCode: String,
        country: String
    },
    shippingAddress: {
        fullName: String,
        phone: String,
        email: String,
        county: String,
        city: String,
        street: String,
        apartment: String,
        postalCode: String,
        country: String
    },
    paymentMethod: String,
    paymentReference: String,
    paymentStatus: { type: String, enum: ['pending', 'completed', 'failed', 'refunded'], default: 'pending' },
    notes: String,
    termsAndConditions: String,
    footerText: String,
    pdfUrl: String,
    pdfGeneratedAt: Date,
    sentAt: Date,
    sentTo: [String],
    sentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    viewedAt: Date,
    downloadedAt: Date,
    printedAt: Date,
    remindersSent: { type: Number, default: 0 },
    lastReminderAt: Date,
    voidReason: String,
    voidedAt: Date,
    voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

invoiceSchema.index({ invoiceNumber: 1 });
invoiceSchema.index({ orderId: 1 });
invoiceSchema.index({ userId: 1, createdAt: -1 });
invoiceSchema.index({ status: 1, createdAt: -1 });

const shippingMethodSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, trim: true },
    description: String,
    type: { type: String, enum: ['standard', 'express', 'same-day', 'pickup', 'scheduled'], default: 'standard' },
    provider: { type: String, trim: true },
    courier: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    isDefault: { type: Boolean, default: false },
    freeShippingThreshold: { type: Number, default: 0 },
    baseFee: { type: Number, required: true, min: 0 },
    perKgFee: { type: Number, default: 0, min: 0 },
    perItemFee: { type: Number, default: 0, min: 0 },
    minWeight: { type: Number, default: 0 },
    maxWeight: { type: Number, default: 100 },
    minDimensions: { length: Number, width: Number, height: Number },
    maxDimensions: { length: Number, width: Number, height: Number },
    zones: [{
        name: String,
        counties: [String],
        cities: [String],
        fee: { type: Number, default: 0 },
        estimatedDays: String,
        isActive: { type: Boolean, default: true }
    }],
    estimatedDays: { type: String, default: '3-7 business days' },
    minOrderValue: { type: Number, default: 0 },
    maxOrderValue: Number,
    supportsTracking: { type: Boolean, default: false },
    supportsCOD: { type: Boolean, default: false },
    supportsInsurance: { type: Boolean, default: false },
    insuranceFeePercent: { type: Number, default: 0 },
    maxInsuranceValue: Number,
    sortOrder: { type: Number, default: 0 },
    restrictions: [String],
    metadata: mongoose.Schema.Types.Mixed
}, { timestamps: true });

const deliveryEstimateSchema = new mongoose.Schema({
    shippingMethodId: { type: mongoose.Schema.Types.ObjectId, ref: 'ShippingMethod', required: true },
    fromLocation: {
        country: String,
        county: String,
        city: String,
        postalCode: String
    },
    toLocation: {
        country: String,
        county: String,
        city: String,
        postalCode: String
    },
    estimatedDays: { type: Number, required: true },
    minDays: { type: Number, default: 1 },
    maxDays: { type: Number, default: 7 },
    businessDaysOnly: { type: Boolean, default: true },
    cutoffTime: { type: String, default: '14:00' }, // Orders before this time ship same day
    excludesWeekends: { type: Boolean, default: true },
    excludesHolidays: { type: Boolean, default: true },
    holidays: [Date],
    isActive: { type: Boolean, default: true },
    confidence: { type: Number, default: 90 }, // Percentage confidence in estimate
    notes: String
}, { timestamps: true });

const fraudCheckSchema = new mongoose.Schema({
    checkoutSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'CheckoutSession' },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    paymentTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentTransaction' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    checkType: {
        type: String,
        enum: ['velocity', 'amount', 'location', 'device', 'email', 'phone', 'card', 'behavior', 'custom'],
        required: true
    },
    riskLevel: { type: String, enum: ['low', 'medium', 'high', 'critical'], required: true },
    score: { type: Number, required: true, min: 0, max: 100 },
    triggered: { type: Boolean, default: true },
    action: { type: String, enum: ['allow', 'review', 'block', 'challenge', 'flag'], default: 'review' },
    details: mongoose.Schema.Types.Mixed,
    rules: [{
        ruleId: String,
        ruleName: String,
        triggered: Boolean,
        score: Number,
        action: String
    }],
    ipAddress: String,
    deviceFingerprint: String,
    userAgent: String,
    location: {
        country: String,
        city: String,
        ip: String,
        isProxy: Boolean,
        isVPN: Boolean,
        isTor: Boolean
    },
    device: {
        type: String,
        os: String,
        browser: String,
        isMobile: Boolean,
        isBot: Boolean
    },
    email: {
        isDisposable: Boolean,
        domainAge: Number,
        isFreeProvider: Boolean
    },
    phone: {
        isValid: Boolean,
        carrier: String,
        country: String,
        isVoIP: Boolean
    },
    card: {
        brand: String,
        bin: String,
        country: String,
        isPrepaid: Boolean,
        isVirtual: Boolean
    },
    behavior: {
        sessionDuration: Number,
        pagesVisited: Number,
        mouseMovements: Number,
        keystrokes: Number,
        copyPasteDetected: Boolean,
        autofillDetected: Boolean
    },
    reviewed: { type: Boolean, default: false },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
    reviewNotes: String,
    finalDecision: { type: String, enum: ['approved', 'declined', 'escalated'] }
}, { timestamps: true });

fraudCheckSchema.index({ checkoutSessionId: 1 });
fraudCheckSchema.index({ orderId: 1 });
fraudCheckSchema.index({ paymentTransactionId: 1 });
fraudCheckSchema.index({ userId: 1, createdAt: -1 });
fraudCheckSchema.index({ riskLevel: 1, createdAt: -1 });
fraudCheckSchema.index({ status: 1, createdAt: -1 });

const checkoutAnalyticsSchema = new mongoose.Schema({
    date: { type: Date, required: true },
    totalCheckouts: { type: Number, default: 0 },
    completedCheckouts: { type: Number, default: 0 },
    abandonedCheckouts: { type: Number, default: 0 },
    conversionRate: { type: Number, default: 0 },
    totalRevenue: { type: Number, default: 0 },
    averageOrderValue: { type: Number, default: 0 },
    averageItemsPerOrder: { type: Number, default: 0 },
    byStep: {
        step1_started: Number,
        step1_completed: Number,
        step2_started: Number,
        step2_completed: Number,
        step3_started: Number,
        step3_completed: Number,
        step4_started: Number,
        step4_completed: Number,
        step5_started: Number,
        step5_completed: Number,
        step6_started: Number,
        step6_completed: Number,
        step7_started: Number,
        step7_completed: Number
    },
    byDevice: {
        desktop: { started: Number, completed: Number },
        mobile: { started: Number, completed: Number },
        tablet: { started: Number, completed: Number }
    },
    byBrowser: { chrome: Number, safari: Number, firefox: Number, edge: Number, other: Number },
    byOS: { windows: Number, macos: Number, ios: Number, android: Number, linux: Number, other: Number },
    byPaymentMethod: {
        mpesa: { started: Number, completed: Number, failed: Number },
        stripe: { started: Number, completed: Number, failed: Number },
        paypal: { started: Number, completed: Number, failed: Number },
        card: { started: Number, completed: Number, failed: Number },
        cash_on_delivery: { started: Number, completed: Number, failed: Number }
    },
    byDeliveryMethod: {
        standard: { started: Number, completed: Number },
        express: { started: Number, completed: Number },
        'same-day': { started: Number, completed: Number },
        pickup: { started: Number, completed: Number }
    },
    byPaymentGateway: {
        mpesa: { started: Number, completed: Number, failed: Number, avgTime: Number },
        stripe: { started: Number, completed: Number, failed: Number, avgTime: Number },
        paypal: { started: Number, completed: Number, failed: Number, avgTime: Number },
        paypal: { started: Number, completed: Number, failed: Number, avgTime: Number }
    },
    abandonmentReasons: {
        shipping_cost: Number,
        payment_issues: Number,
        account_creation: Number,
        price_comparison: Number,
        technical_issues: Number,
        changed_mind: Number,
        other: Number
    },
    couponUsage: {
        applied: Number,
        valid: Number,
        invalid: Number,
        expired: Number
    },
    cartValues: {
        avgSubtotal: Number,
        avgTotal: Number,
        avgItems: Number,
        minValue: Number,
        maxValue: Number
    },
    recoveryEmailsSent: Number,
    recoveryEmailsOpened: Number,
    recoveryEmailsClicked: Number,
    recoveredCheckouts: Number,
    recoveryRevenue: Number
}, { timestamps: true });

checkoutAnalyticsSchema.index({ date: -1 }, { unique: true });

const savedAddressSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    label: { type: String, required: true, trim: true, maxlength: 50 },
    address: checkoutAddressSchema,
    isDefaultShipping: { type: Boolean, default: false },
    isDefaultBilling: { type: Boolean, default: false },
    usageCount: { type: Number, default: 0 },
    lastUsedAt: Date,
    verificationStatus: { type: String, enum: ['unverified', 'pending', 'verified', 'failed'], default: 'unverified' },
    verifiedAt: Date,
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

savedAddressSchema.index({ userId: 1, isDefaultShipping: 1 });
savedAddressSchema.index({ userId: 1, isDefaultBilling: 1 });

const paymentMethodSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['mpesa', 'stripe', 'paypal', 'visa', 'mastercard', 'apple-pay', 'google-pay', 'bank-transfer', 'cash-on-delivery', 'bank-transfer'], required: true },
    label: { type: String, required: true, trim: true },
    isDefault: { type: Boolean, default: false },
    isVerified: { type: Boolean, default: false },
    lastUsedAt: Date,
    usageCount: { type: Number, default: 0 },
    details: mongoose.Schema.Types.Mixed, // Encrypted sensitive data
    expiresAt: Date,
    metadata: mongoose.Schema.Types.Mixed
}, { timestamps: true });

paymentMethodSchema.index({ userId: 1, type: 1 });
paymentMethodSchema.index({ userId: 1, isDefault: 1 });

module.exports = {
    CheckoutSession: mongoose.model('CheckoutSession', checkoutSessionSchema),
    PaymentTransaction: mongoose.model('PaymentTransaction', paymentTransactionSchema),
    CheckoutSessionModel: mongoose.model('CheckoutSession', checkoutSessionSchema),
    PaymentTransactionModel: mongoose.model('PaymentTransaction', paymentTransactionSchema),
    Invoice: mongoose.model('Invoice', invoiceSchema),
    ShippingMethod: mongoose.model('ShippingMethod', shippingMethodSchema),
    DeliveryEstimate: mongoose.model('DeliveryEstimate', deliveryEstimateSchema),
    FraudCheck: mongoose.model('FraudCheck', fraudCheckSchema),
    CheckoutAnalytics: mongoose.model('CheckoutAnalytics', checkoutAnalyticsSchema),
    SavedAddress: mongoose.model('SavedAddress', savedAddressSchema),
    PaymentMethod: mongoose.model('PaymentMethod', paymentMethodSchema),
    CheckoutItem: checkoutItemSchema,
    CheckoutAddress: checkoutAddressSchema,
    DeliveryMethod: deliveryMethodSchema,
    PaymentMethodConfig: paymentMethodConfigSchema,
    PaymentTransaction: paymentTransactionSchema,
    CheckoutSession: checkoutSessionSchema,
    Invoice: invoiceSchema,
    ShippingMethod: shippingMethodSchema,
    DeliveryEstimate: deliveryEstimateSchema,
    FraudCheck: fraudCheckSchema,
    CheckoutAnalytics: checkoutAnalyticsSchema,
    SavedAddress: savedAddressSchema,
    PaymentMethod: paymentMethodSchema
};