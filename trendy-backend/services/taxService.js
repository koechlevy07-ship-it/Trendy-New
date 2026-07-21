// Tax Service - Handles tax calculations for different regions

const Settings = require('../models/Settings');

/**
 * Tax rates configuration for Kenya
 * VAT: 16% standard rate
 * Additional county/municipal taxes where applicable
 */

const KENYA_TAX_RATES = {
    // Standard VAT rate in Kenya
    VAT_RATE: 0.16, // 16%
    
    // Exempt categories (0% VAT)
    EXEMPT_CATEGORIES: [
        'food', 'medicine', 'education', 'books', 
        'children_clothing', 'agricultural_inputs'
    ],
    
    // Zero-rated items
    ZERO_RATED_CATEGORIES: [
        'exports', 'international_transport', 'diplomatic'
    ],
    
    // County-specific additional taxes (if any)
    COUNTY_TAXES: {
        'nairobi': 0,      // No additional county tax
        'mombasa': 0,
        'kisumu': 0,
        // Add county-specific taxes if applicable
    }
};

// International tax rates (for future expansion)
const INTERNATIONAL_TAX_RATES = {
    'US': { rate: 0, name: 'US Sales Tax', variesByState: true },
    'UK': { rate: 0.20, name: 'UK VAT' },
    'EU': { rate: 0.20, name: 'EU VAT', variesByCountry: true },
    'UG': { rate: 0.18, name: 'Uganda VAT' },
    'TZ': { rate: 0.18, name: 'Tanzania VAT' },
    'RW': { rate: 0.18, name: 'Rwanda VAT' }
};

/**
 * Calculate tax for an order
 */
async function calculateTax({ 
    subtotal, 
    items = [], 
    shippingAddress = {}, 
    billingAddress = {},
    customerType = 'individual', // 'individual' or 'business'
    taxExempt = false,
    taxExemptNumber = null
}) {
    try {
        // Check for tax exemption
        if (taxExempt && taxExemptNumber) {
            // Validate tax exempt certificate (would integrate with KRA API in production)
            return {
                tax: 0,
                taxRate: 0,
                breakdown: [],
                exempt: true,
                exemptReason: 'Valid tax exemption certificate'
            };
        }
        
        // Get settings for tax configuration
        const settings = await Settings.findOne();
        const vatRate = settings?.vatRate || 0.16; // 16% default
        const taxInclusive = settings?.taxInclusivePricing || false;
        
        // Determine tax jurisdiction from shipping address
        const country = (shippingAddress?.country || 'Kenya').toLowerCase();
        const county = (shippingAddress?.county || '').toLowerCase();
        
        // Get tax rate for jurisdiction
        let taxRate = vatRate;
        let taxName = 'VAT (16%)';
        
        if (country !== 'kenya') {
            const intlRate = INTERNATIONAL_TAX_RATES[shippingAddress.country?.toUpperCase()];
            if (intlRate) {
                taxRate = intlRate.rate;
                taxName = intlRate.name;
            }
        } else {
            // Check for county-specific taxes
            const countyTax = KENYA_TAX_RATES.COUNTY_TAXES[county];
            if (countyTax !== undefined) {
                taxRate += countyTax;
            }
        }
        
        // Calculate taxable amount
        let taxableAmount = subtotal;
        
        // Apply exemptions for specific items
        let exemptAmount = 0;
        for (const item of items) {
            if (isTaxExempt(item)) {
                exemptAmount += item.price * item.quantity;
            }
        }
        
        taxableAmount = Math.max(0, subtotal - exemptAmount);
        
        // Calculate tax
        const tax = Math.round(taxableAmount * taxRate * 100) / 100;
        
        // Build breakdown
        const breakdown = [
            {
                name: taxName,
                rate: (taxRate * 100).toFixed(2) + '%',
                taxableAmount: Math.round(taxableAmount * 100) / 100,
                tax: tax
            }
        ];
        
        // Add county tax if applicable
        if (countyTax > 0) {
            breakdown.push({
                name: `${county} County Tax`,
                rate: (countyTax * 100).toFixed(2) + '%',
                taxableAmount: Math.round(taxableAmount * 100) / 100,
                tax: Math.round(taxableAmount * countyTax * 100) / 100
            });
        }
        
        // Add exempt items note
        if (exemptAmount > 0) {
            breakdown.push({
                name: 'Tax Exempt Items',
                rate: '0%',
                taxableAmount: Math.round(exemptAmount * 100) / 100,
                tax: 0
            });
        }
        
        return {
            tax: tax,
            taxRate: taxRate,
            taxName: taxName,
            taxableAmount,
            exemptAmount,
            breakdown,
            currency: 'KES',
            taxInclusive: taxInclusive,
            exempt: false
        };
    } catch (err) {
        console.error('Tax calculation error:', err);
        // Fallback to standard VAT
        const tax = Math.round(subtotal * 0.16 * 100) / 100;
        return {
            tax,
            taxRate: 0.16,
            taxName: 'VAT (16%)',
            taxableAmount: subtotal,
            exemptAmount: 0,
            breakdown: [{
                name: 'VAT (16%)',
                rate: '16%',
                taxableAmount: subtotal,
                tax
            }],
            currency: 'KES',
            taxInclusive: false,
            exempt: false
        };
    }
}

/**
 * Check if a product/item is tax exempt
 */
