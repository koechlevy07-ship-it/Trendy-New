const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    tls: { rejectUnauthorized: true }
});

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@trendywardrobe.com';
const STORE_NAME = 'Trendy Wardrobe';
const STORE_URL = 'https://trendy-frontend-ashen.vercel.app';
const STORE_PHONE = '+254 728 985 417';
const STORE_WHATSAPP = 'https://wa.me/254728985417';

const DAILY_EMAIL_LIMIT = parseInt(process.env.EMAIL_DAILY_LIMIT, 10) || 450;
const SEND_INTERVAL_MS = 200;
let emailQueue = [];
let emailsSentToday = 0;
let lastResetDate = new Date().toDateString();
let processing = false;

function resetDailyCountIfNeeded() {
    const today = new Date().toDateString();
    if (today !== lastResetDate) {
        emailsSentToday = 0;
        lastResetDate = today;
    }
}

function processQueue() {
    if (processing || emailQueue.length === 0) return;
    processing = true;
    const next = () => {
        if (emailQueue.length === 0) { processing = false; return; }
        resetDailyCountIfNeeded();
        if (emailsSentToday >= DAILY_EMAIL_LIMIT) {
            console.warn(`⚠️ Daily email limit reached (${DAILY_EMAIL_LIMIT}). ${emailQueue.length} emails queued for tomorrow.`);
            processing = false;
            return;
        }
        const job = emailQueue.shift();
        emailsSentToday++;
        transporter.sendMail(job.mailOptions)
            .then(info => { console.log(`📧 Email sent to ${job.to}: ${info.messageId}`); if (job.resolve) job.resolve(info); })
            .catch(err => { console.error(`❌ Email failed to ${job.to}: ${err.message}`); if (job.resolve) job.resolve(null); })
            .finally(() => setTimeout(next, SEND_INTERVAL_MS));
    };
    next();
}

async function sendEmail({ to, subject, html, text }) {
    resetDailyCountIfNeeded();
    if (emailsSentToday >= DAILY_EMAIL_LIMIT) {
        console.warn(`⚠️ Daily email limit reached, deferring email to ${to}`);
    }
    return new Promise(resolve => {
        emailQueue.push({
            to,
            mailOptions: {
                from: `"${STORE_NAME}" <${process.env.EMAIL_USER}>`,
                to,
                subject,
                text: text || '',
                html: html || ''
            },
            resolve
        });
        processQueue();
    });
}

function getEmailStats() {
    resetDailyCountIfNeeded();
    return { sentToday: emailsSentToday, dailyLimit: DAILY_EMAIL_LIMIT, queueLength: emailQueue.length };
}

