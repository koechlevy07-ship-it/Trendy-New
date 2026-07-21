const express = require('express');
const router = express.Router();
const { CheckoutSession, PaymentTransaction, Invoice, ShippingMethod, DeliveryEstimate, FraudCheck, CheckoutAnalytics, SavedAddress, PaymentMethod } = require('../models/Checkout');
const Product = require('../models/Product');
const User = require('../models/User');
const Order = require('../models/Order');
const Coupon = require('../models/Coupon');
const Cart = require('../models/Cart');
const Settings = require('../models/Settings');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');
const crypto = require('crypto');

// Import payment services (to be implemented)
const { processMpesaPayment, verifyMpesaPayment, processStripePayment, processPaypalPayment } = require('../services/paymentService');
const { calculateShipping, estimateDelivery } = require('../services/shippingService');
const { calculateTax } = require('../services/taxService');
const { runFraudChecks } = require('../services/fraudService');
const { sendOrderConfirmation, sendCheckoutAbandoned, sendPaymentConfirmation } = require('../services/emailService');
const { generateInvoicePDF, sendInvoiceEmail } = require('../services/invoiceService');

// Helper functions
function generateSessionToken() {
    return crypto.randomBytes(32).toString('hex');
}

function generateOrderNumber() {
    const ts = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    return 'TW-' + ts + rand;
}

function generateInvoiceNumber() {
    const ts = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    return 'INV-' + ts + rand;
}

function generateTransactionId(provider) {
    const ts = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
    return provider.toUpperCase() + '-' + ts + rand;
}

// ============================================================
// CHECKOUT SESSION ROUTES
// ============================================================

// POST /api/checkout – Initialize checkout session
router.post('/', async (req, res) => {
    try {
        const { items, userId, guestId, shippingAddress, billingAddress, deliveryMethod, paymentMethod, couponCode, notes, metadata } = req.body;
        
        // Validate items
        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, message: 'Cart is empty' });
        }

        // Validate and enrich items with current product data
        const enrichedItems = [];
        let subtotal = 0;
        
        for (const item of items) {
            const product = await Product.findById(item.productId || item.id);
            if (!product) {
                return res.status(400).json({ success: false, message: `Product not found: ${item.productId || item.id}` });
            }
            
            if (product.stock < (item.quantity || 1)) {
                return res.status(400).json({ success: false, message: `Insufficient stock for "${product.name}"` });
            }
            
            const price = product.price;
            const quantity = item.quantity || 1;
            const lineTotal = price * (item.quantity || 1);
            
            enrichedItems.push({
                productId: product._id,
                name: product.name,
                price: product.price,
                originalPrice: product.originalPrice || 0,
                quantity: item.quantity || 1,
                size: item.size || '',
                color: item.color || '',
                image: product.images?.[0] || '',
                sku: product.sku || '',
                category: product.category || '',
                brand: product.brand || '',
                lineTotal: product.price * (item.quantity || 1),
                discount: 0,
                originalPrice: product.originalPrice || 0,
                deliveryEstimate: product.deliveryEstimate || '2-5 business days'
            });
            
            subtotal += product.price * (item.quantity || 1);
        }
        
        // Create checkout session
        const sessionToken = generateSessionToken();
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
        
        const checkoutData = {
            sessionToken,
            status: 'active',
            step: 1,
            items: enrichedItems,
            subtotal,
            currency: 'KES',
            expiresAt: new Date(Date.now() + 30 * 60 * 1000)
        };
        
        if (req.user) {
            checkoutData.userId = req.user.id;
        } else if (req.body.guestId) {
            checkoutData.guestId = req.body.guestId;
        } else {
            checkoutData.guestId = crypto.randomUUID();
        }
        
        const session = await CheckoutSession.create(checkoutData);
        
        res.status(201).json({
            success: true,
            data: {
                sessionToken: session.sessionToken,
                step: session.step,
                items: session.items,
                subtotal: session.subtotal,
                total: session.total,
                expiresAt: session.expiresAt
            }
        });
    } catch (err) {
        console.error('Checkout init error:', err);
        res.status(500).json({ success: false, message: 'Failed to initialize checkout' });
    }
});

// GET /api/checkout/:sessionToken – Get checkout session
router.get('/:sessionToken', async (req, res) => {
    try {
        const session = await CheckoutSession.findOne({ sessionToken: req.params.sessionToken })
            .populate('appliedCoupon')
            .populate('deliveryMethod');
        
        if (!session) {
            return res.status(404).json({ success: false, message: 'Checkout session not found' });
        }
        
        // Check if session is expired
        if (session.expiresAt && session.expiresAt < new Date()) {
            session.status = 'expired';
            await session.save();
            return res.status(410).json({ success: false, message: 'Checkout session expired' });
        }
        
        // Refresh item prices and stock
        const updatedItems = [];
        for (const item of session.items) {
            const product = await Product.findById(item.productId);
            if (product) {
                updatedItems.push({
                    ...item.toObject(),
                    price: product.price,
                    originalPrice: product.originalPrice || 0,
                    inStock: product.stock > 0,
                    stock: product.stock
                });
            }
        }
        
        // Recalculate totals
        const subtotal = session.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const couponDiscount = session.couponDiscount || 0;
        const deliveryFee = session.deliveryFee || 0;
        const tax = session.tax || 0;
        const total = subtotal + (session.deliveryFee || 0) + (session.tax || 0) - (session.couponDiscount || 0);
        
        res.json({
            success: true,
            data: {
                sessionToken: session.sessionToken,
                step: session.step,
                status: session.status,
                items: session.items,
                subtotal: session.subtotal,
                deliveryFee: session.deliveryFee,
                tax: session.tax,
                discount: session.discount,
                couponDiscount: session.couponDiscount,
                total: session.total,
                currency: session.currency,
                shippingAddress: session.shippingAddress,
                billingAddress: session.billingAddress,
                deliveryMethod: session.deliveryMethod,
                paymentMethod: session.paymentMethod,
                couponCode: session.couponCode,
                couponDiscount: session.couponDiscount,
                appliedCoupon: session.appliedCoupon,
                estimatedDeliveryDate: session.estimatedDeliveryDate,
                expiresAt: session.expiresAt
            }
        });
    } catch (err) {
        console.error('Get checkout error:', err);
        res.status(500).json({ success: false, message: 'Failed to retrieve checkout' });
    }
});

