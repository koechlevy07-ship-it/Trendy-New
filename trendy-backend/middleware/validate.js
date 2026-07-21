const Joi = require('joi');

const validate = (schema, property = 'body') => {
    return (req, res, next) => {
        const { error } = schema.validate(req[property], { abortEarly: false, stripUnknown: true });
        if (error) {
            const messages = error.details.map(d => d.message);
            return res.status(400).json({ success: false, message: 'Validation error', errors: messages });
        }
        next();
    };
};

// Auth schemas
const registerSchema = Joi.object({
    name: Joi.string().trim().min(2).max(50).required(),
    email: Joi.string().email().lowercase().required(),
    password: Joi.string().min(8).max(128).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^()_+\-=])[A-Za-z\d@$!%*?&#^()_+\-=]/).required()
        .messages({ 'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character' })
});

const loginSchema = Joi.object({
    email: Joi.string().email().lowercase().required(),
    password: Joi.string().required()
});

// Admin user schema
const adminUserSchema = Joi.object({
    name: Joi.string().trim().min(2).max(100).required(),
    username: Joi.string().trim().min(3).max(50).allow('', null),
    email: Joi.string().email().lowercase().required(),
    password: Joi.string().min(8).max(128).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/).allow('', null),
    roleId: Joi.string().required(),
    phone: Joi.string().pattern(/^[+]?[0-9]{10,15}$/).allow('', null),
    department: Joi.string().allow('', null),
    jobTitle: Joi.string().trim().max(100).allow('', null),
    employeeId: Joi.string().trim().max(50).allow('', null),
    profilePhoto: Joi.string().uri().allow('', null),
    notes: Joi.string().max(500).allow('', null),
    status: Joi.string().valid('active', 'suspended', 'blocked', 'pending_verification').default('active')
});

// Role schema
const roleSchema = Joi.object({
    name: Joi.string().trim().min(2).max(100).required(),
    slug: Joi.string().lowercase().trim().regex(/^[a-z0-9-]+$/).allow('', null),
    description: Joi.string().max(500).allow('', null),
    priority: Joi.number().integer().min(0).max(1000).default(10),
    permissions: Joi.array().items(Joi.object({
        module: Joi.string().required(),
        actions: Joi.array().items(Joi.string()).min(1)
    }))
});

