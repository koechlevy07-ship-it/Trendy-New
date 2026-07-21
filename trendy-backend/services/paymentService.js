const axios = require('axios');
const crypto = require('crypto');

// M-Pesa Configuration
const MPESA_CONFIG = {
    consumerKey: process.env.MPESA_CONSUMER_KEY,
    consumerSecret: process.env.MPESA_CONSUMER_SECRET,
    shortCode: process.env.MPESA_SHORTCODE || '174379',
    passKey: process.env.MPESA_PASSKEY,
    baseUrl: process.env.MPESA_BASE_URL || 'https://sandbox.safaricom.co.ke',
    callbackUrl: process.env.MPESA_CALLBACK_URL || 'https://your-domain.com/api/payment/callback/mpesa'
};

// Stripe Configuration
const STRIPE_CONFIG = {
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET
};

// PayPal Configuration
const PAYPAL_CONFIG = {
    clientId: process.env.PAYPAL_CLIENT_ID,
    clientSecret: process.env.PAYPAL_CLIENT_SECRET,
    mode: process.env.PAYPAL_MODE || 'sandbox'
};

// Token cache for M-Pesa
let mpesaTokenCache = { token: null, expiresAt: 0 };

// ============================================================
// M-Pesa Payment Functions
// ============================================================

async function getMpesaAccessToken() {
    if (mpesaTokenCache.token && Date.now() < mpesaTokenCache.expiresAt) {
        return mpesaTokenCache.token;
    }
    
    try {
        const auth = Buffer.from(`${MPESA_CONFIG.consumerKey}:${MPESA_CONFIG.consumerSecret}`).toString('base64');
        
        const response = await axios.get(`${MPESA_CONFIG.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
            headers: {
                'Authorization': `Basic ${auth}`
            },
            timeout: 10000
        });
        
        mpesaTokenCache = {
            token: response.data.access_token,
            expiresAt: Date.now() + (response.data.expires_in * 1000) - 60000 // 1 minute buffer
        };
        
        return response.data.access_token;
    } catch (err) {
        console.error('M-Pesa token error:', err.message);
        throw new Error('Failed to get M-Pesa access token');
    }
}

async function processMpesaPayment({ phoneNumber, amount, accountReference, transactionDesc, callbackUrl, transactionId }) {
    try {
        const token = await getMpesaAccessToken();
        
        // Format phone number (2547XXXXXXXX)
        let formattedPhone = phoneNumber.replace(/^\+?254/, '254').replace(/^0/, '254');
        if (!formattedPhone.startsWith('254')) {
            formattedPhone = '254' + formattedPhone;
        }
        
        // Generate timestamp
        const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '').split('.')[0];
        
        // Generate password
        const password = Buffer.from(`${MPESA_CONFIG.shortCode}${MPESA_CONFIG.passKey}${timestamp}`).toString('base64');
        
        const payload = {
            BusinessShortCode: MPESA_CONFIG.shortCode,
            Password: password,
            Timestamp: timestamp,
            TransactionType: 'CustomerPayBillOnline',
            Amount: Math.round(parseFloat(amount)),
            PartyA: formattedPhone,
            PartyB: MPESA_CONFIG.shortCode,
            PhoneNumber: formattedPhone,
            CallBackURL: callbackUrl || MPESA_CONFIG.callbackUrl,
            AccountReference: accountReference,
            TransactionDesc: transactionDesc || 'Payment for Trendy Wardrobe order'
        };
        
        const response = await axios.post(
            `${MPESA_CONFIG.baseUrl}/mpesa/stkpush/v1/processrequest`,
            payload,
            {
                headers: {
                    'Authorization': `Bearer ${await getMpesaAccessToken()}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }
        );
        
        if (response.data.ResponseCode === '0') {
            return {
                success: true,
                checkoutRequestId: response.data.CheckoutRequestID,
                merchantRequestId: response.data.MerchantRequestID,
                customerMessage: response.data.CustomerMessage,
                responseCode: response.data.ResponseCode,
                responseDescription: response.data.ResponseDescription
            };
        } else {
            return {
                success: false,
                error: response.data.ResponseDescription || 'M-Pesa request failed',
                responseCode: response.data.ResponseCode
            };
        }
    } catch (err) {
        console.error('M-Pesa payment error:', err.message);
        return {
            success: false,
            error: err.response?.data?.errorMessage || err.message || 'M-Pesa payment failed'
        };
    }
}