// PUT /api/checkout/:sessionToken – Update checkout session
router.put('/:sessionToken', async (req, res) => {
    try {
        const session = await CheckoutSession.findOne({ sessionToken: req.params.sessionToken });
        
        if (!session) {
            return res.status(404).json({ success: false, message: 'Checkout session not found' });
        }
        
        if (session.status !== 'active' && session.status !== 'payment_pending') {
            return res.status(400).json({ success: false, message: 'Checkout session is not active' });
        }
        
        // Update allowed fields
        const allowedUpdates = [
            'step', 'shippingAddress', 'billingAddress', 
            'deliveryMethod', 'paymentMethod', 'couponCode',
            'notes', 'customerNotes', 'metadata'
        ];
        
        for (const field of allowedUpdates) {
            if (req.body[field] !== undefined) {
                session[field] = req.body[field];
            }
        }
        
        // If step increased, update step
        if (req.body.step && req.body.step > session.step) {
            session.step = req.body.step;
        }
        
        await session.save();
        
        res.json({ success: true, data: session });
    } catch (err) {
        console.error('Update checkout error:', err);
        res.status(500).json({ success: false, message: 'Failed to update checkout' });
    }
});

// POST /api/checkout/:sessionToken/validate – Validate checkout before payment
router.post('/:sessionToken/validate', async (req, res) => {
    try {
        const session = await CheckoutSession.findOne({ sessionToken: req.params.sessionToken })
            .populate('appliedCoupon');
        
        if (!session) {
            return res.status(404).json({ success: false, message: 'Checkout session not found' });
        }
        
        if (session.status !== 'active') {
            return res.status(400).json({ success: false, message: 'Checkout session is not active' });
        }
        
        // Validate all required steps are complete
        const errors = [];
        
        if (!session.shippingAddress) {
            errors.push('Shipping address is required');
        }
        if (!session.deliveryMethod) {
            errors.push('Delivery method is required');
        }
        if (!session.paymentMethod) {
            errors.push('Payment method is required');
        }
        if (!session.shippingAddress?.fullName) {
            errors.push('Recipient name is required');
        }
        if (!session.shippingAddress?.phone) {
            errors.push('Phone number is required');
        }
        if (!session.shippingAddress?.city) {
            errors.push('City is required');
        }
        if (!session.shippingAddress?.street) {
            errors.push('Street address is required');
        }
        
        // Validate stock
        for (const item of session.items) {
        //     const product = await Product.findById(item.productId);
        //     if (!product || product.stock < item.quantity) {
        //         errors.push(`Insufficient stock for ${item.name}`);
        //     }
        // }
        
        // Validate coupon if applied
        if (session.couponCode) {
            const coupon = await Coupon.findOne({ code: session.couponCode.toUpperCase() });
            if (!coupon) {
                errors.push('Coupon code is invalid');
            } else {
                const cartObj = {
                    subtotal: session.subtotal,
                    items: session.items.map(i => ({
                        productId: i.productId,
                        quantity: i.quantity,
                        price: i.price,
                        category: i.category,
                        brand: i.brand
                    })),
                    shipping: session.deliveryFee || 0
                };
                const validation = coupon.isValid(cartObj, req.user);
                if (!validation.valid) {
                    errors.push(validation.message);
                }
            }
        }
        
        if (errors.length > 0) {
            return res.status(400).json({ success: false, message: 'Validation failed', errors });
        }
        
        // Run fraud checks
        const fraudResults = await runFraudChecks({
            checkoutSession: session,
            userId: req.user?.id,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });
        
        if (fraudResults.block) {
            return res.status(403).json({ 
                success: false, 
                message: 'Transaction blocked for security reasons',
                fraudCheck: fraudResults
            });
        }
        
        if (fraudResults.challenge) {
            return res.status(400).json({ 
                success: false, 
                message: 'Additional verification required',
                fraudCheck: fraudResults
            });
        }
        
        res.json({ 
            success: true, 
            message: 'Checkout validated successfully',
            fraudCheck: fraudResults
        });
    } catch (err) {
        console.error('Validate checkout error:', err);
        res.status(500).json({ success: false, message: 'Validation failed' });
    }
});

// POST /api/checkout/:sessionToken/coupon – Apply coupon
router.post('/:sessionToken/coupon', async (req, res) => {
    try {
        const { code } = req.body;
        if (!code) {
            return res.status(400).json({ success: false, message: 'Coupon code required' });
        }
        
        const session = await CheckoutSession.findOne({ sessionToken: req.params.sessionToken });
        if (!session) {
            return res.status(404).json({ success: false, message: 'Checkout session not found' });
        }
        
        const coupon = await Coupon.findOne({ code: code.toUpperCase().trim() });
        if (!coupon) {
            return res.status(404).json({ success: false, message: 'Invalid or expired coupon' });
        }
        
        // Build cart object for validation
        const cartObj = {
            subtotal: session.subtotal,
            items: session.items.map(i => ({
                productId: i.productId,
                quantity: i.quantity,
                price: i.price,
                category: i.category,
                brand: i.brand
            })),
            shipping: session.deliveryFee || 0
        };
        
        const validation = coupon.isValid(cartObj, req.user);
        if (!validation.valid) {
            return res.status(400).json({ success: false, message: validation.message });
        }
        
        const discount = coupon.calculateDiscount(cartObj);
        
        // Apply coupon
        session.couponCode = code.toUpperCase();
        session.couponDiscount = discount;
        session.appliedCoupon = coupon._id;
        await session.save();
        
        // Recalculate totals
        const subtotal = session.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const deliveryFee = session.deliveryFee || 0;
        const tax = session.tax || 0;
        const total = subtotal + (session.deliveryFee || 0) + (session.tax || 0) - discount;
        
        res.json({
            success: true,
            message: 'Coupon applied successfully',
            data: {
                coupon: { code: coupon.code, discount, discountType: coupon.discountType },
                summary: { subtotal: session.subtotal, discount, total: subtotal + (session.deliveryFee || 0) - discount }
            }
        });
    } catch (err) {
        console.error('Apply coupon error:', err);
        res.status(500).json({ success: false, message: 'Failed to apply coupon' });
    }
});

// DELETE /api/checkout/:sessionToken/coupon – Remove coupon
router.delete('/:sessionToken/coupon', async (req, res) => {
    try {
        const session = await CheckoutSession.findOne({ sessionToken: req.params.sessionToken });
        if (!session) {
            return res.status(404).json({ success: false, message: 'Checkout session not found' });
        }
        
        session.couponCode = '';
        session.couponDiscount = 0;
        session.appliedCoupon = null;
        await session.save();
        
        res.json({ success: true, message: 'Coupon removed' });
    } catch (err) {
        console.error('Remove coupon error:', err);
        res.status(500).json({ success: false, message: 'Failed to remove coupon' });
    }
});

// ============================================================
// SHIPPING & DELIVERY ROUTES
// ============================================================

// GET /api/checkout/shipping-methods – Get available shipping methods
router.get('/shipping-methods', async (req, res) => {
    try {
        const methods = await ShippingMethod.find({ isActive: true })
            .sort({ sortOrder: 1, baseFee: 1 })
            .lean();
        
        res.json({ success: true, data: methods });
    } catch (err) {
        console.error('Get shipping methods error:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch shipping methods' });
    }
});

