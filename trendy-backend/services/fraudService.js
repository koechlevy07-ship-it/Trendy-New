// Fraud Detection Service - Comprehensive fraud prevention for checkout and payments

const FraudCheck = require('../models/Checkout').FraudCheck;
const User = require('../models/User');
const Order = require('../models/Order');
const CheckoutSession = require('../models/Checkout').CheckoutSession;
const PaymentTransaction = require('../models/Checkout').PaymentTransaction;

// Fraud detection rules configuration
const FRAUD_RULES = {
    // Velocity checks
    VELOCITY_CHECKS: {
        MAX_ORDERS_PER_HOUR: 5,
        MAX_ORDERS_PER_DAY: 20,
        MAX_AMOUNT_PER_HOUR: 500000, // KES 500k
        MAX_AMOUNT_PER_DAY: 1000000, // KES 1M
        MAX_FAILED_ATTEMPTS: 3
    },
    
    // Amount-based checks
    AMOUNT_CHECKS: {
        HIGH_VALUE_THRESHOLD: 100000, // KES 100k
        VERY_HIGH_VALUE_THRESHOLD: 500000, // KES 500k
        ROUND_NUMBER_THRESHOLD: 10000, // Perfect round numbers
        MICRO_AMOUNT_THRESHOLD: 10 // Very small amounts
    },
    
    // Location-based checks
    LOCATION_CHECKS: {
        HIGH_RISK_COUNTRIES: ['NG', 'GH', 'PK', 'BD', 'VN', 'CN', 'RU'],
        HIGH_RISK_IPS: [], // Would be populated from threat intelligence
        VPN_PROXY_DETECTION: true,
        TOR_DETECTION: true,
        GEOLOCATION_MISMATCH: true // Billing vs shipping vs IP country
    },
    
    // Device & Browser checks
    DEVICE_CHECKS: {
        NEW_DEVICE_THRESHOLD: 3, // New devices in 30 days
        DEVICE_FINGERPRINT_MISMATCH: true,
        AUTOMATION_DETECTION: true,
        HEADLESS_BROWSER_DETECTION: true,
        EMULATOR_DETECTION: true
    },
    
    // Behavioral checks
    BEHAVIORAL_CHECKS: {
        MIN_SESSION_DURATION: 30, // seconds
        MAX_PAGES_PER_SECOND: 5,
        MIN_MOUSE_MOVEMENTS: 5,
        MIN_KEYSTROKES: 10,
        COPY_PASTE_DETECTION: true,
        AUTOFILL_DETECTION: true,
        RAPID_FORM_COMPLETION: 5 // seconds minimum
    },
    
    // Email & Contact checks
    EMAIL_CHECKS: {
        DISPOSABLE_EMAIL_DETECTION: true,
        DOMAIN_AGE_THRESHOLD: 30, // days
        FREE_EMAIL_PROVIDERS: ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'protonmail.com'],
        ROLE_ACCOUNTS: ['admin@', 'support@', 'info@', 'sales@', 'noreply@']
    },
    
    // Phone checks
    PHONE_CHECKS: {
        VALIDATE_FORMAT: true,
        CHECK_CARRIER: true,
        DETECT_VOIP: true,
        DETECT_LANDLINE: false
    },
    
    // Card checks (for card payments)
    CARD_CHECKS: {
        BIN_CHECK: true,
        PREPAID_CARD_DETECTION: true,
        VIRTUAL_CARD_DETECTION: true,
        COUNTRY_MISMATCH: true, // Card country vs billing country
        EXPIRED_CARD: true,
        CVV_CHECK: true
    }
};

// Risk scoring weights
const RISK_WEIGHTS = {
    velocity: 25,
    amount: 20,
    location: 15,
    device: 15,
    behavior: 10,
    email: 5,
    phone: 5,
    card: 10
};

/**
 * Run comprehensive fraud checks on a checkout session
 */
