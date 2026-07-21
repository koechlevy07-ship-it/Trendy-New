// Shipping Service - Handles shipping calculations, rates, and delivery estimates

const ShippingMethod = require('../models/Checkout').ShippingMethod;
const DeliveryEstimate = require('../models/Checkout').DeliveryEstimate;
const Settings = require('../models/Settings');
const Product = require('../models/Product');
const Order = require('../models/Order');

// Default shipping configuration
const DEFAULT_SHIPPING_CONFIG = {
    standard: {
        name: 'Standard Delivery',
        type: 'standard',
        baseFee: 500,
        estimatedDays: '3-7 business days',
        provider: 'Courier Service',
        freeThreshold: 15000,
        trackingAvailable: true
    },
    express: {
        name: 'Express Delivery',
        type: 'express',
        baseFee: 1200,
        estimatedDays: '1-2 business days',
        provider: 'Express Courier',
        freeThreshold: 25000,
        trackingAvailable: true
    },
    'same-day': {
        name: 'Same-Day Delivery',
        type: 'same-day',
        baseFee: 2000,
        estimatedDays: 'Today (order before 2PM)',
        provider: 'SpeedX',
        freeThreshold: 50000,
        trackingAvailable: true
    },
    pickup: {
        name: 'Store Pickup',
        type: 'pickup',
        baseFee: 0,
        estimatedDays: 'Ready in 2-4 hours',
        provider: '',
        trackingAvailable: false
    }
};

// Zone-based shipping rates for Kenya
const KENYA_SHIPPING_ZONES = {
    nairobi: {
        name: 'Nairobi Metro',
        counties: ['Nairobi'],
        standardFee: 300,
        expressFee: 800,
        sameDayFee: 1500,
        estimatedStandard: '1-2 business days',
        estimatedExpress: 'Same day (order before 12PM)',
        estimatedSameDay: 'Today (order before 12PM)'
    },
    major_cities: {
        name: 'Major Cities',
        counties: ['Mombasa', 'Kisumu', 'Nakuru', 'Eldoret', 'Thika', 'Machakos', 'Kikuyu'],
        standardFee: 500,
        expressFee: 1200,
        sameDayFee: 2000,
        estimatedStandard: '2-3 business days',
        estimatedExpress: '1-2 business days',
        estimatedSameDay: 'Next day'
    },
    other_kenya: {
        name: 'Rest of Kenya',
        counties: [], // All other counties
        standardFee: 700,
        expressFee: 1500,
        sameDayFee: 2500,
        estimatedStandard: '3-5 business days',
        estimatedExpress: '2-3 business days',
        estimatedSameDay: 'Not available'
    },
    international: {
        name: 'International',
        countries: [], // All other countries
        standardFee: 3000,
        expressFee: 8000,
        estimatedStandard: '7-14 business days',
        estimatedExpress: '3-5 business days'
    }
};

// Cache for shipping methods
let shippingMethodsCache = null;
let shippingMethodsCacheTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Get all active shipping methods from database with fallback to defaults
 */
async function getShippingMethods() {
    const now = Date.now();
    if (shippingMethodsCache && (now - shippingMethodsCacheTime) < CACHE_DURATION) {
        return shippingMethodsCache;
    }
    
    try {
        const methods = await ShippingMethod.find({ isActive: true })
            .sort({ sortOrder: 1, baseFee: 1 })
            .lean();
        
        if (methods.length > 0) {
            shippingMethodsCache = methods;
            shippingMethodsCacheTime = Date.now();
            return methods;
        }
    } catch (err) {
        console.error('Error fetching shipping methods from DB:', err);
    }
    
    // Fallback to defaults
    const defaultMethods = Object.values(DEFAULT_SHIPPING_CONFIG).map((method, index) => ({
        _id: `default-${method.type}`,
        ...method,
        sortOrder: index
    }));
    
    shippingMethodsCache = defaultMethods;
    shippingMethodsCacheTime = Date.now();
    return defaultMethods;
}

/**
 * Calculate shipping cost based on address, items, and method
 */