function emailWrapper(content) {
    return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="margin:0;padding:0;background:#f4f4f7;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:40px 0;">
            <tr><td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
                    <tr>
                        <td style="background:#1a1a1a;padding:28px 40px;text-align:center;">
                            <h1 style="margin:0;font-family:'Helvetica Neue',sans-serif;font-size:22px;font-weight:700;letter-spacing:3px;color:#C8A35A;">TRENDY WARDROBE</h1>
                            <p style="margin:4px 0 0;font-size:11px;letter-spacing:2px;color:#888;text-transform:uppercase;">More Than Just A Brand</p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:40px;">${content}</td>
                    </tr>
                    <tr>
                        <td style="background:#f8f9fa;padding:24px 40px;text-align:center;border-top:1px solid #eee;">
                            <p style="margin:0;font-size:12px;color:#999;">&copy; ${new Date().getFullYear()} ${STORE_NAME}. All rights reserved.</p>
                            <p style="margin:8px 0 0;font-size:12px;color:#999;">
                                <a href="${STORE_URL}" style="color:#C8A35A;text-decoration:none;">Visit Store</a> &nbsp;|&nbsp;
                                <a href="${STORE_WHATSAPP}" style="color:#25D366;text-decoration:none;">WhatsApp Us</a>
                            </p>
                        </td>
                    </tr>
                </table>
            </td></tr>
        </table>
    </body>
    </html>`;
}

async function sendOrderConfirmation(order, user) {
    const itemsHtml = order.items.map(item => `
        <tr>
            <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#333;">${item.name}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#333;text-align:center;">${item.quantity}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#333;text-align:right;">Ksh ${(item.price || 0).toLocaleString()}</td>
        </tr>
    `).join('');

    const html = emailWrapper(`
        <h2 style="margin:0 0 8px;font-size:24px;color:#1a1a1a;">Order Confirmed</h2>
        <p style="margin:0 0 24px;font-size:13px;color:#C8A35A;letter-spacing:1px;">Thank you for shopping with us!</p>

        <p style="font-size:14px;color:#555;margin:0 0 4px;">Hi <strong>${user.name}</strong>,</p>
        <p style="font-size:14px;color:#555;margin:0 0 24px;">Your order has been received and is being processed. We'll notify you when it ships.</p>

        <table width="100%" style="background:#f8f9fa;border-radius:8px;padding:16px;margin-bottom:24px;" cellpadding="16">
            <tr>
                <td style="font-size:13px;color:#777;">Order Number</td>
                <td style="font-size:13px;color:#1a1a1a;font-weight:700;text-align:right;">${order.orderNumber}</td>
            </tr>
            <tr>
                <td style="font-size:13px;color:#777;">Date</td>
                <td style="font-size:13px;color:#1a1a1a;text-align:right;">${new Date(order.createdAt).toLocaleDateString('en-KE', { year: 'numeric', month: 'long', day: 'numeric' })}</td>
            </tr>
            <tr>
                <td style="font-size:13px;color:#777;">Payment Method</td>
                <td style="font-size:13px;color:#1a1a1a;text-align:right;text-transform:capitalize;">${order.paymentMethod}</td>
            </tr>
            <tr>
                <td style="font-size:13px;color:#777;">Delivery To</td>
                <td style="font-size:13px;color:#1a1a1a;text-align:right;">${order.shippingAddress?.city || 'Nairobi'}</td>
            </tr>
        </table>

        <h3 style="font-size:15px;color:#1a1a1a;margin:0 0 12px;letter-spacing:1px;">ORDER ITEMS</h3>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee;border-radius:8px;overflow:hidden;">
            <thead>
                <tr style="background:#f8f9fa;">
                    <th style="padding:10px 12px;text-align:left;font-size:12px;color:#999;text-transform:uppercase;letter-spacing:1px;">Product</th>
                    <th style="padding:10px 12px;text-align:center;font-size:12px;color:#999;text-transform:uppercase;letter-spacing:1px;">Qty</th>
                    <th style="padding:10px 12px;text-align:right;font-size:12px;color:#999;text-transform:uppercase;letter-spacing:1px;">Price</th>
                </tr>
            </thead>
            <tbody>${itemsHtml}</tbody>
        </table>

        <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">
            <tr>
                <td style="font-size:13px;color:#777;padding:4px 0;">Subtotal</td>
                <td style="font-size:13px;color:#333;padding:4px 0;text-align:right;">Ksh ${(order.subtotal || 0).toLocaleString()}</td>
            </tr>
            <tr>
                <td style="font-size:13px;color:#777;padding:4px 0;">Delivery</td>
                <td style="font-size:13px;color:#333;padding:4px 0;text-align:right;">${order.deliveryFee === 0 ? 'FREE' : 'Ksh ' + (order.deliveryFee || 0).toLocaleString()}</td>
            </tr>
            ${order.discount ? `<tr>
                <td style="font-size:13px;color:#777;padding:4px 0;">Discount</td>
                <td style="font-size:13px;color:#22c55e;padding:4px 0;text-align:right;">-Ksh ${(order.discount || 0).toLocaleString()}</td>
            </tr>` : ''}
            <tr style="border-top:2px solid #1a1a1a;">
                <td style="font-size:15px;color:#1a1a1a;font-weight:700;padding:12px 0;">Total</td>
                <td style="font-size:18px;color:#C8A35A;font-weight:700;padding:12px 0;text-align:right;">Ksh ${(order.total || 0).toLocaleString()}</td>
            </tr>
        </table>

        <div style="margin-top:32px;padding:20px;background:#f8f9fa;border-radius:8px;text-align:center;">
            <p style="margin:0 0 8px;font-size:13px;color:#555;">Need help with your order?</p>
            <a href="${STORE_WHATSAPP}" style="display:inline-block;background:#25D366;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600;">Chat on WhatsApp</a>
        </div>
    `);

    return sendEmail({
        to: user.email,
        subject: `Order ${order.orderNumber} Confirmed — ${STORE_NAME}`,
        html
    });
}

async function sendOrderStatusUpdate(order, user, oldStatus) {
    const statusMessages = {
        confirmed: 'Your order has been confirmed and is being prepared.',
        processing: 'Your order is now being processed.',
        packed: 'Your order has been packed and is ready for dispatch.',
        shipped: `Your order has been shipped!${order.trackingNumber ? ` Tracking: ${order.trackingNumber}` : ''}`,
        delivered: 'Your order has been delivered. Thank you for shopping with us!',
        cancelled: 'Your order has been cancelled. If you have questions, please contact us.'
    };

    const statusColors = {
        confirmed: '#22c55e',
        processing: '#3b82f6',
        packed: '#f59e0b',
        shipped: '#8b5cf6',
        delivered: '#22c55e',
        cancelled: '#ef4444'
    };

    const html = emailWrapper(`
        <h2 style="margin:0 0 8px;font-size:24px;color:#1a1a1a;">Order Update</h2>
        <p style="margin:0 0 24px;font-size:13px;color:#C8A35A;letter-spacing:1px;">Your order status has changed</p>

        <p style="font-size:14px;color:#555;margin:0 0 4px;">Hi <strong>${user.name}</strong>,</p>
        <p style="font-size:14px;color:#555;margin:0 0 24px;">${statusMessages[order.status] || `Your order status has been updated to ${order.status}.`}</p>

        <table width="100%" style="background:#f8f9fa;border-radius:8px;padding:16px;margin-bottom:24px;" cellpadding="16">
            <tr>
                <td style="font-size:13px;color:#777;">Order Number</td>
                <td style="font-size:13px;color:#1a1a1a;font-weight:700;text-align:right;">${order.orderNumber}</td>
            </tr>
            <tr>
                <td style="font-size:13px;color:#777;">Previous Status</td>
                <td style="font-size:13px;color:#555;text-align:right;text-transform:capitalize;">${oldStatus}</td>
            </tr>
            <tr>
                <td style="font-size:13px;color:#777;">New Status</td>
                <td style="font-size:13px;font-weight:700;color:${statusColors[order.status] || '#333'};text-align:right;text-transform:capitalize;">${order.status}</td>
            </tr>
            ${order.trackingNumber ? `<tr>
                <td style="font-size:13px;color:#777;">Tracking Number</td>
                <td style="font-size:13px;color:#1a1a1a;font-weight:700;text-align:right;">${order.trackingNumber}</td>
            </tr>` : ''}
            <tr>
                <td style="font-size:13px;color:#777;">Order Total</td>
                <td style="font-size:14px;color:#C8A35A;font-weight:700;text-align:right;">Ksh ${(order.total || 0).toLocaleString()}</td>
            </tr>
        </table>

        <div style="margin-top:32px;padding:20px;background:#f8f9fa;border-radius:8px;text-align:center;">
            <p style="margin:0 0 8px;font-size:13px;color:#555;">Questions about your order?</p>
            <a href="${STORE_WHATSAPP}" style="display:inline-block;background:#25D366;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600;">Chat on WhatsApp</a>
        </div>
    `);

    return sendEmail({
        to: user.email,
        subject: `Order ${order.orderNumber} — ${order.status.charAt(0).toUpperCase() + order.status.slice(1)} | ${STORE_NAME}`,
        html
    });
}

async function sendAdminNewOrder(order, user) {
    const itemsList = order.items.map(i => `${i.name} x${i.quantity}`).join(', ');

    const html = emailWrapper(`
        <h2 style="margin:0 0 8px;font-size:24px;color:#1a1a1a;">New Order Received</h2>
        <p style="margin:0 0 24px;font-size:13px;color:#C8A35A;letter-spacing:1px;">Action required</p>

        <table width="100%" style="background:#f8f9fa;border-radius:8px;padding:16px;margin-bottom:24px;" cellpadding="16">
            <tr>
                <td style="font-size:13px;color:#777;">Order</td>
                <td style="font-size:13px;color:#1a1a1a;font-weight:700;text-align:right;">${order.orderNumber}</td>
            </tr>
            <tr>
                <td style="font-size:13px;color:#777;">Customer</td>
                <td style="font-size:13px;color:#1a1a1a;text-align:right;">${user.name} (${user.email})</td>
            </tr>
            <tr>
                <td style="font-size:13px;color:#777;">Phone</td>
                <td style="font-size:13px;color:#1a1a1a;text-align:right;">${order.shippingAddress?.phone || 'N/A'}</td>
            </tr>
            <tr>
                <td style="font-size:13px;color:#777;">Items</td>
                <td style="font-size:13px;color:#1a1a1a;text-align:right;">${itemsList}</td>
            </tr>
            <tr>
                <td style="font-size:13px;color:#777;">Delivery Address</td>
                <td style="font-size:13px;color:#1a1a1a;text-align:right;">${order.shippingAddress?.address || ''}, ${order.shippingAddress?.city || ''}</td>
            </tr>
            <tr>
                <td style="font-size:13px;color:#777;">Payment</td>
                <td style="font-size:13px;color:#1a1a1a;text-align:right;text-transform:capitalize;">${order.paymentMethod}</td>
            </tr>
            <tr style="border-top:2px solid #1a1a1a;">
                <td style="font-size:15px;color:#1a1a1a;font-weight:700;padding:12px 0;">Total</td>
                <td style="font-size:18px;color:#C8A35A;font-weight:700;padding:12px 0;text-align:right;">Ksh ${(order.total || 0).toLocaleString()}</td>
            </tr>
        </table>

        <div style="text-align:center;margin-top:16px;">
            <a href="https://trendy-frontend-ashen.vercel.app/admin" style="display:inline-block;background:#1a1a1a;color:#C8A35A;padding:12px 32px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:700;letter-spacing:1px;">VIEW IN DASHBOARD</a>
        </div>
    `);

    return sendEmail({
        to: ADMIN_EMAIL,
        subject: `New Order ${order.orderNumber} — Ksh ${(order.total || 0).toLocaleString()} | ${STORE_NAME}`,
        html
    });
}

async function sendContactAcknowledgment({ name, email, subject, message }) {
    const html = emailWrapper(`
        <h2 style="margin:0 0 8px;font-size:24px;color:#1a1a1a;">Message Received</h2>
        <p style="margin:0 0 24px;font-size:13px;color:#C8A35A;letter-spacing:1px;">We'll get back to you shortly</p>

        <p style="font-size:14px;color:#555;margin:0 0 16px;">Hi <strong>${name}</strong>,</p>
        <p style="font-size:14px;color:#555;margin:0 0 24px;">Thank you for reaching out to ${STORE_NAME}. We've received your message and our team will respond within 24 hours.</p>

        <div style="background:#f8f9fa;border-radius:8px;padding:20px;margin-bottom:24px;">
            <p style="margin:0 0 4px;font-size:12px;color:#999;text-transform:uppercase;letter-spacing:1px;">Your Message</p>
            <p style="margin:0;font-size:14px;color:#333;line-height:1.7;">${message}</p>
        </div>

        <div style="text-align:center;margin-top:24px;">
            <a href="${STORE_WHATSAPP}" style="display:inline-block;background:#25D366;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600;">Chat on WhatsApp</a>
        </div>
    `);

    return sendEmail({
        to: email,
        subject: `We've Received Your Message — ${STORE_NAME}`,
        html
    });
}