async function runFraudChecks({ checkoutSession, userId, ipAddress, userAgent, deviceFingerprint, metadata = {} }) {
    try {
        const checks = [];
        let totalScore = 0;
        let maxRiskLevel = 'low';
        const triggeredRules = [];
        
        // Get user data
        const user = await User.findById(userId).lean();
        const session = checkoutSession;
        
        // 1. Velocity Checks
        const velocityCheck = await checkVelocity(checkoutSession, userId);
        if (velocityCheck.triggered) {
            checks.push(velocityCheck);
            totalScore += velocityCheck.score * RISK_WEIGHTS.velocity / 100;
            if (velocityCheck.riskLevel === 'high' || velocityCheck.riskLevel === 'critical') {
                maxRiskLevel = 'high';
            }
            triggeredRules.push(...velocityCheck.rules);
        }
        
        // 2. Amount Checks
        const amountCheck = checkAmount(checkoutSession);
        if (amountCheck.triggered) {
            checks.push(amountCheck);
            totalScore += amountCheck.score * RISK_WEIGHTS.amount / 100;
            if (amountCheck.riskLevel === 'high' || amountCheck.riskLevel === 'critical') {
                maxRiskLevel = 'high';
            }
            triggeredRules.push(...amountCheck.rules);
        }
        
        // 3. Location Checks
        const locationCheck = await checkLocation(checkoutSession, ipAddress);
        if (locationCheck.triggered) {
            checks.push(locationCheck);
            totalScore += locationCheck.score * RISK_WEIGHTS.location / 100;
            if (locationCheck.riskLevel === 'high' || locationCheck.riskLevel === 'critical') {
                maxRiskLevel = 'high';
            }
            triggeredRules.push(...locationCheck.rules);
        }
        
        // 4. Device Checks
        const deviceCheck = await checkDevice(checkoutSession, deviceFingerprint, userAgent);
        if (deviceCheck.triggered) {
            checks.push(deviceCheck);
            totalScore += deviceCheck.score * RISK_WEIGHTS.device / 100;
            if (deviceCheck.riskLevel === 'high' || deviceCheck.riskLevel === 'critical') {
                maxRiskLevel = 'high';
            }
            triggeredRules.push(...deviceCheck.rules);
        }
        
        // 5. Behavioral Checks
        const behaviorCheck = checkBehavior(checkoutSession, metadata);
        if (behaviorCheck.triggered) {
            checks.push(behaviorCheck);
            totalScore += behaviorCheck.score * RISK_WEIGHTS.behavior / 100;
            if (behaviorCheck.riskLevel === 'high' || behaviorCheck.riskLevel === 'critical') {
                maxRiskLevel = 'high';
            }
            triggeredRules.push(...behaviorCheck.rules);
        }
        
        // 6. Email Checks
        const emailCheck = await checkEmail(checkoutSession, userId);
        if (emailCheck.triggered) {
            checks.push(emailCheck);
            totalScore += emailCheck.score * RISK_WEIGHTS.email / 100;
            triggeredRules.push(...emailCheck.rules);
        }
        
        // 6. Phone Checks
        const phoneCheck = await checkPhone(checkoutSession, userId);
        if (phoneCheck.triggered) {
            checks.push(phoneCheck);
            totalScore += phoneCheck.score * RISK_WEIGHTS.phone / 100;
            triggeredRules.push(...phoneCheck.rules);
        }
        
        // 7. Card Checks (if card payment)
        if (checkoutSession.paymentMethod?.type && ['visa', 'mastercard', 'stripe', 'apple-pay', 'google-pay', 'visa', 'mastercard'].includes(checkoutSession.paymentMethod.type.toLowerCase())) {
            const cardCheck = await checkCard(checkoutSession);
            if (cardCheck.triggered) {
                checks.push(cardCheck);
                totalScore += cardCheck.score * RISK_WEIGHTS.card / 100;
                if (cardCheck.riskLevel === 'high' || cardCheck.riskLevel === 'critical') {
                    maxRiskLevel = 'high';
                }
                triggeredRules.push(...cardCheck.rules);
            }
        }
        
        // Determine overall risk level
        let riskLevel = 'low';
        if (totalScore >= 80) riskLevel = 'critical';
        else if (totalScore >= 60) riskLevel = 'high';
        else if (totalScore >= 30) riskLevel = 'medium';
        else if (totalScore >= 10) riskLevel = 'low';
        
        // Determine action
        let action = 'allow';
        if (riskLevel === 'critical') action = 'block';
        else if (riskLevel === 'high') action = 'challenge';
        else if (riskLevel === 'medium') action = 'review';
        
        // Create fraud check record
        const fraudCheck = await FraudCheck.create({
            checkoutSessionId: checkoutSession._id,
            userId: checkoutSession.userId,
            paymentTransactionId: checkoutSession.paymentTransactionId,
            checkType: 'comprehensive',
            riskLevel,
            score: Math.round(totalScore),
            triggered: riskLevel !== 'low',
            action,
            rules: triggeredRules,
            details: {
                checks,
                totalScore,
                weights: RISK_WEIGHTS
            },
            ipAddress: checkoutSession.metadata?.ipAddress,
            userAgent: checkoutSession.metadata?.userAgent,
            deviceFingerprint,
            location: checkoutSession.metadata?.location,
            device: checkoutSession.metadata?.device,
            email: checkoutSession.metadata?.email,
            phone: checkoutSession.metadata?.phone,
            card: checkoutSession.metadata?.card,
            behavior: checkoutSession.metadata?.behavior
        });
        
        return {
            blocked: action === 'block',
            challenged: action === 'challenge',
            review: action === 'review',
            riskLevel,
            score: Math.round(totalScore),
            fraudCheckId: fraudCheck._id,
            checks,
            action,
            rules: triggeredRules
        };
    } catch (err) {
        console.error('Fraud check error:', err);
        // Fail open - allow transaction but log error
        return {
            blocked: false,
            challenged: false,
            review: false,
            riskLevel: 'low',
            score: 0,
            action: 'allow',
            checks: [],
            error: err.message
        };
    }
}

