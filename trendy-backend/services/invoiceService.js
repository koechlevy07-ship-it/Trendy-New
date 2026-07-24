const { sendEmail } = require('./emailService');

const STORE_NAME = 'Trendy Wardrobe';
const STORE_URL = 'https://trendy-frontend-ashen.vercel.app';

async function generateInvoicePDF(invoice) {
    return `${STORE_URL}/invoices/${invoice.invoiceNumber}.pdf`;
}

async function sendInvoiceEmail(invoice) {
    try {
        const to = invoice.billingAddress?.email || invoice.userId?.email;
        if (!to) return { success: false, error: 'No email address found' };

        const itemsHtml = (invoice.items || []).map(item => `
            <tr>
                <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#333;">${item.name}</td>
                <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#333;text-align:center;">${item.quantity}</td>
                <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#333;text-align:right;">Ksh ${(item.unitPrice || 0).toLocaleString()}</td>
                <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#333;text-align:right;">Ksh ${(item.lineTotal || 0).toLocaleString()}</td>
            </tr>
        `).join('');

        const html = `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"></head>
        <body style="margin:0;padding:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
            <div style="max-width:600px;margin:0 auto;padding:40px;">
                <h2 style="margin:0 0 8px;font-size:24px;color:#1a1a1a;">Invoice ${invoice.invoiceNumber}</h2>
                <p style="margin:0 0 24px;font-size:13px;color:#C8A35A;letter-spacing:1px;">${STORE_NAME}</p>

                <table width="100%" style="background:#f8f9fa;border-radius:8px;padding:16px;margin-bottom:24px;" cellpadding="16">
                    <tr>
                        <td style="font-size:13px;color:#777;">Invoice Number</td>
                        <td style="font-size:13px;color:#1a1a1a;font-weight:700;text-align:right;">${invoice.invoiceNumber}</td>
                    </tr>
                    <tr>
                        <td style="font-size:13px;color:#777;">Date</td>
                        <td style="font-size:13px;color:#1a1a1a;text-align:right;">${new Date(invoice.invoiceDate || invoice.createdAt).toLocaleDateString('en-KE')}</td>
                    </tr>
                    <tr>
                        <td style="font-size:13px;color:#777;">Due Date</td>
                        <td style="font-size:13px;color:#1a1a1a;text-align:right;">${new Date(invoice.dueDate).toLocaleDateString('en-KE')}</td>
                    </tr>
                    <tr>
                        <td style="font-size:13px;color:#777;">Payment Status</td>
                        <td style="font-size:13px;color:${invoice.paymentStatus === 'paid' ? '#22c55e' : '#f59e0b'};text-align:right;text-transform:capitalize;">${invoice.paymentStatus || 'pending'}</td>
                    </tr>
                </table>

                <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee;border-radius:8px;overflow:hidden;">
                    <thead>
                        <tr style="background:#f8f9fa;">
                            <th style="padding:10px 12px;text-align:left;font-size:12px;color:#999;text-transform:uppercase;">Product</th>
                            <th style="padding:10px 12px;text-align:center;font-size:12px;color:#999;text-transform:uppercase;">Qty</th>
                            <th style="padding:10px 12px;text-align:right;font-size:12px;color:#999;text-transform:uppercase;">Price</th>
                            <th style="padding:10px 12px;text-align:right;font-size:12px;color:#999;text-transform:uppercase;">Total</th>
                        </tr>
                    </thead>
                    <tbody>${itemsHtml}</tbody>
                </table>

                <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">
                    <tr>
                        <td style="font-size:13px;color:#777;padding:4px 0;">Subtotal</td>
                        <td style="font-size:13px;color:#333;padding:4px 0;text-align:right;">Ksh ${(invoice.subtotal || 0).toLocaleString()}</td>
                    </tr>
                    ${invoice.tax ? `<tr><td style="font-size:13px;color:#777;padding:4px 0;">Tax</td><td style="font-size:13px;color:#333;padding:4px 0;text-align:right;">Ksh ${(invoice.tax || 0).toLocaleString()}</td></tr>` : ''}
                    ${invoice.deliveryFee ? `<tr><td style="font-size:13px;color:#777;padding:4px 0;">Delivery</td><td style="font-size:13px;color:#333;padding:4px 0;text-align:right;">Ksh ${(invoice.deliveryFee || 0).toLocaleString()}</td></tr>` : ''}
                    ${invoice.discount ? `<tr><td style="font-size:13px;color:#777;padding:4px 0;">Discount</td><td style="font-size:13px;color:#22c55e;padding:4px 0;text-align:right;">-Ksh ${(invoice.discount || 0).toLocaleString()}</td></tr>` : ''}
                    <tr style="border-top:2px solid #1a1a1a;">
                        <td style="font-size:15px;color:#1a1a1a;font-weight:700;padding:12px 0;">Total</td>
                        <td style="font-size:18px;color:#C8A35A;font-weight:700;padding:12px 0;text-align:right;">Ksh ${(invoice.total || 0).toLocaleString()}</td>
                    </tr>
                </table>

                <p style="margin-top:24px;font-size:12px;color:#999;text-align:center;">${invoice.footerText || 'Thank you for shopping with Trendy Wardrobe!'}</p>
            </div>
        </body>
        </html>`;

        await sendEmail({
            to,
            subject: `Invoice ${invoice.invoiceNumber} — ${STORE_NAME}`,
            html
        });

        return { success: true };
    } catch (err) {
        console.error('Invoice email error:', err);
        return { success: false, error: err.message };
    }
}

module.exports = { generateInvoicePDF, sendInvoiceEmail };