async function sendAdminNewContact({ name, email, phone, subject, message }) {
    const html = emailWrapper(`
        <h2 style="margin:0 0 8px;font-size:24px;color:#1a1a1a;">New Contact Message</h2>
        <p style="margin:0 0 24px;font-size:13px;color:#C8A35A;letter-spacing:1px;">From the contact form</p>

        <table width="100%" style="background:#f8f9fa;border-radius:8px;padding:16px;margin-bottom:24px;" cellpadding="16">
            <tr>
                <td style="font-size:13px;color:#777;">Name</td>
                <td style="font-size:13px;color:#1a1a1a;text-align:right;">${name}</td>
            </tr>
            <tr>
                <td style="font-size:13px;color:#777;">Email</td>
                <td style="font-size:13px;color:#1a1a1a;text-align:right;">${email}</td>
            </tr>
            <tr>
                <td style="font-size:13px;color:#777;">Phone</td>
                <td style="font-size:13px;color:#1a1a1a;text-align:right;">${phone || 'N/A'}</td>
            </tr>
            <tr>
                <td style="font-size:13px;color:#777;">Subject</td>
                <td style="font-size:13px;color:#1a1a1a;text-align:right;">${subject || 'General Inquiry'}</td>
            </tr>
        </table>

        <div style="background:#f8f9fa;border-radius:8px;padding:20px;margin-bottom:24px;">
            <p style="margin:0 0 4px;font-size:12px;color:#999;text-transform:uppercase;letter-spacing:1px;">Message</p>
            <p style="margin:0;font-size:14px;color:#333;line-height:1.7;">${message}</p>
        </div>

        <div style="text-align:center;margin-top:16px;">
            <a href="https://trendy-frontend-ashen.vercel.app/admin" style="display:inline-block;background:#1a1a1a;color:#C8A35A;padding:12px 32px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:700;letter-spacing:1px;">VIEW IN DASHBOARD</a>
        </div>
    `);

    return sendEmail({
        to: ADMIN_EMAIL,
        subject: `New Contact from ${name} | ${STORE_NAME}`,
        html
    });
}