/**
 * Velocity Checks - Check for unusual activity patterns
 */
async function checkVelocity(session, userId) {
    const rules = [];
    let score = 0;
    let triggered = false;
    
    const userId = checkoutSession.userId;
    const sessionId = checkoutSession.sessionId;
    
    if (!userId && !sessionId) return { triggered: false, score: 0, rules: [] };
    
    const now = new Date();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    // Build query
    const query = userId ? { userId } : { sessionId: sessionId };
    
    // Check orders in last hour
    const recentOrders = await Order.countDocuments({
        userId: userId,
        createdAt: { $gte: oneHourAgo }
    });
    
    if (recentOrders > FRAUD_RULES.VELOCITY_CHECKS.MAX_ORDERS_PER_HOUR) {
        triggered = true;
        score += 30;
        rules.push({
            ruleId: 'velocity_orders_per_hour',
            ruleName: 'Too many orders per hour',
            triggered: true,
            score: 30,
            action: 'challenge'
        });
    }
    
    // Check orders in last day
    const dailyOrders = await Order.countDocuments({
        userId: userId,
        createdAt: { $gte: oneDayAgo }
    });
    
    if (dailyOrders > FRAUD_RULES.VELOCITY_CHECKS.MAX_ORDERS_PER_DAY) {
        triggered = true;
        score += 25;
        rules.push({
            ruleId: 'velocity_orders_per_day',
            ruleName: 'Too many orders per day',
            triggered: true,
            score: 25,
            action: 'challenge'
        });
    }
    
    // Check failed payment attempts
    const failedAttempts = await PaymentTransaction.countDocuments({
        userId: userId,
        status: 'failed',
        createdAt: { $gte: oneDayAgo }
    });
    
    if (failedAttempts > FRAUD_RULES.VELOCITY_CHECKS.MAX_FAILED_ATTEMPTS) {
        triggered = true;
        score += 40;
        rules.push({
            ruleId: 'velocity_failed_payments',
            ruleName: 'Too many failed payment attempts',
            triggered: true,
            score: 40,
            action: 'block'
        });
    }
    
    // Check checkout sessions in last hour
    const recentSessions = await CheckoutSession.countDocuments({
        userId: userId,
        createdAt: { $gte: oneHourAgo }
    });
    
    if (recentSessions > 10) {
        triggered = true;
        score += 20;
        rules.push({
            ruleId: 'velocity_sessions_per_hour',
            ruleName: 'Too many checkout sessions per hour',
            triggered: true,
            score: 20,
            action: 'challenge'
        });
    }
    
    return {
        triggered,
        score: Math.min(score, 100),
        riskLevel: score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low',
        rules
    };
}

/**
 * Amount-based fraud checks
 */