// GET /api/checkout/shipping-options – Get shipping options for address
router.post('/shipping-options', async (req, res) => {
    try {
        const { address, subtotal } = req.body;
        
        if (!address || !address.city) {
            return res.status(400).json({ success: false, message: 'City is required' });
        }
        
        const methods = await ShippingMethod.find({ isActive: true })
            .sort({ baseFee: 1 })
            .lean();
        
        const options = [];
        for (const method of methods) {
            // Check if method is available for this location
            let available = true;
            let fee = method.baseFee;
            let estimatedDays = method.estimatedDays;
            
            // Check zone restrictions
            if (method.zones && method.zones.length > 0) {
                const matchingZone = method.zones.find(zone => 
                    zone.isActive && 
                    (zone.counties?.includes(req.body.address?.county) || 
                     zone.cities?.includes(req.body.address?.city))
                );
                if (!matchingZone) {
                    available = false;
                } else {
                    fee = matchingZone.fee || method.baseFee;
                    estimatedDays = matchingZone.estimatedDays || method.estimatedDays;
                }
            }
            
            // Apply free shipping threshold
            if (req.body.subtotal >= (method.freeShippingThreshold || 0)) {
                fee = 0;
            }
            
            if (available) {
                options.push({
                    ...method,
                    fee,
                    estimatedDays,
                    available: true
                });
            }
        }
        
        // Add free shipping if threshold met
        const settings = await Settings.findOne();
        const freeThreshold = settings?.freeDeliveryThreshold || 15000;
        if (req.body.subtotal >= freeThreshold) {
            const freeShipping = options.find(o => o.type === 'standard');
            if (freeShipping) {
                freeShipping.fee = 0;
                freeShipping.label = 'Free Standard Delivery';
            }
        }
        
        res.json({ success: true, data: options.filter(o => o.available) });
    } catch (err) {
        console.error('Shipping options error:', err);
        res.status(500).json({ success: false, message: 'Failed to calculate shipping options' });
    }
});