async function sendAdminContactReply({ name, email }, replyMessage, adminName) {
    const html = emailWrapper(`
        <h2 style="margin:0 0 8px;font-size:24px;color:#1a1a1a;">Reply Sent</h2>
        <p style="margin:0 0 24px;font-size:13px;color:#C8A35A;letter-spacing:1px;">Your message has been answered</p>

        <p style="font-size:14px;color:#555;margin:0 0 16px;">Hi <strong>${name}</strong>,</p>
        <p style="font-size:14px;color:#555;margin:0 0 24px;">Our team has replied to your message:</p>

        <div style="background:#f8f9fa;border-left:3px solid #C8A35A;border-radius:0 8px 8px 0;padding:20px;margin-bottom:24px;">
            <p style="margin:0;font-size:14px;color:#333;line-height:1.7;">${replyMessage}</p>
            <p style="margin:12px 0 0;font-size:12px;color:#999;">— ${adminName}, ${STORE_NAME}</p>
        </div>

        <div style="text-align:center;margin-top:24px;">
            <a href="${STORE_WHATSAPP}" style="display:inline-block;background:#25D366;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600;">Chat on WhatsApp</a>
        </div>
    `);

    return sendEmail({
        to: email,
        subject: `Reply to Your Message — ${STORE_NAME}`,
        html
    });
}