function checkAmount(session) {
    const rules = [];
    let score = 0;
    let triggered = false;
    const amount = session.total;
    
    // High value order
    if (amount >= FRAUD_RULES.AMOUNT_CHECKS.VERY_HIGH_VALUE_THRESHOLD) {
        triggered = true;
        score += 30;
        rules.push({
            ruleId: 'amount_very_high',
            ruleName: 'Very high value order',
            triggered: true,
            score: 30,
            action: 'review'
        });
    } else if (amount >= FRAUD_RULES.AMOUNT_CHECKS.HIGH_VALUE_THRESHOLD) {
        triggered = true;
        score += 15;
        rules.push({
            ruleId: 'amount_high',
            ruleName: 'High value order',
            triggered: true,
            score: 15,
            action: 'review'
        });
    }
    
    // Round number check (e.g., exactly 10000, 50000)
    if (amount >= FRAUD_RULES.AMOUNT_CHECKS.ROUND_NUMBER_THRESHOLD && amount % 10000 === 0) {
        triggered = true;
        score += 10;
        rules.push({
            ruleId: 'amount_round_number',
            ruleName: 'Suspiciously round amount',
            triggered: true,
            score: 10,
            action: 'review'
        });
    }
    
    // Very small amount (testing)
    if (amount < FRAUD_RULES.AMOUNT_CHECKS.MICRO_AMOUNT_THRESHOLD) {
        triggered = true;
        score += 20;
        rules.push({
            ruleId: 'amount_micro',
            ruleName: 'Suspiciously small amount',
            triggered: true,
            score: 20,
            action: 'challenge'
        });
    }
    
    // Amount just below threshold (evasion)
    const thresholds = [50000, 100000, 200000, 500000, 1000000];
    for (const threshold of thresholds) {
        if (amount >= threshold - 100 && amount < threshold) {
            triggered = true;
            score += 15;
            rules.push({
                ruleId: 'amount_threshold_evasion',
                ruleName: `Amount just below ${threshold} threshold`,
                triggered: true,
                score: 15,
                action: 'review'
            });
            break;
        }
    }
    
    return {
        triggered,
        score: Math.min(score, 100),
        riskLevel: score >= 50 ? 'high' : score >= 20 ? 'medium' : 'low',
        rules
    };
}

/**
 * Location-based fraud checks
 */
async function checkLocation(session, ipAddress) {
    const rules = [];
    let score = 0;
    let triggered = false;
    
    // This would integrate with a GeoIP service like MaxMind
    // For now, we'll check against high-risk countries
    
    // Get location from IP (would integrate with GeoIP service)
    const location = await getLocationFromIP(ipAddress);
    
    if (location) {
        // Check high-risk countries
        if (FRAUD_RULES.LOCATION_CHECKS.HIGH_RISK_COUNTRIES.includes(location.countryCode)) {
            triggered = true;
            score += 30;
            rules.push({
                ruleId: 'location_high_risk_country',
                ruleName: `High-risk country: ${location.countryName}`,
                triggered: true,
                score: 30,
                action: 'block'
            });
        }
        
        // Check for proxy/VPN/Tor
        if (location.isProxy || location.isVPN || location.isTor) {
            triggered = true;
            score += 40;
            rules.push({
                ruleId: 'location_proxy_vpn',
                ruleName: `Connection via ${location.isProxy ? 'proxy' : location.isVPN ? 'VPN' : 'Tor'}`,
                triggered: true,
                score: 40,
                action: 'block'
            });
        }
        
        // Geolocation mismatch (billing vs shipping vs IP)
        // This would compare billing address country vs shipping address country vs IP country
        // Implementation would compare session.shippingAddress.country vs location.countryCode
    }
    
    return {
        triggered,
        score: Math.min(score, 100),
        riskLevel: score >= 50 ? 'high' : score >= 20 ? 'medium' : 'low',
        rules,
        location
    };
}

/**
 * Device and browser fingerprint checks
 */
async function checkDevice(session, deviceFingerprint, userAgent) {
    const rules = [];
    let score = 0;
    let triggered = false;
    
    // Parse user agent
    const ua = userAgent || '';
    const isMobile = /Mobile|Android|iPhone|iPad/.test(ua);
    const isBot = /bot|crawler|spider|scraper/i.test(ua);
    const isHeadless = /HeadlessChrome|PhantomJS|Puppeteer/.test(ua);
    const isAutomation = /webdriver|selenium|puppeteer|playwright/i.test(ua);
    
    // Bot detection
    if (isBot) {
        triggered = true;
        score += 50;
        rules.push({
            ruleId: 'device_bot_detected',
            ruleName: 'Bot detected',
            triggered: true,
            score: 50,
            action: 'block'
        });
    }
    
    // Headless browser
    if (isHeadless) {
        triggered = true;
        score += 40;
        rules.push({
            ruleId: 'device_headless',
            ruleName: 'Headless browser detected',
            triggered: true,
            score: 40,
            action: 'block'
        });
    }
    
    // Automation framework
    if (isAutomation) {
        triggered = true;
        score += 40;
        rules.push({
            ruleId: 'device_automation',
            ruleName: 'Automation framework detected',
            triggered: true,
            score: 40,
            action: 'block'
        });
    }
    
    // Device fingerprint analysis
    if (deviceFingerprint) {
        // Check if this is a new device for the user
        // Would check against user's known devices
        
        // Check for device fingerprint anomalies
        if (deviceFingerprint.screenResolution === '0x0' || 
            deviceFingerprint.colorDepth === 0 ||
            !deviceFingerprint.canvasFingerprint) {
            triggered = true;
            score += 20;
            rules.push({
                ruleId: 'device_fingerprint_anomaly',
                ruleName: 'Suspicious device fingerprint',
                triggered: true,
                score: 20,
                action: 'challenge'
            });
        }
    }
    
    // New device check
    // Would check against user's known devices
    
    return {
        triggered,
        score: Math.min(score, 100),
        riskLevel: score >= 50 ? 'high' : score >= 20 ? 'medium' : 'low',
        rules
    };
}