// POST /api/checkout/:sessionToken/delivery-method – Set delivery method
router.post('/:sessionToken/delivery-method', async (req, res) => {
    try {
        const { methodId } = req.body;
        
        const session = await CheckoutSession.findOne({ sessionToken: req.params.sessionToken });
        if (!session) {
            return res.status(404).json({ success: false, message: 'Checkout session not found' });
        }
        
        const method = await ShippingMethod.findById(methodId);
        if (!method || !method.isActive) {
            return res.status(400).json({ success: false, message: 'Invalid delivery method' });
        }
        
        // Calculate fee based on subtotal
        let fee = method.baseFee;
        if (session.subtotal >= (method.freeShippingThreshold || 0)) {
            fee = 0;
        }
        
        session.deliveryMethod = {
            type: method.type,
            label: method.name,
            fee,
            estimatedDays: method.estimatedDays,
            provider: method.courier || method.provider
        };
        session.deliveryFee = fee;
        
        // Estimate delivery date
        session.estimatedDeliveryDate = calculateDeliveryDate(method);
        
        // Move to next step if on step 2
        if (session.step <= 2) {
            session.step = 3;
        }
        
        await session.save();
        
        res.json({ 
            success: true, 
            message: 'Delivery method updated',
            data: { deliveryMethod: session.deliveryMethod, deliveryFee: fee }
        });
    } catch (err) {
        console.error('Set delivery method error:', err);
        res.status(500).json({ success: false, message: 'Failed to set delivery method' });
    }
});

// ============================================================
// PAYMENT ROUTES
// ============================================================

// GET /api/checkout/payment-methods – Get available payment methods
router.get('/payment-methods', async (req, res) => {
    try {
        const settings = await Settings.findOne();
        const methods = [];
        
        // Get configured payment methods from settings
        const configuredMethods = settings?.paymentMethods || [
            'mpesa', 'stripe', 'paypal', 'visa', 'mastercard', 
            'apple-pay', 'google-pay', 'bank-transfer', 'cash-on-delivery'
        ];
        
        // Load payment method configurations
        const configs = await PaymentMethodConfig.find({ isEnabled: true })
            .sort({ sortOrder: 1 })
            .lean();
        
        for (const config of configs) {
            if (configuredMethods.includes(config.type)) {
                methods.push({
                    type: config.type,
                    label: config.label,
                    fees: config.fees,
                    displayIcon: config.displayIcon,
                    displayColor: config.displayColor,
                    requiresRedirect: config.requiresRedirect,
                    supportsRefunds: config.supportsRefunds,
                    processingTime: config.processingTime,
                    requirements: config.requirements
                });
            }
        }
        
        res.json({ success: true, data: methods });
    } catch (err) {
        console.error('Get payment methods error:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch payment methods' });
    }
});

// POST /api/checkout/:sessionToken/payment-method – Set payment method
router.post('/:sessionToken/payment-method', async (req, res) => {
    try {
        const { methodType, saveMethod } = req.body;
        
        const session = await CheckoutSession.findOne({ sessionToken: req.params.sessionToken });
        if (!session) {
            return res.status(404).json({ success: false, message: 'Checkout session not found' });
        }
        
        // Validate payment method
        const config = await PaymentMethodConfig.findOne({ type: req.body.methodType, isEnabled: true });
        if (!config) {
            return res.status(400).json({ success: false, message: 'Invalid payment method' });
        }
        
        // Calculate fees
        let fees = { gatewayFee: 0, platformFee: 0, totalFees: 0 };
        if (config.fees) {
            fees.gatewayFee = config.fees.fixed + (session.total * (config.fees.percentage || 0) / 100);
            fees.platformFee = 0; // Platform fee if any
            fees.totalFees = fees.gatewayFee + fees.platformFee;
        }
        
        session.paymentMethod = {
            type: req.body.methodType,
            label: config.label,
            config: config.config,
            fees
        };
        
        // Move to review step if on payment step
        if (session.step <= 3) {
            session.step = 4;
        }
        
        await session.save();
        
        res.json({ 
            success: true, 
            message: 'Payment method set',
            data: { paymentMethod: session.paymentMethod }
        });
    } catch (err) {
        console.error('Set payment method error:', err);
        res.status(500).json({ success: false, message: 'Failed to set payment method' });
    }
});

// POST /api/payment/mpesa – Initiate M-Pesa STK Push
router.post('/payment/mpesa', async (req, res) => {
    try {
        const { checkoutSessionToken, phoneNumber, amount } = req.body;
        
        const session = await CheckoutSession.findOne({ sessionToken: checkoutSessionToken });
        if (!session) {
            return res.status(404).json({ success: false, message: 'Checkout session not found' });
        }
        
        const amount = amount || session.total;
        
        // Create payment transaction record
        const transaction = await PaymentTransaction.create({
            checkoutSessionId: session._id,
            userId: req.user?.id,
            transactionId: generateTransactionId('MPESA'),
            paymentRef: `MPESA-${session.sessionToken}-${Date.now()}`,
            provider: 'mpesa',
            amount,
            currency: 'KES',
            status: 'initiated',
            paymentMethod: 'mpesa',
            fees: {
                gatewayFee: 0,
                platformFee: 0,
                totalFees: 0
            },
            netAmount: amount,
            metadata: {
                phoneNumber,
                checkoutSessionToken: session.sessionToken
            },
            expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
        });
        
        // Initiate M-Pesa STK Push
        const result = await processMpesaPayment({
            phoneNumber,
            amount,
            accountReference: session.sessionToken,
            transactionDesc: `Order payment for Trendy Wardrobe`,
            callbackUrl: `${process.env.API_URL}/api/payment/callback/mpesa`,
            transactionId: transaction.transactionId
        });
        
        if (!result.success) {
            transaction.status = 'failed';
            transaction.gatewayError = result.error;
            await transaction.save();
            return res.status(400).json({ success: false, message: result.error || 'M-Pesa payment initiation failed' });
        }
        
        // Update transaction with gateway response
        transaction.status = 'pending';
        transaction.gatewayResponse = result;
        transaction.providerResponse = result;
        await transaction.save();
        
        // Update checkout session
        const session = await CheckoutSession.findOne({ sessionToken: req.body.checkoutSessionToken });
        session.paymentStatus = 'processing';
        session.paymentTransactionId = transaction._id;
        await session.save();
        
        res.json({
            success: true,
            message: 'M-Pesa STK Push sent',
            data: {
                transactionId: transaction.transactionId,
                checkoutRequestId: result.checkoutRequestId,
                merchantRequestId: result.merchantRequestId,
                customerMessage: result.customerMessage
            }
        });
    } catch (err) {
        console.error('M-Pesa payment error:', err);
        res.status(500).json({ success: false, message: 'M-Pesa payment failed' });
    }
});

