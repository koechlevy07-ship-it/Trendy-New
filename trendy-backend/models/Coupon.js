const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
    // Basic Information
    name: { type: String, required: true, trim: true, maxlength: 100 },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 20 },
    description: { type: String, trim: true, maxlength: 500 },
    
    // Discount Configuration
    discountType: {
        type: String,
        enum: ['percentage', 'fixed', 'free_shipping', 'bogo', 'bundle', 'category', 'product', 'cart', 'first_purchase', 'loyalty'],
        default: 'percentage'
    },
    discountValue: { type: Number, required: true, min: 0 },
    maxDiscount: { type: Number, default: 0, min: 0 }, // Cap for percentage discounts
    
    // BOGO Configuration
    bogoBuyQuantity: { type: Number, default: 1, min: 1 },
    bogoGetQuantity: { type: Number, default: 1, min: 1 },
    bogoGetDiscount: { type: Number, default: 100, min: 0, max: 100 }, // Percentage off the "get" items
    
    // Bundle Configuration
    bundleProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    bundleDiscount: { type: Number, default: 0, min: 0 }, // Percentage or fixed
    bundleDiscountType: { type: String, enum: ['percentage', 'fixed'], default: 'percentage' },
    
    // Cart/Category/Product Discount
    eligibleProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    eligibleCategories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
    eligibleBrands: [{ type: String, trim: true }],
    excludedProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    excludedCategories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
    
    // Cart Requirements
    minCartValue: { type: Number, default: 0, min: 0 },
    maxCartValue: { type: Number, default: 0, min: 0 }, // 0 = no limit
    minQuantity: { type: Number, default: 1, min: 1 },
    maxQuantity: { type: Number, default: 0, min: 0 }, // 0 = no limit
    
    // Customer Eligibility
    customerEligibility: { type: String, enum: ['all', 'new', 'returning', 'specific'], default: 'all' },
    eligibleCustomers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    newCustomerOnly: { type: Boolean, default: false },
    
    // Usage Limits
    usageLimit: { type: Number, default: 0, min: 0 }, // 0 = unlimited
    usageLimitPerCustomer: { type: Number, default: 0, min: 0 }, // 0 = unlimited
    usageLimitDaily: { type: Number, default: 0, min: 0 }, // 0 = unlimited
    oneTimeUse: { type: Boolean, default: false },
    
    // Scheduling
    startDate: { type: Date, default: Date.now },
    endDate: { type: Date, default: null },
    timezone: { type: String, default: 'Africa/Nairobi' },
    
    // Status
    status: {
        type: String,
        enum: ['draft', 'active', 'scheduled', 'paused', 'expired'],
        default: 'draft'
    },
    
    // Tracking
    timesUsed: { type: Number, default: 0 },
    revenueGenerated: { type: Number, default: 0 },
    conversionRate: { type: Number, default: 0 },
    
    // Usage tracking per customer
    usedBy: [{
        customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        count: { type: Number, default: 0 },
        lastUsed: { type: Date, default: Date.now }
    }],
    dailyUsage: [{
        date: { type: Date, default: Date.now },
        count: { type: Number, default: 0 }
    }],
    
    // Metadata
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    tags: [{ type: String, trim: true }]
}, { timestamps: true });

couponSchema.index({ code: 1 });
couponSchema.index({ status: 1, startDate: 1, endDate: 1 });
couponSchema.index({ eligibleProducts: 1 });
couponSchema.index({ eligibleCategories: 1 });
couponSchema.index({ createdBy: 1 });

couponSchema.pre('save', function(next) {
    // Auto-update status based on dates
    const now = new Date();
    if (this.status !== 'draft' && this.status !== 'paused') {
        if (this.endDate && this.endDate < now) {
            this.status = 'expired';
        } else if (this.startDate > now) {
            this.status = 'scheduled';
        } else if (this.usageLimit > 0 && this.timesUsed >= this.usageLimit) {
            this.status = 'expired';
        }
    }
    // Ensure code is uppercase
    if (this.code) this.code = this.code.toUpperCase().trim();
    next();
});