/**
 * Behavioral analysis
 */
function checkBehavior(session, metadata) {
    const rules = [];
    let score = 0;
    let triggered = false;
    
    const behavior = metadata?.behavior || {};
    
    // Session duration check
    if (behavior.sessionDuration !== undefined) {
        if (behavior.sessionDuration < FRAUD_RULES.BEHAVIORAL_CHECKS.MIN_SESSION_DURATION) {
            triggered = true;
            score += 25;
            rules.push({
                ruleId: 'behavior_short_session',
                ruleName: 'Suspiciously short session',
                triggered: true,
                score: 25,
                action: 'challenge'
            });
        }
    }
    
    // Pages per second
    if (behavior.pagesPerSecond !== undefined) {
        if (behavior.pagesPerSecond > FRAUD_RULES.BEHAVIORAL_CHECKS.MAX_PAGES_PER_SECOND) {
            triggered = true;
            score += 20;
            rules.push({
                ruleId: 'behavior_rapid_navigation',
                ruleName: 'Rapid page navigation',
                triggered: true,
                score: 20,
                action: 'challenge'
            });
        }
    }
    
    // Mouse movements
    if (behavior.mouseMovements !== undefined) {
        if (behavior.mouseMovements < FRAUD_RULES.BEHAVIORAL_CHECKS.MIN_MOUSE_MOVEMENTS) {
            triggered = true;
            score += 15;
            rules.push({
                ruleId: 'behavior_no_mouse',
                ruleName: 'No mouse movement detected',
                triggered: true,
                score: 15,
                action: 'challenge'
            });
        }
    }
    
    // Keystrokes
    if (behavior.keystrokes !== undefined) {
        if (behavior.keystrokes < FRAUD_RULES.BEHAVIORAL_CHECKS.MIN_KEYSTROKES) {
            triggered = true;
            score += 15;
            rules.push({
                ruleId: 'behavior_no_keystrokes',
                ruleName: 'No keystrokes detected',
                triggered: true,
                score: 15,
                action: 'challenge'
            });
        }
    }
    
    // Copy-paste detection
    if (behavior.copyPasteDetected) {
        triggered = true;
        score += 10;
        rules.push({
            ruleId: 'behavior_copy_paste',
            ruleName: 'Copy-paste detected in form fields',
            triggered: true,
            score: 10,
            action: 'review'
        });
    }
    
    // Autofill detection
    if (behavior.autofillDetected) {
        triggered = true;
        score += 10;
        rules.push({
            ruleId: 'behavior_autofill',
            ruleName: 'Browser autofill detected',
            triggered: true,
            score: 10,
            action: 'review'
        });
    }
    
    // Rapid form completion
    if (behavior.formCompletionTime !== undefined) {
        if (behavior.formCompletionTime < FRAUD_RULES.BEHAVIORAL_CHECKS.RAPID_FORM_COMPLETION) {
            triggered = true;
            score += 20;
            rules.push({
                ruleId: 'behavior_rapid_form',
                ruleName: 'Form completed too quickly',
                triggered: true,
                score: 20,
                action: 'challenge'
            });
        }
    }
    
    return {
        triggered,
        score: Math.min(score, 100),
        riskLevel: score >= 50 ? 'high' : score >= 20 ? 'medium' : 'low',
        rules
    };
}

/**
 * Email validation checks
 */