// POST /api/payment/verify – Verify payment status
router.post('/payment/verify', async (req, res) => {
    try {
        const { transactionId, provider } = req.body;
        
        const transaction = await PaymentTransaction.findOne({ transactionId })
            .populate('checkoutSessionId');
        
        if (!transaction) {
            return res.status(404).json({ success: false, message: 'Transaction not found' });
        }
        
        let verificationResult;
        
        if (provider === 'mpesa') {
            verificationResult = await verifyMpesaPayment(transaction.transactionId);
        } else if (provider === 'stripe') {
            // verificationResult = await verifyStripePayment(transaction.transactionId);
        } else if (provider === 'paypal') {
            // verificationResult = await verifyPaypalPayment(transaction.transactionId);
        }
        
        if (!verificationResult || !verificationResult.success) {
            return res.status(400).json({ 
                success: false, 
                message: 'Payment verification failed',
                details: verificationResult?.error
            });
        }
        
        // Update transaction
        transaction.status = 'completed';
        transaction.completedAt = new Date();
        transaction.gatewayResponse = verificationResult;
        await transaction.save();
        
        // Update checkout session
        const session = await CheckoutSession.findById(transaction.checkoutSessionId);
        if (session) {
            session.paymentStatus = 'completed';
            session.paymentTransactionId = transaction._id;
            session.status = 'completed';
            session.completedAt = new Date();
            await session.save();
            
            // Create order from checkout session
            const order = await createOrderFromCheckout(session);
            
            // Send confirmation emails
            const user = await User.findById(session.userId);
            if (user) {
                sendOrderConfirmation(order, user).catch(() => {});
            }
            
            // Clear cart
            const Cart = require('../models/Cart');
            await Cart.findOneAndUpdate(
                { userId: session.userId },
                { $set: { items: [], couponCode: '', couponDiscount: 0 } }
            );
            
            // Award loyalty points
            await awardLoyaltyPoints(session);
        }
        
        res.json({
            success: true,
            message: 'Payment verified successfully',
            data: {
                transactionId: transaction.transactionId,
                orderId: order?._id,
                orderNumber: order?.orderNumber
            }
        });
    } catch (err) {
        console.error('Payment verification error:', err);
        res.status(500).json({ success: false, message: 'Payment verification failed' });
    }
});

// POST /api/payment/callback – Payment gateway callbacks
router.post('/payment/callback/:provider', async (req, res) => {
    try {
        const { provider } = req.params;
        
        if (provider === 'mpesa') {
            // Handle M-Pesa callback
            const callback
        }
    } catch (err) {
        console.error('Payment callback error:', err);
        res.status(500).json({ success: false, message: 'Callback processing failed' });
    }
});

// GET /api/payment/status/:id – Get payment status
router.get('/payment/status/:id', async (req, res) => {
    try {
        const transaction = await PaymentTransaction.findById(req.params.id)
            .populate('checkoutSessionId');
        
        if (!transaction) {
            return res.status(404).json({ success: false, message: 'Transaction not found' });
        }
        
        res.json({ success: true, data: transaction });
    } catch (err) {
        console.error('Payment status error:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch payment status' });
    }
});

// ============================================================
// ORDER ROUTES
// ============================================================

// POST /api/orders – Create order from checkout
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { checkoutSessionToken } = req.body;
        
        const session = await CheckoutSession.findOne({ sessionToken: checkoutSessionToken })
            .populate('appliedCoupon');
        
        if (!session) {
            return res.status(404).json({ success: false, message: 'Checkout session not found' });
        }
        
        if (session.status !== 'completed' && session.paymentStatus !== 'completed') {
            return res.status(400).json({ success: false, message: 'Checkout not completed' });
        }
        
        // Create order from checkout session
        const order = await createOrderFromCheckout(session);
        
        // Update checkout session
        session.status = 'completed';
        session.orderId = order._id;
        session.completedAt = new Date();
        await session.save();
        
        // Clear cart
        const Cart = require('../models/Cart');
        await Cart.findOneAndUpdate(
            { userId: req.user.id },
            { $set: { items: [], couponCode: '', couponDiscount: 0 } }
        );
        
        // Award loyalty points
        await awardLoyaltyPoints(session);
        
        // Send confirmation
        const user = await User.findById(req.user.id);
        if (user) {
            sendOrderConfirmation(order, await User.findById(session.userId)).catch(() => {});
        }
        
        res.status(201).json({ success: true, data: order });
    } catch (err) {
        console.error('Create order error:', err);
        res.status(500).json({ success: false, message: 'Failed to create order' });
    }
});