async function verifyMpesaPayment(checkoutRequestId) {
    try {
        const token = await getMpesaAccessToken();
        const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '').split('.')[0];
        const password = Buffer.from(`${MPESA_CONFIG.shortCode}${MPESA_CONFIG.passKey}${timestamp}`).toString('base64');
        
        const payload = {
            BusinessShortCode: MPESA_CONFIG.shortCode,
            Password: password,
            Timestamp: timestamp,
            CheckoutRequestID: checkoutRequestId
        };
        
        const response = await axios.post(
            `${MPESA_CONFIG.baseUrl}/mpesa/stkpushquery/v1/query`,
            payload,
            {
                headers: {
                    'Authorization': `Bearer ${await getMpesaAccessToken()}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }
        );
        
        if (response.data.ResultCode === '0') {
            return {
                success: true,
                resultCode: response.data.ResultCode,
                resultDesc: response.data.ResultDesc,
                checkoutRequestId: response.data.CheckoutRequestID,
                merchantRequestId: response.data.MerchantRequestID,
                resultParameters: response.data.CallbackMetadata?.Item || []
            };
        } else if (response.data.ResultCode === '1032') {
            return {
                success: false,
                pending: true,
                resultCode: response.data.ResultCode,
                resultDesc: response.data.ResultDesc
            };
        } else {
            return {
                success: false,
                error: response.data.ResultDesc,
                resultCode: response.data.ResultCode
            };
        }
    } catch (err) {
        console.error('M-Pesa verification error:', err.message);
        return {
            success: false,
            error: err.response?.data?.errorMessage || err.message || 'Verification failed'
        };
    }
}

// ============================================================
// Stripe Payment Functions
// ============================================================

let stripe = null;

function getStripe() {
    if (!stripe && STRIPE_CONFIG.secretKey) {
        stripe = require('stripe')(STRIPE_CONFIG.secretKey, {
            apiVersion: '2023-10-16',
            typescript: false
        });
    }
    return stripe;
}

async function processStripePayment({ amount, currency = 'kes', paymentMethodId, customerId, metadata, description }) {
    try {
        const stripeInstance = getStripe();
        if (!stripeInstance) {
            throw new Error('Stripe not configured');
        }
        
        const paymentIntent = await stripeInstance.paymentIntents.create({
            amount: Math.round(amount * 100), // Convert to cents
            currency: currency.toLowerCase(),
            payment_method: paymentMethodId,
            customer: customerId,
            metadata,
            description,
            confirm: true,
            return_url: `${process.env.FRONTEND_URL}/checkout/confirm`,
            automatic_payment_methods: {
                enabled: true,
                allow_redirects: 'never'
            }
        });
        
        return {
            success: paymentIntent.status === 'succeeded',
            paymentIntentId: paymentIntent.id,
            status: paymentIntent.status,
            clientSecret: paymentIntent.client_secret,
            amount: paymentIntent.amount / 100,
            currency: paymentIntent.currency
        };
    } catch (err) {
        console.error('Stripe payment error:', err.message);
        return {
            success: false,
            error: err.message
        };
    }
}

async function createStripeCustomer(email, name, metadata) {
    try {
        const stripeInstance = getStripe();
        if (!stripeInstance) throw new Error('Stripe not configured');
        
        const customer = await stripeInstance.customers.create({
            email,
            name,
            metadata
        });
        
        return { success: true, customerId: customer.id };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

async function processStripeRefund(paymentIntentId, amount = null, reason = 'requested_by_customer') {
    try {
        const stripeInstance = getStripe();
        const refund = await stripeInstance.refunds.create({
            payment_intent: paymentIntentId,
            amount: amount ? Math.round(amount * 100) : undefined,
            reason
        });
        
        return {
            success: true,
            refundId: refund.id,
            amount: refund.amount / 100,
            status: refund.status
        };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

// ============================================================
// PayPal Payment Functions
// ============================================================

let paypalClient = null;

async function getPaypalClient() {
    if (!paypalClient && PAYPAL_CONFIG.clientId && PAYPAL_CONFIG.clientSecret) {
        const { Client } = require('@paypal/checkout-server-sdk');
        const environment = PAYPAL_CONFIG.mode === 'live' 
            ? new (require('@paypal/checkout-server-sdk')).core.LiveEnvironment(PAYPAL_CONFIG.clientId, PAYPAL_CONFIG.clientSecret)
            : new (require('@paypal/checkout-server-sdk')).core.SandboxEnvironment(PAYPAL_CONFIG.clientId, PAYPAL_CONFIG.clientSecret);
        
        paypalClient = new Client(environment);
    }
    return paypalClient;
}

async function processPaypalPayment({ amount, currency = 'USD', returnUrl, cancelUrl, description, items }) {
    try {
        const client = await getPaypalClient();
        if (!paypalClient) throw new Error('PayPal not configured');
        
        const request = new (require('@paypal/checkout-server-sdk')).orders.OrdersCreateRequest();
        request.prefer('return=representation');
        request.requestBody({
            intent: 'CAPTURE',
            purchase_units: [{
                amount: {
                    currency_code: currency,
                    value: amount.toFixed(2),
                    breakdown: {
                        item_total: {
                            currency_code: currency,
                            value: amount.toFixed(2)
                        }
                    }
                },
                description,
                items: items?.map(item => ({
                    name: item.name,
                    unit_amount: { currency_code: currency, value: item.price.toFixed(2) },
                    quantity: item.quantity.toString(),
                    category: 'PHYSICAL_GOODS'
                }))
            }],
            application_context: {
                return_url: returnUrl,
                cancel_url: cancelUrl,
                brand_name: 'Trendy Wardrobe',
                user_action: 'PAY_NOW',
                shipping_preference: 'SET_PROVIDED_ADDRESS'
            }
        });
        
        const response = await paypalClient.execute(request);
        
        return {
            success: true,
            orderId: response.result.id,
            status: response.result.status,
            links: response.result.links,
            approveUrl: response.result.links.find(l => l.rel === 'approve')?.href
        };
    } catch (err) {
        console.error('PayPal payment error:', err.message);
        return { success: false, error: err.message };
    }
}

async function capturePaypalPayment(orderId) {
    try {
        const client = await getPaypalClient();
        const request = new (require('@paypal/checkout-server-sdk')).orders.OrdersCaptureRequest(orderId);
        request.requestBody({});
        
        const response = await client.execute(request);
        
        return {
            success: response.result.status === 'COMPLETED',
            orderId: response.result.id,
            status: response.result.status,
            captureId: response.result.purchase_units?.[0]?.payments?.captures?.[0]?.id,
            amount: response.result.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value
        };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

// ============================================================
// Bank Transfer Payment
// ============================================================

async function processBankTransfer({ amount, accountNumber, accountName, bankCode, reference, narration }) {
    // This would integrate with a banking API or payment processor
    // For now, return a simulated response
    
    return {
        success: true,
        transactionId: `BT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        status: 'pending',
        message: 'Bank transfer initiated. Please complete the transfer using the provided details.',
        instructions: {
            bankName: 'Trendy Wardrobe Bank',
            accountNumber: process.env.BANK_ACCOUNT_NUMBER || '0000000000',
            accountName: 'Trendy Wardrobe Ltd',
            bankCode: process.env.BANK_CODE || '000000',
            reference,
            amount
        }
    };
}

// ============================================================
// Cash on Delivery
// ============================================================

async function processCashOnDelivery({ amount, phoneNumber, notes }) {
    return {
        success: true,
        transactionId: `COD-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
        status: 'pending',
        message: 'Cash on delivery order placed. Our agent will contact you for delivery.',
        paymentMethod: 'cash-on-delivery',
        amount
    };
}

// ============================================================
// Bank Transfer (Direct)
// ============================================================

async function processBankTransferDirect({ amount, reference, notes }) {
    return {
        success: true,
        transactionId: `BT-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
        status: 'pending_verification',
        message: 'Bank transfer initiated. Please complete the transfer and upload proof of payment.',
        paymentMethod: 'bank-transfer',
        amount,
        accountDetails: {
            bankName: 'Trendy Wardrobe Bank',
            accountName: 'Trendy Wardrobe Ltd',
            accountNumber: process.env.BANK_ACCOUNT_NUMBER || '0000000000',
            bankCode: process.env.BANK_CODE || '000000',
            swiftCode: process.env.SWIFT_CODE || '',
            reference
        }
    };
}

// ============================================================
// Payment Gateway Factory
// ============================================================

async function processPayment({ method, amount, ...params }) {
    switch (method) {
        case 'mpesa':
            return processMpesaPayment(params);
        case 'stripe':
            return processStripePayment(params);
        case 'paypal':
            return processPaypalPayment(params);
        case 'bank-transfer':
            return processBankTransfer(params);
        case 'cash-on-delivery':
            return processCashOnDelivery(params);
        case 'bank-transfer-direct':
            return processBankTransferDirect(params);
        default:
            return { success: false, error: `Unsupported payment method: ${method}` };
    }
}

async function verifyPayment({ provider, transactionId, checkoutSessionToken }) {
    switch (provider) {
        case 'mpesa':
            return verifyMpesaPayment(transactionId);
        case 'stripe':
            // return verifyStripePayment(transactionId);
            return { success: false, error: 'Stripe verification not implemented' };
        case 'paypal':
            return { success: false, error: 'PayPal verification not implemented' };
        default:
            return { success: false, error: `Unsupported provider: ${provider}` };
    }
}

module.exports = {
    processMpesaPayment,
    verifyMpesaPayment,
    processStripePayment,
    createStripeCustomer,
    processStripeRefund,
    processPaypalPayment,
    capturePaypalPayment,
    processBankTransfer,
    processCashOnDelivery,
    processBankTransferDirect,
    processPayment,
    verifyPayment,
    generateTransactionId,
    MPESA_CONFIG,
    STRIPE_CONFIG,
    PAYPAL_CONFIG
};