async function checkEmail(session, userId) {
    const rules = [];
    let score = 0;
    let triggered = false;
    
    const email = checkoutSession.shippingAddress?.email || 
                  checkoutSession.billingAddress?.email ||
                  (await User.findById(userId).select('email').lean())?.email;
    
    if (!email) return { triggered: false, score: 0, rules: [] };
    
    const domain = email.split('@')[1]?.toLowerCase();
    const localPart = email.split('@')[0];
    
    // Check disposable email domains
    const disposableDomains = [
        '10minutemail.com', 'guerrillamail.com', 'mailinator.com',
        'tempmail.com', 'throwawaymail.com', 'fakeinbox.com',
        'trashmail.com', 'yopmail.com', 'maildrop.cc'
    ];
    
    if (disposableDomains.includes(domain)) {
        triggered = true;
        score += 30;
        rules.push({
            ruleId: 'email_disposable',
            ruleName: 'Disposable email domain',
            triggered: true,
            score: 30,
            action: 'block'
        });
    }
    
    // Check free email providers
    const freeProviders = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'protonmail.com', 'icloud.com'];
    if (freeProviders.includes(domain)) {
        // Not necessarily fraud, but lower trust
        // Could add small score if combined with other factors
    }
    
    // Role accounts
    const roleAccounts = ['admin', 'support', 'info', 'sales', 'noreply', 'billing', 'security'];
    if (roleAccounts.includes(localPart.toLowerCase())) {
        triggered = true;
        score += 15;
        rules.push({
            ruleId: 'email_role_account',
            ruleName: 'Role-based email address',
            triggered: true,
            score: 15,
            action: 'review'
        });
    }
    
    // Check domain age (would need WHOIS lookup in production)
    // For now, skip
    
    // Check for suspicious patterns
    if (localPart.length > 30 || /\d{6,}/.test(localPart)) {
        // Suspiciously long or numeric local part
        score += 10;
        rules.push({
            ruleId: 'email_suspicious_pattern',
            ruleName: 'Suspicious email pattern',
            triggered: true,
            score: 10,
            action: 'review'
        });
        triggered = true;
    }
    
    return {
        triggered,
        score: Math.min(score, 100),
        riskLevel: score >= 50 ? 'high' : score >= 20 ? 'medium' : 'low',
        rules
    };
}

/**
 * Phone number validation
 */
async function checkPhone(session, userId) {
    const rules = [];
    let score = 0;
    let triggered = false;
    
    const phone = checkoutSession.shippingAddress?.phone || 
                  checkoutSession.billingAddress?.phone ||
                  (await User.findById(userId).select('phone').lean())?.phone;
    
    if (!phone) return { triggered: false, score: 0, rules: [] };
    
    // Validate format (Kenyan numbers)
    const kenyanPhoneRegex = /^(\+254|254|0)?[17]\d{8}$/;
    if (!kenyanPhoneRegex.test(phone.replace(/\s|-/g, ''))) {
        triggered = true;
        score += 20;
        rules.push({
            ruleId: 'phone_invalid_format',
            ruleName: 'Invalid phone number format',
            triggered: true,
            score: 20,
            action: 'challenge'
        });
    }
    
    // Check for VOIP/landline (would need carrier lookup API)
    // For now, skip
    
    return {
        triggered,
        score: Math.min(score, 100),
        riskLevel: score >= 50 ? 'high' : score >= 20 ? 'medium' : 'low',
        rules
    };
}

/**
 * Card validation checks
 */
async function checkCard(session) {
    const rules = [];
    let score = 0;
    let triggered = false;
    
    // This would integrate with card BIN lookup services
    // For now, placeholder
    
    // Check if card country matches billing country
    // Check for prepaid/virtual cards
    // Check BIN against known fraudulent BINs
    // Check card expiry
    // Check CVV validation
    
    // Placeholder for integration with services like:
    // - Binlist.net
    // - Bincheck.io
    // - Stripe Radar
    // - Sift Science
    
    return {
        triggered,
        score: Math.min(score, 100),
        riskLevel: score >= 50 ? 'high' : score >= 20 ? 'medium' : 'low',
        rules
    };
}

// Helper function to get location from IP
async function getLocationFromIP(ip) {
    // Would integrate with GeoIP service like MaxMind, IPInfo, ipapi.co
    // For now, return mock data
    if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
        return { countryCode: 'KE', countryName: 'Kenya (Local)', isProxy: false, isVPN: false, isTor: false };
    }
    // In production, call GeoIP service
    return null;
}

module.exports = {
    runFraudChecks,
    checkVelocity,
    checkAmount,
    checkLocation,
    checkDevice,
    checkBehavior,
    checkEmail,
    checkPhone,
    checkCard,
    FRAUD_RULES,
    RISK_WEIGHTS
};