// GET /api/orders – List user orders
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { page = 1, limit = 20, status } = req.query;
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
        const skip = (pageNum - 1) * limitNum;
        
        const filter = { user: req.user.id };
        if (status) filter.status = status;
        
        const [orders, total] = await Promise.all([
            Order.find(filter)
                .populate('items.productId', 'name images')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limitNum),
            Order.countDocuments(filter)
        ]);
        
        res.json({
            success: true,
            data: orders,
            pagination: { page: Math.max(1, parseInt(page)), limit: Math.min(50, Math.max(1, parseInt(limit))), total, pages: Math.ceil(total / Math.min(50, Math.max(1, parseInt(limit)))) }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch orders' });
    }
});

// GET /api/orders/:id – Get order details
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id)
            .populate('items.productId', 'name images slug')
            .populate('user', 'name email');
        
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }
        
        // Check authorization
        if (order.user.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }
        
        res.json({ success: true, data: order });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch order' });
    }
});

// PUT /api/orders/:id/status – Update order status (admin)
router.put('/:id/status', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { status, note, trackingNumber } = req.body;
        
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
        
        const oldStatus = order.status;
        
        if (status && status !== oldStatus) {
            if (!isValidTransition(oldStatus, status)) {
                return res.status(400).json({
                    success: false,
                    message: `Cannot transition from "${oldStatus}" to "${status}"`
                });
            }
            
            const adminName = req.user?.name || req.user?.email || 'admin';
            order.status = status;
            order.timeline.push({ 
                status, 
                note: note || `Status updated to ${status}`, 
                admin: adminName, 
                timestamp: new Date() 
            });
            
            if (status === 'cancelled' && oldStatus !== 'cancelled') {
                // Restore inventory
                for (const item of order.items) {
                    await Product.findByIdAndUpdate(item.productId, {
                        $inc: { stock: item.quantity, totalSold: -item.quantity },
                        $set: { inStock: true, soldOut: false }
                    });
                    await logInventoryChange(item.productId, item.quantity, 'cancel', 'Order cancelled by admin', order.orderNumber);
                }
            }
        }
        
        if (trackingNumber !== undefined) order.trackingNumber = trackingNumber;
        if (req.body.note && !status) {
            order.adminNotes = req.body.note;
            order.timeline.push({ 
                status: order.status, 
                note: `Admin note: ${req.body.note}`, 
                admin: req.user?.name || req.user?.email || 'admin', 
                timestamp: new Date() 
            });
        }
        
        await order.save();
        
        // Send status update email
        if (status && status !== oldStatus) {
            const user = await User.findById(order.user).select('name email');
            if (user) sendOrderStatusUpdate(order, user, oldStatus).catch(() => {});
        }
        
        res.json({ success: true, data: order });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to update order status' });
    }
});

// POST /api/orders/:id/cancel – Cancel order
router.post('/:id/cancel', authenticateToken, async (req, res) => {
    try {
        const { reason } = req.body;
        
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
        
        if (order.user.toString() !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }
        
        if (!['pending', 'confirmed'].includes(order.status)) {
            return res.status(400).json({ success: false, message: 'Order cannot be cancelled at this stage' });
        }
        
        order.status = 'cancelled';
        order.cancelReason = reason || '';
        order.timeline.push({ status: 'cancelled', note: reason || 'Cancelled by customer', timestamp: new Date() });
        await order.save();
        
        // Restore inventory
        for (const item of order.items) {
            await Product.findByIdAndUpdate(item.productId, {
                $inc: { stock: item.quantity, totalSold: -item.quantity },
                $set: { inStock: true, soldOut: false }
            });
            await logInventoryChange(item.productId, item.quantity, 'cancel', 'Order cancelled by customer', order.orderNumber);
        }
        
        res.json({ success: true, data: order });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to cancel order' });
    }
});

// POST /api/orders/:id/refund – Request refund
router.post('/:id/refund', authenticateToken, async (req, res) => {
    try {
        const { reason } = req.body;
        
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
        if (order.user.toString() !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }
        if (order.status !== 'delivered') {
            return res.status(400).json({ success: false, message: 'Refund only available for delivered orders' });
        }
        if (order.refundStatus !== 'none') {
            return res.status(400).json({ success: false, message: 'Refund already requested' });
        }
        
        order.refundStatus = 'requested';
        order.refundReason = reason || '';
        order.refundAmount = order.total;
        order.timeline.push({ status: order.status, note: `Refund requested: ${reason || 'No reason provided'}`, timestamp: new Date() });
        await order.save();
        
        res.json({ success: true, data: order });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to request refund' });
    }
});

// ============================================================
// INVOICE ROUTES
// ============================================================

// GET /api/invoices/:id – Get invoice
router.get('/invoices/:id', authenticateToken, async (req, res) => {
    try {
        const invoice = await Invoice.findById(req.params.id)
            .populate('orderId')
            .populate('userId', 'name email');
        
        if (!invoice) {
            return res.status(404).json({ success: false, message: 'Invoice not found' });
        }
        
        if (invoice.userId.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }
        
        res.json({ success: true, data: invoice });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch invoice' });
    }
});

