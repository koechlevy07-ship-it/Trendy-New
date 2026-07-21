const mongoose = require('mongoose');

const promotionRuleSchema = new mongoose.Schema({
    // Product/Category targeting
    products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    categories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
    brands: [{ type: String, trim: true }],
    tags: [{ type: String, trim: true }],
    
    // Discount
    discountType: {
        type: String,
        enum: ['percentage', 'fixed', 'free_shipping'],
        default: 'percentage'
    },
    discountValue: { type: Number, required: true, min: 0 },
    maxDiscount: { type: Number, default: 0, min: 0 },
    
    // Conditions
    minQuantity: { type: Number, default: 1, min: 1 },
    minCartValue: { type: Number, default: 0, min: 0 },
    customerSegments: [{ type: String, enum: ['all', 'new', 'returning', 'vip', 'inactive'] }]
}, { _id: false });

const promotionSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 500 },
    
    type: {
        type: String,
        enum: ['flash_sale', 'weekend', 'holiday', 'seasonal', 'clearance', 'birthday', 'anniversary', 'welcome', 'bundle', 'custom'],
        default: 'custom'
    },
    
    // Rules
    rules: [promotionRuleSchema],
    
    // Global constraints
    maxUsesPerCustomer: { type: Number, default: 0, min: 0 },
    maxTotalUses: { type: Number, default: 0, min: 0 },
    requiresCoupon: { type: Boolean, default: false },
    couponCode: { type: String, uppercase: true, trim: true },
    
    // Scheduling
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    timezone: { type: String, default: 'Africa/Nairobi' },
    recurring: {
        enabled: { type: Boolean, default: false },
        pattern: { type: String, enum: ['daily', 'weekly', 'monthly', 'yearly'] },
        daysOfWeek: [{ type: Number, min: 0, max: 6 }], // 0 = Sunday
        daysOfMonth: [{ type: Number, min: 1, max: 31 }],
        months: [{ type: Number, min: 1, max: 12 }]
    },
    
    // Badge/Display
    badgeText: { type: String, trim: true, maxlength: 30 }, // e.g., "FLASH SALE", "50% OFF"
    badgeColor: { type: String, default: '#DC2626' },
    showCountdown: { type: Boolean, default: true },
    
    // Priority (higher = applied first)
    priority: { type: Number, default: 0 },
    
    // Stacking
    stackable: { type: Boolean, default: false },
    exclusive: { type: Boolean, default: false }, // Prevents other promotions
    
    // Status
    status: {
        type: String,
        enum: ['draft', 'active', 'scheduled', 'paused', 'expired', 'archived'],
        default: 'draft'
    },
    
    // Analytics
    timesTriggered: { type: Number, default: 0 },
    totalDiscountGiven: { type: Number, default: 0 },
    ordersAffected: { type: Number, default: 0 },
    
    // Metadata
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    tags: [{ type: String, trim: true }]
}, { timestamps: true });

promotionSchema.index({ status: 1, startDate: 1, endDate: 1 });
promotionSchema.index({ type: 1 });
promotionSchema.index({ 'rules.products': 1 });
promotionSchema.index({ 'rules.categories': 1 });

promotionSchema.pre('save', function(next) {
    // Auto-update status based on dates
    const now = new Date();
    if (this.status !== 'draft' && this.status !== 'paused' && this.status !== 'archived') {
        if (this.endDate && this.endDate < now) {
            this.status = 'expired';
        } else if (this.startDate > now) {
            this.status = 'scheduled';
        } else if (this.maxTotalUses > 0 && this.timesTriggered >= this.maxTotalUses) {
            this.status = 'expired';
        }
    }
    // Ensure coupon code is uppercase
    if (this.couponCode) this.couponCode = this.couponCode.toUpperCase().trim();
    next();
});

promotionSchema.methods.isActive = function() {
    const now = new Date();
    return this.status === 'active' && this.startDate <= now && this.endDate >= now;
};

promotionSchema.methods.matchesCart = function(cart, customer) {
    if (!this.isActive()) return false;
    
    // Check if customer segment matches
    if (this.rules.length > 0) {
        for (const rule of this.rules) {
            // Check customer segment
            if (rule.customerSegments.length > 0) {
                const customerType = customer?.isNewCustomer ? 'new' : 'returning';
                const isVip = customer?.loyaltyTier === 'vip' || customer?.loyaltyTier === 'platinum';
                const isInactive = customer?.lastLogin ? (Date.now() - new Date(customer.lastLogin).getTime()) > 90 * 24 * 60 * 60 * 1000 : false;
                
                const segments = [...rule.customerSegments];
                if (isVip && !segments.includes('vip')) segments.push('vip');
                if (isInactive && !segments.includes('inactive')) segments.push('inactive');
                
                if (!segments.includes('all') && !segments.includes(customerType)) {
                    continue; // Rule doesn't match this customer
                }
            }
            
            // Check if cart has matching products/categories
            const hasMatchingItems = cart.items.some(item => {
                const productId = item.productId || item.product?._id;
                const categoryId = item.category || item.product?.category;
                const brand = item.brand || item.product?.brand;
                
                if (rule.products.length > 0 && !rule.products.some(id => id.equals(productId))) return false;
                if (rule.categories.length > 0 && !rule.categories.some(id => id.equals(categoryId))) return false;
                if (rule.brands.length > 0 && !rule.brands.includes(brand)) return false;
                
                // Check quantity
                if (item.quantity < rule.minQuantity) return false;
                
                return true;
            });
            
            if (!hasMatchingItems) continue;
            
            // Check cart value
            if (rule.minCartValue > 0 && cart.subtotal < rule.minCartValue) continue;
            
            // All conditions met for this rule
            return true;
        }
    }
    
    // No rules = applies to everything
    return true;
};

promotionSchema.methods.calculateDiscount = function(cart) {
    let totalDiscount = 0;
    
    for (const rule of this.rules) {
        let ruleDiscount = 0;
        
        for (const item of cart.items) {
            const productId = item.productId || item.product?._id;
            const categoryId = item.category || item.product?.category;
            const brand = item.brand || item.product?.brand;
            const itemTotal = item.price * item.quantity;
            
            // Check if item matches rule
            if (rule.products.length > 0 && !rule.products.some(id => id.equals(productId))) continue;
            if (rule.categories.length > 0 && !rule.categories.some(id => id.equals(categoryId))) continue;
            if (rule.brands.length > 0 && !rule.brands.includes(brand)) continue;
            if (item.quantity < rule.minQuantity) continue;
            
            // Calculate discount for this item
            if (rule.discountType === 'percentage') {
                ruleDiscount += Math.round(itemTotal * (rule.discountValue / 100) * 100) / 100;
                if (rule.maxDiscount > 0 && ruleDiscount > rule.maxDiscount) {
                    ruleDiscount = rule.maxDiscount;
                }
            } else if (rule.discountType === 'fixed') {
                ruleDiscount += Math.min(rule.discountValue, itemTotal);
            } else if (rule.discountType === 'free_shipping') {
                ruleDiscount = cart.shipping || 0;
            }
        }
        
        totalDiscount += ruleDiscount;
    }
    
    return Math.max(0, totalDiscount);
};

module.exports = mongoose.model('Promotion', promotionSchema);