// Department schema
const departmentSchema = Joi.object({
    name: Joi.string().trim().min(2).max(100).required(),
    managerId: Joi.string().allow('', null),
    parentDepartment: Joi.string().allow('', null),
    color: Joi.string().pattern(/^#[0-9A-F]{6}$/i).default('#6366f1'),
    icon: Joi.string().trim().max(50).default('fa-building'),
    isActive: Joi.boolean().default(true)
});

// Security policy schema
const securityPolicySchema = Joi.object({
    passwordMinLength: Joi.number().integer().min(6).max(128).default(8),
    passwordRequireUppercase: Joi.boolean().default(true),
    passwordRequireLowercase: Joi.boolean().default(true),
    passwordRequireNumber: Joi.boolean().default(true),
    passwordRequireSpecial: Joi.boolean().default(true),
    sessionTimeoutMinutes: Joi.number().integer().min(5).max(1440).default(60),
    maxLoginAttempts: Joi.number().integer().min(1).max(20).default(5),
    accountLockoutMinutes: Joi.number().integer().min(1).max(1440).default(30),
    jwtExpiration: Joi.string().default('7d'),
    maxSessionsPerUser: Joi.number().integer().min(1).max(50).default(5),
    enforceTwoFactor: Joi.boolean().default(false),
    ipWhitelist: Joi.array().items(Joi.string()).default([]),
    maintenanceMode: Joi.boolean().default(false),
    maintenanceMessage: Joi.string().max(500).default('We are currently undergoing scheduled maintenance. Please check back shortly.'),
    maintenanceAllowAdmin: Joi.boolean().default(true)
});

// Product schemas
const productSchema = Joi.object({
    name: Joi.string().trim().min(1).max(200).required(),
    slug: Joi.string().trim().min(1).max(200).optional().allow(''),
    description: Joi.string().trim().max(10000).allow('').optional(),
    shortDescription: Joi.string().trim().max(300).allow('').optional(),
    price: Joi.number().min(0).required(),
    originalPrice: Joi.number().min(0).optional().allow(null, ''),
    stock: Joi.number().min(0).integer().optional(),
    stockThreshold: Joi.number().min(0).integer().optional(),
    sku: Joi.string().trim().max(50).allow('').optional(),
    brand: Joi.string().trim().max(100).allow('').optional(),
    material: Joi.string().trim().allow('').optional(),
    category: Joi.string().trim().allow('').optional(),
    gender: Joi.string().valid('men', 'women', 'kids', 'unisex').optional(),
    thumbnail: Joi.string().trim().allow('').optional(),
    images: Joi.alternatives().try(Joi.array().items(Joi.string()).max(10), Joi.string()).optional(),
    gallery: Joi.alternatives().try(Joi.array().items(Joi.string()).max(10), Joi.string()).optional(),
    images360: Joi.alternatives().try(Joi.array().items(Joi.string()).max(20), Joi.string()).optional(),
    sizes: Joi.alternatives().try(Joi.array().items(Joi.string().trim()).max(20), Joi.string()).optional(),
    ukSize: Joi.string().trim().allow('').optional(),
    colors: Joi.alternatives().try(Joi.array().items(Joi.string().trim()).max(20), Joi.string()).optional(),
    colorSwatches: Joi.array().items(Joi.object({
        name: Joi.string().trim().allow(''),
        hex: Joi.string().trim().allow(''),
        image: Joi.string().trim().allow('')
    })).optional(),
    specifications: Joi.array().items(Joi.object({
        key: Joi.string().trim().allow(''),
        value: Joi.string().trim().allow('')
    })).optional(),
    tags: Joi.alternatives().try(Joi.array().items(Joi.string().trim()).max(20), Joi.string()).optional(),
    relatedProducts: Joi.array().items(Joi.string()).optional(),
    limitedPieces: Joi.number().min(0).integer().optional(),
    limitedAvailable: Joi.boolean().optional(),
    preOrder: Joi.boolean().optional(),
    soldOut: Joi.boolean().optional(),
    deliveryEstimate: Joi.string().trim().max(100).allow('').optional(),
    featured: Joi.boolean().optional(),
    isNewArrival: Joi.boolean().optional(),
    isBestSeller: Joi.boolean().optional(),
    flashSale: Joi.boolean().optional(),
    flashSalePrice: Joi.number().min(0).optional().allow(null, ''),
    flashSaleEnd: Joi.date().optional().allow(null, ''),
    sponsored: Joi.boolean().optional(),
    installmentEligible: Joi.boolean().optional(),
    installmentPrice: Joi.number().min(0).optional().allow(null, ''),
    visibility: Joi.string().valid('visible', 'hidden', 'featured-only').optional(),
    status: Joi.string().valid('published', 'draft', 'archived').optional()
});

// Order schemas
const orderSchema = Joi.object({
    items: Joi.array().items(Joi.object({
        productId: Joi.string().required(),
        name: Joi.string().required(),
        price: Joi.number().min(0).required(),
        quantity: Joi.number().min(1).integer().required(),
        size: Joi.string().allow('').optional(),
        color: Joi.string().allow('').optional(),
        image: Joi.string().allow('').optional()
    })).min(1).required(),
    shippingAddress: Joi.object({
        fullName: Joi.string().trim().min(2).max(100).required(),
        phone: Joi.string().trim().min(5).max(20).required(),
        address: Joi.string().trim().min(5).max(300).required(),
        city: Joi.string().trim().min(2).max(100).required(),
        country: Joi.string().trim().min(2).max(100).optional().default('Kenya')
    }).required(),
    paymentMethod: Joi.string().valid('cash', 'mpesa', 'card', 'bank').optional().default('cash'),
    discount: Joi.number().min(0).optional().default(0),
    couponCode: Joi.string().trim().allow('').optional(),
    notes: Joi.string().trim().max(500).allow('').optional()
});

// Contact schema
const contactSchema = Joi.object({
    name: Joi.string().trim().min(2).max(100).required(),
    email: Joi.string().email().lowercase().required(),
    phone: Joi.string().trim().max(20).allow('').optional(),
    subject: Joi.string().trim().max(200).allow('').optional(),
    message: Joi.string().trim().min(10).max(2000).required()
});

// Review schema
const reviewSchema = Joi.object({
    product: Joi.string().required(),
    rating: Joi.number().min(1).max(5).integer().required(),
    comment: Joi.string().trim().max(1000).allow('').optional(),
    title: Joi.string().trim().max(100).allow('').optional()
});

// Q&A schema
const qaSchema = Joi.object({
    productId: Joi.string().required(),
    text: Joi.string().trim().min(3).max(1000).required()
});

const answerSchema = Joi.object({
    text: Joi.string().trim().min(3).max(2000).required()
});

// Coupon schema
const couponSchema = Joi.object({
    code: Joi.string().trim().min(3).max(30).required(),
    discount: Joi.number().min(0).max(100).required(),
    discountType: Joi.string().valid('percentage', 'fixed').required(),
    minOrder: Joi.number().min(0).optional(),
    expiry: Joi.date().optional(),
    usageLimit: Joi.number().min(0).integer().optional(),
    active: Joi.boolean().optional()
});

module.exports = {
    validate,
    schemas: {
        register: registerSchema,
        login: loginSchema,
        product: productSchema,
        order: orderSchema,
        contact: contactSchema,
    review: reviewSchema,
    qa: qaSchema,
    answer: answerSchema,
    coupon: couponSchema,
    adminUser: adminUserSchema,
    role: roleSchema,
    department: departmentSchema,
    securityPolicy: securityPolicySchema
};