// GET /api/orders/:id/invoice – Get order invoice
router.get('/:id/invoice', authenticateToken, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id)
            .populate('user', 'name email')
            .populate('items.productId', 'name images');
        
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
        if (order.user.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }
        
        // Find or create invoice
        let invoice = await Invoice.findOne({ orderId: order._id });
        if (!invoice) {
            invoice = await createInvoiceFromOrder(order);
        }
        
        res.json({ success: true, data: invoice });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch invoice' });
    }
});

// POST /api/invoices/:id/email – Email invoice
router.post('/invoices/:id/email', authenticateToken, async (req, res) => {
    try {
        const invoice = await Invoice.findById(req.params.id).populate('orderId');
        if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });
        
        const result = await sendInvoiceEmail(invoice);
        if (!result.success) throw new Error(result.error);
        
        invoice.sentAt = new Date();
        invoice.sentTo = [req.body.email || invoice.billingAddress?.email];
        invoice.sentBy = req.user.id;
        await invoice.save();
        
        res.json({ success: true, message: 'Invoice emailed successfully' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to send invoice' });
    }
});

// POST /api/invoices/:id/pdf – Generate invoice PDF
router.post('/invoices/:id/pdf', authenticateToken, async (req, res) => {
    try {
        const invoice = await Invoice.findById(req.params.id).populate('orderId');
        if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });
        
        const pdfUrl = await generateInvoicePDF(invoice);
        invoice.pdfUrl = pdfUrl;
        invoice.pdfGeneratedAt = new Date();
        await invoice.save();
        
        res.json({ success: true, data: { pdfUrl } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to generate PDF' });
    }
});

// ============================================================
// ADMIN CHECKOUT/ORDER ROUTES
// ============================================================

// GET /api/admin/checkout/analytics – Checkout analytics
router.get('/admin/checkout/analytics', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { days = 30 } = req.query;
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        
        const analytics = await CheckoutAnalytics.find({ 
            date: { $gte: startDate } 
        }).sort({ date: 1 }).lean();
        
        // Aggregate stats
        const summary = await CheckoutAnalytics.aggregate([
            { $match: { date: { $gte: startDate } } },
            {
                $group: {
                    _id: null,
                    totalCheckouts: { $sum: '$totalCheckouts' },
                    completedCheckouts: { $sum: '$completedCheckouts' },
                    abandonedCheckouts: { $sum: '$abandonedCheckouts' },
                    totalRevenue: { $sum: '$totalRevenue' },
                    avgOrderValue: { $avg: '$averageOrderValue' },
                    totalEmailsSent: { $sum: '$recoveryEmailsSent' },
                    totalEmailsOpened: { $sum: '$recoveryEmailsOpened' },
                    totalEmailsClicked: { $sum: '$recoveryEmailsClicked' },
                    recoveredCheckouts: { $sum: '$recoveredCheckouts' },
                    recoveryRevenue: { $sum: '$recoveryRevenue' }
                }
            }
        ]);
        
        // By status
        const byStatus = await CheckoutAnalytics.aggregate([
            { $match: { date: { $gte: startDate } } },
            { $group: { _id: '$status', count: { $sum: 1 } } }
        ]);
        
        res.json({
            success: true,
            data: {
                summary: summary[0] || {},
                byStatus,
                daily: analytics,
                conversionRate: summary[0] ? (summary[0].completedCheckouts / summary[0].totalCheckouts * 100).toFixed(2) : 0,
                recoveryRate: summary[0] && summary[0].recoveryEmailsSent > 0 
                    ? (summary[0].recoveryEmailsClicked / summary[0].recoveryEmailsSent * 100).toFixed(2) : 0
            }
        });
    } catch (err) {
        console.error('Checkout analytics error:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch analytics' });
    }
});

// GET /api/admin/checkout/sessions – List checkout sessions
router.get('/admin/checkout/sessions', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { page = 1, limit = 50, status, startDate, endDate } = req.query;
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        const skip = (pageNum - 1) * limitNum;
        
        const filter = {};
        if (status) filter.status = status;
        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) filter.createdAt.$gte = new Date(startDate);
            if (endDate) filter.createdAt.$lte = new Date(endDate);
        }
        
        const [sessions, total] = await Promise.all([
            CheckoutSession.find(filter)
                .populate('userId', 'name email')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limitNum)
                .lean(),
            CheckoutSession.countDocuments(filter)
        ]);
        
        res.json({
            success: true,
            data: sessions,
            pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch checkout sessions' });
    }
});

// GET /api/admin/checkout/abandoned – Get abandoned checkouts
router.get('/admin/checkout/abandoned', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { page = 1, limit = 50, days = 7 } = req.query;
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        const skip = (pageNum - 1) * limitNum;
        
        const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        
        const [sessions, total] = await Promise.all([
            CheckoutSession.find({
                status: { $in: ['active', 'payment_pending', 'payment_failed'] },
                createdAt: { $gte: cutoff },
                $or: [
                    { 'recovery.emailsSent': { $lt: 3 } },
                    { 'recovery.emailsSent': { $exists: false } }
                ]
            })
                .populate('userId', 'name email')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limitNum)
                .lean(),
            CheckoutSession.countDocuments({
                status: { $in: ['active', 'payment_pending', 'payment_failed'] },
                createdAt: { $gte: cutoff }
            })
        ]);
        
        res.json({
            success: true,
            data: sessions,
            pagination: { page: Math.max(1, parseInt(page)), limit: Math.min(100, Math.max(1, parseInt(limit))), total, pages: Math.ceil(total / Math.min(100, Math.max(1, parseInt(limit)))) }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch abandoned checkouts' });
    }
});