async function sendCheckoutAbandoned(session) {
    const email = session.shippingAddress?.email || session.email;
    if (!email) return null;

    const itemsList = (session.items || []).map(i => `${i.name} x${i.quantity}`).join(', ');
    const total = (session.subtotal || 0).toLocaleString();

    const html = emailWrapper(`
        <h2 style="margin:0 0 8px;font-size:24px;color:#1a1a1a;">You left items in your cart</h2>
        <p style="margin:0 0 24px;font-size:13px;color:#C8A35A;letter-spacing:1px;">Complete your purchase before they sell out</p>

        <p style="font-size:14px;color:#555;margin:0 0 24px;">We noticed you didn't finish checking out. Your items are still waiting for you!</p>

        <div style="background:#f8f9fa;border-radius:8px;padding:16px;margin-bottom:24px;">
            <p style="margin:0 0 8px;font-size:13px;color:#999;text-transform:uppercase;letter-spacing:1px;">Your Cart</p>
            <p style="margin:0;font-size:14px;color:#333;">${itemsList}</p>
            <p style="margin:8px 0 0;font-size:16px;color:#C8A35A;font-weight:700;">Ksh ${total}</p>
        </div>

        <div style="text-align:center;margin-top:16px;">
            <a href="${STORE_URL}/checkout" style="display:inline-block;background:#C8A35A;color:#1a1a1a;padding:12px 32px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:700;letter-spacing:1px;">COMPLETE ORDER</a>
        </div>

        <div style="margin-top:24px;padding:16px;background:#f8f9fa;border-radius:8px;text-align:center;">
            <p style="margin:0 0 8px;font-size:13px;color:#555;">Need help?</p>
            <a href="${STORE_WHATSAPP}" style="display:inline-block;background:#25D366;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600;">Chat on WhatsApp</a>
        </div>
    `);

    return sendEmail({
        to: email,
        subject: `Complete Your Order — ${STORE_NAME}`,
        html
    });
}