async function calculateShipping({ address, items, subtotal, methodId, couponCode }) {
    try {
        const methods = await getShippingMethods();
        
        let selectedMethod;
        if (methodId) {
            selectedMethod = await ShippingMethod.findById(methodId).lean();
        } else {
            // Auto-select cheapest available method
            selectedMethod = await ShippingMethod.findOne({ 
                isActive: true, 
                isDefault: true 
            }).lean();
        }
        
        if (!selectedMethod) {
            selectedMethod = DEFAULT_SHIPPING_CONFIG.standard;
        }
        
        // Calculate base fee
        let fee = selectedMethod.baseFee || 0;
        
        // Apply zone-based pricing
        const zone = determineShippingZone(address);
        if (selectedMethod.zones && selectedMethod.zones.length > 0) {
            const zoneConfig = selectedMethod.zones.find(z => 
                z.isActive && 
                (z.counties?.includes(address.county) || 
                 z.cities?.includes(address.city) ||
                 z.countries?.includes(address.country))
            );
            if (matchingZone) {
                fee = matchingZone.fee;
            }
        }
        
        // Apply per-kg and per-item fees
        const totalWeight = await calculateTotalWeight(items);
        const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
        
        fee += (selectedMethod.perKgFee || 0) * totalWeight;
        fee += (selectedMethod.perItemFee || 0) * totalItems;
        
        // Check free shipping threshold
        const settings = await Settings.findOne();
        const freeThreshold = selectedMethod.freeShippingThreshold || 0;
        const cartSubtotal = subtotal || 0;
        
        if (cartSubtotal >= freeThreshold && freeThreshold > 0) {
            fee = 0;
        }
        
        // Check minimum order value
        if (selectedMethod.minOrderValue && subtotal < selectedMethod.minOrderValue) {
            return {
                available: false,
                reason: `Minimum order value of Ksh ${selectedMethod.minOrderValue} required`
            };
        }
        
        // Check max weight
        const totalWeightKg = await calculateTotalWeight(items);
        if (selectedMethod.maxWeight && totalWeightKg > selectedMethod.maxWeight) {
            return {
                available: false,
                reason: `Order exceeds maximum weight of ${selectedMethod.maxWeight}kg`
            };
        }
        
        // Check dimensions
        if (selectedMethod.maxDimensions) {
            // Would need item dimensions to check
        }
        
        // Apply coupon discount on shipping
        let finalFee = fee;
        if (couponCode) {
            // Check if coupon has free shipping
            const Coupon = require('../models/Coupon');
            const coupon = await Coupon.findOne({ code: couponCode.toUpperCase() });
            if (coupon && coupon.discountType === 'free_shipping') {
                return {
                    ...selectedMethod,
                    fee: 0,
                    originalFee: fee,
                    discount: fee,
                    freeShipping: true
                };
            }
        }
        
        // Estimate delivery date
        const estimatedDate = calculateEstimatedDelivery(selectedMethod);
        
        return {
            ...selectedMethod,
            fee: Math.round(finalFee),
            estimatedDays: estimateDays(selectedMethod, address),
            estimatedDeliveryDate: estimatedDate,
            available: true,
            originalFee: fee,
            discount: fee - finalFee
        };
    } catch (err) {
        console.error('Calculate shipping error:', err);
        return {
            available: false,
            reason: 'Failed to calculate shipping'
        };
    }
}

/**
 * Determine shipping zone based on address
 */
function determineShippingZone(address) {
    if (!address) return 'international';
    
    const county = (address.county || '').toLowerCase();
    const city = (address.city || '').toLowerCase();
    const country = (address.country || 'Kenya').toLowerCase();
    
    if (country !== 'kenya') {
        return 'international';
    }
    
    if (county === 'nairobi' || city === 'nairobi') {
        return 'nairobi';
    }
    
    const majorCities = ['mombasa', 'kisumu', 'nakuru', 'eldoret', 'thika', 'machakos', 'kikuyu', 'ruiru', 'ngong', 'kitale', 'malindi', 'naivasha'];
    if (majorCities.some(c => city.includes(c) || county.includes(c))) {
        return 'major_cities';
    }
    
    return 'other_kenya';
}

/**
 * Calculate total weight of items in kg
 */
async function calculateTotalWeight(items) {
    if (!items || !items.length) return 0;
    
    let totalWeight = 0;
    for (const item of items) {
        const product = await Product.findById(item.productId).select('weight').lean();
        const weight = product?.weight || 0.5; // Default 0.5kg per item
        totalWeight += (weight || 0.5) * (item.quantity || 1);
    }
    return totalWeight;
}

/**
 * Calculate estimated delivery date
 */
function calculateEstimatedDelivery(method, address = {}) {
    const now = new Date();
    const businessDays = getBusinessDays(method, address);
    const cutoffHour = 14; // 2 PM cutoff
    const now = new Date();
    const currentHour = now.getHours();
    
    let deliveryDate = new Date();
    
    // If past cutoff, start counting from next business day
    if (currentHour >= 14) {
        deliveryDate.setDate(deliveryDate.getDate() + 1);
    }
    
    let daysAdded = 0;
    while (daysAdded < businessDays) {
        deliveryDate.setDate(deliveryDate.getDate() + 1);
        // Skip weekends
        if (deliveryDate.getDay() !== 0 && deliveryDate.getDay() !== 6) {
            daysAdded++;
        }
    }
    
    // Skip holidays (would need holiday calendar)
    
    return deliveryDate;
}

/**
 * Get business days for delivery method and address
 */
function getBusinessDays(method, address) {
    if (method.type === 'same-day') return 0;
    if (method.type === 'express') return 1;
    if (method.type === 'pickup') return 0;
    
    // Standard delivery
    const zone = determineShippingZone({});
    switch (zone) {
        case 'nairobi': return 2;
        case 'major_cities': return 3;
        case 'other_kenya': return 5;
        case 'international': return 10;
        default: return 5;
    }
}