function isTaxExempt(item) {
    if (!item.category) return false;
    
    const category = item.category.toLowerCase();
    const name = (item.name || '').toLowerCase();
    
    // Check exempt categories
    for (const exempt of KENYA_TAX_RATES.EXEMPT_CATEGORIES) {
        if (category.includes(exempt) || name.includes(exempt)) {
            return true;
        }
    }
    
    // Check zero-rated categories
    for (const zero of KENYA_TAX_RATES.ZERO_RATED_CATEGORIES) {
        if (category.includes(zero) || name.includes(zero)) {
            return true;
        }
    }
    
    // Specific product checks
    if (category.includes('medicine') || category.includes('pharmaceutical')) return true;
    if (category.includes('book') || category.includes('educational')) return true;
    if (category.includes('baby') && category.includes('food')) return true;
    if (category.includes('sanitary') || category.includes('menstrual')) return true;
    
    return false;
}

/**
 * Calculate tax for a single line item
 */
function calculateLineItemTax(item, taxRate) {
    const taxablePrice = item.price * (1 - (item.discount || 0) / 100);
    const lineSubtotal = taxablePrice * (item.quantity || 1);
    
    // Check if item is exempt
    if (isTaxExempt({ category: item.category, name: item.name })) {
        return {
            tax: 0,
            rate: 0,
            taxableAmount: 0,
            exempt: true
        };
    }
    
    const tax = Math.round(lineSubtotal * taxRate * 100) / 100;
    
    return {
        tax,
        rate: taxRate,
        taxableAmount: lineSubtotal,
        exempt: false
    };
}

/**
 * Get tax configuration for display
 */
async function getTaxConfig() {
    const settings = await Settings.findOne();
    
    return {
        vatRate: settings?.vatRate || 0.16,
        taxInclusive: settings?.taxInclusivePricing || false,
        rates: {
            standard: 0.16,
            exempt: 0,
            zeroRated: 0
        },
        exemptCategories: KENYA_TAX_RATES.EXEMPT_CATEGORIES,
        zeroRatedCategories: KENYA_TAX_RATES.ZERO_RATED_CATEGORIES,
        countyTaxes: KENYA_TAX_RATES.COUNTY_TAXES,
        internationalRates: INTERNATIONAL_TAX_RATES
    };
}

/**
 * Calculate tax for display in cart/checkout
 */
async function calculateCartTax(cart, shippingAddress) {
    if (!cart || !cart.items?.length) {
        return { tax: 0, breakdown: [] };
    }
    
    const subtotal = cart.items
        .filter(i => !i.savedForLater)
        .reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 1), 0);
    
    const result = await calculateTax({
        subtotal,
        items: cart.items.filter(i => !i.savedForLater),
        shippingAddress: shippingAddress || {}
    });
    
    return result;
}

/**
 * Validate tax exemption certificate (placeholder for KRA integration)
 */
async function validateTaxExemption(certificateNumber, pin) {
    // In production, this would call KRA API
    // For now, return a mock validation
    return {
        valid: false,
        reason: 'KRA integration not configured'
    };
}

/**
 * Generate tax invoice breakdown for invoice generation
 */
function generateTaxBreakdown(items, subtotal, taxRate, exemptItems = []) {
    const breakdown = [];
    let totalTax = 0;
    
    // Group by tax rate
    const taxGroups = {};
    
    for (const item of items) {
        const lineSubtotal = item.price * (item.quantity || 1);
        
        if (exemptItems.includes(item._id?.toString() || item.id)) {
            continue; // Skip exempt items
        }
        
        const itemTax = Math.round(item.lineSubtotal * taxRate * 100) / 100;
        totalTax += itemTax;
        
        if (!taxGroups[taxRate]) {
            taxGroups[taxRate] = { tax: 0, base: 0, items: [] };
        }
        taxGroups[taxRate].tax += itemTax;
        taxGroups[taxRate].base += item.price * (item.quantity || 1);
        taxGroups[taxRate].items.push({
            name: item.name,
            qty: item.quantity,
            price: item.price,
            tax: itemTax
        });
    }
    
    for (const [rate, group] of Object.entries(taxGroups)) {
        breakdown.push({
            rate: (rate * 100).toFixed(2) + '%',
            taxableAmount: group.base,
            taxAmount: group.tax,
            items: group.items
        });
    }
    
    // Add exempt items
    if (exemptItems.length > 0) {
        breakdown.push({
            rate: '0% (Exempt)',
            taxableAmount: 0,
            taxAmount: 0,
            items: exemptItems.map(id => ({ id }))
        });
    }
    
    return {
        breakdown,
        totalTax: Math.round(totalTax * 100) / 100,
        subtotal
    };
}

/**
 * Validate tax settings
 */
async function validateTaxSettings(settings) {
    const errors = [];
    
    if (settings.vatRate < 0 || settings.vatRate > 1) {
        errors.push('VAT rate must be between 0 and 1');
    }
    
    if (settings.freeDeliveryThreshold < 0) {
        errors.push('Free delivery threshold cannot be negative');
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}

module.exports = {
    calculateTax,
    calculateLineItemTax,
    calculateCartTax,
    getTaxConfig,
    isTaxExempt,
    generateTaxBreakdown,
    validateTaxExemption,
    validateTaxSettings,
    KENYA_TAX_RATES,
    INTERNATIONAL_TAX_RATES
};