async function sendPaymentConfirmation(order, user) {
    const html = emailWrapper(`
        <h2 style="margin:0 0 8px;font-size:24px;color:#1a1a1a;">Payment Confirmed</h2>
        <p style="margin:0 0 24px;font-size:13px;color:#22c55e;letter-spacing:1px;">Your payment has been received</p>

        <p style="font-size:14px;color:#555;margin:0 0 4px;">Hi <strong>${user.name}</strong>,</p>
        <p style="font-size:14px;color:#555;margin:0 0 24px;">We have received your payment for order <strong>${order.orderNumber}</strong>.</p>

        <table width="100%" style="background:#f8f9fa;border-radius:8px;padding:16px;margin-bottom:24px;" cellpadding="16">
            <tr>
                <td style="font-size:13px;color:#777;">Order Number</td>
                <td style="font-size:13px;color:#1a1a1a;font-weight:700;text-align:right;">${order.orderNumber}</td>
            </tr>
            <tr>
                <td style="font-size:13px;color:#777;">Amount Paid</td>
                <td style="font-size:16px;color:#C8A35A;font-weight:700;text-align:right;">Ksh ${(order.total || 0).toLocaleString()}</td>
            </tr>
            <tr>
                <td style="font-size:13px;color:#777;">Payment Method</td>
                <td style="font-size:13px;color:#1a1a1a;text-align:right;text-transform:capitalize;">${order.paymentMethod || 'N/A'}</td>
            </tr>
        </table>

        <div style="text-align:center;margin-top:16px;">
            <a href="${STORE_URL}/orders/${order._id}" style="display:inline-block;background:#1a1a1a;color:#C8A35A;padding:12px 32px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:700;letter-spacing:1px;">VIEW ORDER</a>
        </div>
    `);

    return sendEmail({
        to: user.email,
        subject: `Payment Confirmed — Order ${order.orderNumber} | ${STORE_NAME}`,
        html
    });
}

async function sendBulkEmail({ to, subject, html }) {
    return sendEmail({ to, subject, html });
}

module.exports = {
    sendEmail,
    sendOrderConfirmation,
    sendOrderStatusUpdate,
    sendAdminNewOrder,
    sendContactAcknowledgment,
    sendAdminNewContact,
    sendAdminContactReply,
    sendCheckoutAbandoned,
    sendPaymentConfirmation,
    sendBulkEmail,
    getEmailStats
};