/**
 * Get estimated days string for display
 */
function estimateDays(method, address) {
    if (method.type === 'pickup') return 'Ready in 2-4 hours';
    if (method.type === 'same-day') return 'Today (order before 2PM)';
    if (method.type === 'express') return '1-2 business days';
    
    const zone = determineShippingZone({});
    switch (zone) {
        case 'nairobi': return '1-2 business days';
        case 'major_cities': return '2-3 business days';
        case 'other_kenya': return '3-5 business days';
        case 'international': return '7-14 business days';
        default: return '3-7 business days';
    }
}

/**
 * Get shipping options for a specific address and cart
 */
async function getShippingOptions({ address, subtotal, items, couponCode }) {
    try {
        const methods = await ShippingMethod.find({ isActive: true })
            .sort({ baseFee: 1 })
            .lean();
        
        const options = [];
        for (const method of methods) {
            const result = await calculateShipping({
                address,
                items: [], // Would pass actual items
                subtotal,
                methodId: method._id,
                couponCode: null
            });
            
            if (result.available) {
                options.push({
                    methodId: method._id,
                    name: method.name,
                    type: method.type,
                    fee: result.fee,
                    originalFee: method.baseFee,
                    discount: result.discount || 0,
                    freeShipping: result.freeShipping || false,
                    estimatedDays: estimateDays(method, address),
                    estimatedDeliveryDate: calculateEstimatedDelivery(method, address),
                    provider: method.courier || method.provider,
                    trackingAvailable: method.supportsTracking,
                    codAvailable: method.supportsCOD
                });
            }
        }
        
        // Sort by fee
        options.sort((a, b) => a.fee - b.fee);
        
        return options;
    } catch (err) {
        console.error('Get shipping options error:', err);
        // Fallback to defaults
        return Object.values(DEFAULT_SHIPPING_CONFIG).map((method, index) => ({
            ...method,
            _id: `default-${method.type}`,
            sortOrder: index
        }));
    }
}

/**
 * Estimate delivery date for display
 */
function estimateDeliveryDate(method) {
    const date = calculateEstimatedDelivery(method, {});
    return date.toLocaleDateString('en-KE', { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric' 
    });
}

/**
 * Get delivery estimate for a specific address
 */
async function getDeliveryEstimate({ address, methodId, items }) {
    try {
        const method = await ShippingMethod.findById(methodId).lean();
        if (!method) return null;
        
        const estimate = await DeliveryEstimate.findOne({
            shippingMethodId: methodId,
            'toLocation.country': address.country || 'Kenya',
            'toLocation.county': address.county,
            isActive: true
        }).lean();
        
        if (estimate) {
            return {
                estimatedDays: estimate.estimatedDays,
                minDays: estimate.minDays,
                maxDays: estimate.maxDays,
                estimatedDate: calculateEstimatedDelivery(method, address),
                confidence: estimate.confidence,
                cutoffTime: estimate.cutoffTime
            };
        }
        
        // Fallback to method defaults
        return {
            estimatedDays: parseInt(method.estimatedDays) || 3,
            estimatedDate: calculateEstimatedDelivery(method, address),
            confidence: 80
        };
    } catch (err) {
        console.error('Get delivery estimate error:', err);
        return {
            estimatedDays: 3,
            estimatedDate: calculateEstimatedDelivery({}, address)
        };
    }
}

/**
 * Get shipping zones for a method
 */
async function getShippingZones(methodId) {
    const method = await ShippingMethod.findById(methodId).lean();
    return method?.zones || [];
}

/**
 * Create or update shipping method
 */
async function createShippingMethod(data) {
    return ShippingMethod.create(data);
}

async function updateShippingMethod(id, data) {
    return ShippingMethod.findByIdAndUpdate(id, data, { new: true, runValidators: true });
}

async function deleteShippingMethod(id) {
    return ShippingMethod.findByIdAndDelete(id);
}

/**
 * Get shipping analytics
 */
async function getShippingAnalytics(days = 30) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    const stats = await Order.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        {
            $group: {
                _id: '$deliveryMethod.type',
                count: { $sum: 1 },
                totalFee: { $sum: '$deliveryFee' },
                avgFee: { $avg: '$deliveryFee' },
                avgDays: { $avg: '$estimatedDeliveryDays' }
            }
        });
    
    return stats;
}

module.exports = {
    calculateShipping,
    getShippingMethods,
    getShippingOptions,
    getShippingMethods: getShippingMethods,
    getDeliveryEstimate,
    getShippingAnalytics,
    createShippingMethod,
    updateShippingMethod,
    deleteShippingMethod,
    getShippingZones,
    calculateShipping,
    estimateDelivery: estimateDelivery,
    calculateDeliveryDate,
    estimateDays,
    DEFAULT_SHIPPING_CONFIG,
    KENYA_SHIPPING_ZONES
};