couponSchema.methods.isValid = function(cart, customer) {
    const now = new Date();
    
    // Check status
    if (this.status !== 'active') return { valid: false, message: 'Coupon is not active' };
    
    // Check dates
    if (this.startDate && this.startDate > now) return { valid: false, message: 'Coupon has not started yet' };
    if (this.endDate && this.endDate < now) return { valid: false, message: 'Coupon has expired' };
    
    // Check total usage limit
    if (this.usageLimit > 0 && this.timesUsed >= this.usageLimit) {
        return { valid: false, message: 'Coupon usage limit reached' };
    }
    
    // Check daily limit
    if (this.usageLimitDaily > 0) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayUsage = this.dailyUsage.find(u => 
            u.date.toDateString() === today.toDateString()
        );
        if (todayUsage && todayUsage.count >= this.usageLimitDaily) {
            return { valid: false, message: 'Daily usage limit reached' };
        }
    }
    
    // Check cart value
    if (this.minCartValue > 0 && cart.subtotal < this.minCartValue) {
        return { valid: false, message: `Minimum cart value of Ksh ${this.minCartValue.toLocaleString()} required` };
    }
    if (this.maxCartValue > 0 && cart.subtotal > this.maxCartValue) {
        return { valid: false, message: `Maximum cart value of Ksh ${this.maxCartValue.toLocaleString()} exceeded` };
    }
    
    // Check customer eligibility
    if (customer) {
        if (this.customerEligibility === 'new' && !customer.isNewCustomer) {
            return { valid: false, message: 'Coupon is for new customers only' };
        }
        if (this.customerEligibility === 'returning' && customer.isNewCustomer) {
            return { valid: false, message: 'Coupon is for returning customers only' };
        }
        if (this.customerEligibility === 'specific' && !this.eligibleCustomers.some(id => id.equals(customer._id))) {
            return { valid: false, message: 'You are not eligible for this coupon' };
        }
        
        // Check per-customer usage limit
        if (this.usageLimitPerCustomer > 0) {
            const customerUsage = this.usedBy.find(u => u.customer.equals(customer._id));
            if (customerUsage && customerUsage.count >= this.usageLimitPerCustomer) {
                return { valid: false, message: 'You have reached the usage limit for this coupon' };
            }
            if (this.oneTimeUse && customerUsage) {
                return { valid: false, message: 'You have already used this coupon' };
            }
        }
    }
    
    // Check product/category eligibility
    if (this.eligibleProducts.length > 0 || this.eligibleCategories.length > 0) {
        const hasEligibleItem = cart.items.some(item => {
            const productId = item.productId || item.product?._id;
            const categoryId = item.category || item.product?.category;
            
            if (this.excludedProducts.some(id => id.equals(productId)) || 
                this.excludedCategories.some(id => id.equals(categoryId))) {
                return false;
            }
            if (this.eligibleProducts.length > 0 && !this.eligibleProducts.some(id => id.equals(productId))) {
                return false;
            }
            if (this.eligibleCategories.length > 0 && !this.eligibleCategories.some(id => id.equals(categoryId))) {
                return false;
            }
            return true;
        });
        if (!hasEligibleItem) {
            return { valid: false, message: 'No eligible items in cart for this coupon' };
        }
    }
    
    // Check quantity requirements
    if (this.minQuantity > 1) {
        const eligibleQty = cart.items.reduce((sum, item) => {
            // Check if item is eligible for this coupon
            const productId = item.productId || item.product?._id;
            const categoryId = item.category || item.product?.category;
            if (this.eligibleProducts.length > 0 && !this.eligibleProducts.some(id => id.equals(productId))) return sum;
            if (this.eligibleCategories.length > 0 && !this.eligibleCategories.some(id => id.equals(categoryId))) return sum;
            return sum + item.quantity;
        }, 0);
        if (eligibleQty < this.minQuantity) {
            return { valid: false, message: `Minimum ${this.minQuantity} eligible items required` };
        }
    }
    
    return { valid: true };
};

couponSchema.methods.calculateDiscount = function(cart) {
    let discount = 0;
    const subtotal = cart.subtotal || 0;
    
    switch (this.discountType) {
        case 'percentage':
            discount = Math.round(subtotal * (this.discountValue / 100) * 100) / 100;
            if (this.maxDiscount > 0 && discount > this.maxDiscount) {
                discount = this.maxDiscount;
            }
            break;
        case 'fixed':
            discount = Math.min(this.discountValue, subtotal);
            break;
        case 'free_shipping':
            discount = cart.shipping || 0;
            break;
        case 'category':
        case 'product':
            // Calculate discount only on eligible items
            discount = cart.items.reduce((sum, item) => {
                const productId = item.productId || item.product?._id;
                const categoryId = item.category || item.product?.category;
                const isEligible = this.eligibleProducts.some(id => id.equals(productId)) ||
                    this.eligibleCategories.some(id => id.equals(categoryId));
                if (isEligible) {
                    const itemTotal = item.price * item.quantity;
                    if (this.discountType === 'percentage') {
                        return sum + Math.round(itemTotal * (this.discountValue / 100) * 100) / 100;
                    } else {
                        return sum + Math.min(this.discountValue, itemTotal);
                    }
                }
                return sum;
            }, 0);
            break;
        case 'cart':
            discount = Math.min(this.discountValue, subtotal);
            break;
        case 'first_purchase':
        case 'loyalty':
            discount = this.discountType === 'percentage' 
                ? Math.round(subtotal * (this.discountValue / 100) * 100) / 100
                : Math.min(this.discountValue, subtotal);
            break;
        case 'bogo':
            // BOGO logic: handled separately in cart
            discount = 0;
            break;
        case 'bundle':
            // Bundle discount: handled separately
            discount = 0;
            break;
    }
    
    return Math.max(0, Math.min(discount, subtotal));
};

module.exports = mongoose.model('Coupon', couponSchema);