// POST /api/admin/checkout/:sessionToken/recover – Send recovery email
router.post('/admin/checkout/:sessionToken/recover', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const session = await CheckoutSession.findOne({ sessionToken: req.params.sessionToken });
        if (!session) {
            return res.status(404).json({ success: false, message: 'Checkout session not found' });
        }
        
        if (!['active', 'payment_pending', 'payment_failed'].includes(session.status)) {
            return res.status(400).json({ success: false, message: 'Checkout session is not recoverable' });
        }
        
        await sendCheckoutAbandoned(session);
        
        session.recoveryEmailsSent = (session.recoveryEmailsSent || 0) + 1;
        session.lastRecoveryEmailAt = new Date();
        await session.save();
        
        res.json({ success: true, message: 'Recovery email sent' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to send recovery email' });
    }
});

// Helper functions
async function createOrderFromCheckout(session) {
    const orderNumber = generateOrderNumber();
    
    const orderItems = session.items.map(item => ({
        productId: item.productId,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        originalPrice: item.originalPrice || 0,
        discount: 0,
        lineTotal: item.price * item.quantity,
        image: item.image,
        size: item.size,
        color: item.color,
        sku: item.sku,
        brand: item.brand,
        category: item.category
    }));
    
    const subtotal = session.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const deliveryFee = session.deliveryFee || 0;
    const tax = session.tax || 0;
    const discount = session.couponDiscount || 0;
    const total = subtotal + (session.deliveryFee || 0) + (session.tax || 0) - discount;
    
    const order = new Order({
        orderNumber: generateOrderNumber(),
        user: session.userId,
        email: session.shippingAddress?.email || '',
        items: session.items.map(item => ({
            productId: item.productId,
            name: item.name,
            quantity: item.quantity,
            price: item.price,
            originalPrice: item.originalPrice || 0,
            discount: 0,
            lineTotal: item.price * item.quantity,
            image: item.image,
            size: item.size,
            color: item.color,
            sku: item.sku,
            brand: item.brand,
            category: item.category
        })),
        shippingAddress: session.shippingAddress,
        billingAddress: session.billingAddress,
        deliveryMethod: session.deliveryMethod,
        subtotal: session.subtotal,
        deliveryFee: session.deliveryFee,
        tax: session.tax,
        discount: session.couponDiscount || 0,
        couponCode: session.couponCode,
        couponDiscount: session.couponDiscount || 0,
        total: session.total,
        paymentMethod: session.paymentMethod?.type || 'cash',
        couponCode: session.couponCode,
        couponDiscount: session.couponDiscount,
        discount: session.couponDiscount || 0,
        status: 'pending',
        notes: session.notes || '',
        timeline: [{ status: 'pending', note: 'Order placed', timestamp: new Date() }],
        paymentDetails: { 
            paymentStatus: session.paymentStatus || 'pending',
            transactionId: session.paymentTransactionId?.toString()
        }
    });
    
    await order.save();
    return order;
}

async function awardLoyaltyPoints(session) {
    try {
        const user = await User.findById(session.userId);
        if (!user) return;
        
        const pointsEarned = Math.floor(session.subtotal / 100); // 1 point per 100 KSH
        
        user.loyalty.currentPoints = (user.loyalty?.currentPoints || 0) + pointsEarned;
        user.loyalty.lifetimePoints = (user.loyalty?.lifetimePoints || 0) + pointsEarned;
        
        // Check tier upgrade
        // ... tier logic
        
        await user.save();
    } catch (err) {
        console.error('Award loyalty points error:', err);
    }
}

function calculateDeliveryDate(method) {
    const now = new Date();
    const days = parseInt(method.estimatedDays) || 3;
    const deliveryDate = new Date();
    deliveryDate.setDate(deliveryDate.getDate() + days);
    return deliveryDate;
}

async function createInvoiceFromOrder(order) {
    const invoiceNumber = generateInvoiceNumber();
    
    const invoice = new Invoice({
        invoiceNumber,
        orderId: order._id,
        userId: order.user,
        status: 'issued',
        invoiceDate: new Date(),
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        currency: order.currency || 'KES',
        subtotal: order.subtotal,
        tax: order.tax || 0,
        discount: order.discount || 0,
        deliveryFee: order.deliveryFee,
        total: order.total,
        items: order.items.map(item => ({
            productId: item.productId,
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.price,
            originalPrice: item.originalPrice || 0,
            discount: item.discount || 0,
            lineTotal: item.lineTotal,
            sku: item.sku,
            category: item.category
        })),
        billingAddress: order.billingAddress,
        shippingAddress: order.shippingAddress,
        paymentMethod: order.paymentMethod,
        paymentReference: order.paymentDetails?.paymentRef,
        paymentStatus: order.paymentDetails?.paymentStatus,
        footerText: 'Thank you for shopping with Trendy Wardrobe!'
    });
    
    await invoice.save();
    return invoice;
}

module.exports = router;