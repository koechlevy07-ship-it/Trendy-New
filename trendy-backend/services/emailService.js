const nodemailer = require('nodemailer');
const { renderTemplate } = require('./templateRenderer');

class EmailService {
    constructor() {
        this.transporter = null;
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;

        const config = {
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: parseInt(process.env.SMTP_PORT) || 587,
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER || process.env.EMAIL_USER,
                pass: process.env.SMTP_PASS || process.env.EMAIL_PASS
            },
            tls: {
                rejectUnauthorized: process.env.NODE_ENV === 'production'
            }
        };

        this.transporter = nodemailer.createTransport(config);

        // Verify connection
        try {
            await this.transporter.verify();
            console.log('✅ Email service connected');
        } catch (err) {
            console.warn('⚠️ Email service not configured:', err.message);
        }

        this.initialized = true;
    }

    async sendEmail(options) {
        if (!this.initialized) await this.initialize();

        const {
            to,
            from,
            fromName,
            subject,
            html,
            text,
            cc,
            bcc,
            replyTo,
            attachments,
            headers,
            priority,
            messageId,
            inReplyTo,
            references,
            templateId,
            templateData,
            trackOpens = true,
            trackClicks = true
        } = options;

        const mailOptions = {
            from: from || `${fromName || 'Trendy Wardrobe'} <${process.env.SMTP_FROM_EMAIL || 'noreply@trendywardrobe.com'}>`,
            to: Array.isArray(to) ? to.join(', ') : to,
            subject,
            html,
            text: text || this.htmlToText(html),
            cc: cc ? (Array.isArray(cc) ? cc.join(', ') : cc) : undefined,
            bcc: bcc ? (Array.isArray(bcc) ? bcc.join(', ') : bcc) : undefined,
            replyTo: replyTo || process.env.SMTP_REPLY_TO,
            attachments,
            headers: {
                'X-Priority': priority === 'high' ? '1' : priority === 'low' ? '5' : '3',
                'X-Mailer': 'Trendy Wardrobe Marketing Platform',
                'List-Unsubscribe': '<mailto:unsubscribe@trendywardrobe.com>',
                ...headers
            },
            messageId: messageId || `<${Date.now()}.${Math.random().toString(36).substr(2, 9)}@trendywardrobe.com>`,
            inReplyTo,
            references
        };

        // Add tracking pixels for opens and clicks
        if (trackOpens || trackClicks) {
            mailOptions.html = this.addTracking(mailOptions.html, templateId, trackOpens, trackClicks);
        }

        try {
            const info = await this.transporter.sendMail(mailOptions);
            return {
                success: true,
                messageId: info.messageId,
                accepted: info.accepted,
                rejected: info.rejected,
                response: info.response
            };
        } catch (error) {
            console.error('Email send error:', error);
            return {
                success: false,
                error: error.message,
                code: error.code
            };
        }
    }

    async sendBulkEmail(emails, options = {}) {
        if (!this.initialized) await this.initialize();

        const {
            concurrency = 10,
            delay = 100,
            rateLimit = { max: 100, windowMs: 60000 },
            onProgress,
            onComplete,
            onError
        } = options;

        const results = { sent: 0, failed: 0, errors: [] };
        const queue = [...emails];

        // Rate limiter
        const sentTimes = [];
        const checkRateLimit = () => {
            const now = Date.now();
            while (sentTimes.length && sentTimes[0] < now - rateLimit.windowMs) {
                sentTimes.shift();
            }
            return sentTimes.length < rateLimit.max;
        };

        const delayMs = (ms) => new Promise(resolve => setTimeout(resolve, ms));

        const processEmail = async (email) => {
            // Rate limiting
            while (!checkRateLimit()) {
                await delayMs(1000);
            }
            sentTimes.push(Date.now());

            try {
                const result = await this.sendEmail({
                    ...options,
                    to: email.to,
                    subject: email.subject || options.subject,
                    html: email.html || options.html,
                    text: email.text || options.text,
                    from: email.from || options.from,
                    fromName: email.fromName || options.fromName,
                    cc: email.cc || options.cc,
                    bcc: email.bcc || options.bcc,
                    replyTo: email.replyTo || options.replyTo,
                    attachments: email.attachments || options.attachments,
                    headers: { ...options.headers, ...email.headers },
                    priority: email.priority || options.priority,
                    templateId: email.templateId || options.templateId,
                    templateData: { ...options.templateData, ...email.templateData }
                });

                if (result.success) {
                    results.sent++;
                } else {
                    results.failed++;
                    results.errors.push({ email: email.to, error: result.error });
                }

                if (onProgress) onProgress(results, emails.length);
            } catch (error) {
                results.failed++;
                results.errors.push({ email: email.to, error: error.message });
                if (onError) onError(email.to, error);
            }
        };

        // Process with concurrency
        const workers = Array(Math.min(concurrency, queue.length)).fill(null).map(async () => {
            while (queue.length > 0) {
                const email = queue.shift();
                if (email) await processEmail(email);
            }
        });

        await Promise.all(workers);

        if (onComplete) onComplete(results);
        return results;
    }

    async sendTestEmail(template, recipients, testData = {}) {
        const { html, subject } = await this.renderTemplate(template, testData);

        const results = [];
        for (const recipient of recipients) {
            const result = await this.sendEmail({
                to: recipient,
                subject: `[TEST] ${subject}`,
                html,
                text: this.htmlToText(html),
                headers: { 'X-Test-Email': 'true' }
            });
            results.push({ recipient, ...result });
        }

        return results;
    }

    async renderTemplate(template, data = {}) {
        // Support both EmailTemplate model objects and raw template objects
        let html = template.html || template.blocks?.map(b => this.renderBlock(b)).join('') || '';
        let subject = template.subject || template.subjectTemplate || 'Test Email';
        let preheader = template.preheader || template.preheaderTemplate || '';

        // Replace variables in subject
        if (subject) {
            subject = this.replaceVariables(subject, data);
        }
        if (preheader) {
            preheader = this.replaceVariables(preheader, data);
        }
        if (html) {
            html = this.replaceVariables(html, data);
        }

        return { html, subject, preheader };
    }

    replaceVariables(template, data) {
        if (!template) return template;
        return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, key) => {
            const value = this.getNestedValue(data, key);
            return value !== undefined ? value : match;
        });
    }

    getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => current?.[key], obj);
    }

    htmlToText(html) {
        return html
            .replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&/g, '&')
            .replace(/</g, '<')
            .replace(/>/g, '>')
            .trim();
    }

    addTracking(html, templateId, trackOpens, trackClicks) {
        if (!html) return html;

        const trackingBase = process.env.TRACKING_BASE_URL || 'https://trendy-backend-jq27.onrender.com/api/marketing/track';

        // Add open tracking pixel
        if (trackOpens) {
            const openPixel = `<img src="${trackingBase}/open/${templateId}/{{subscriberId}}" width="1" height="1" alt="" style="display:none;" />`;
            html = html.replace('</body>', `${openPixel}</body>`);
        }

        // Add click tracking
        if (trackClicks) {
            // This would need more sophisticated link rewriting
            // For now, we'll add a data attribute
            html = html.replace(/<a\s+/gi, '<a data-track-click="true" ');
        }

        return html;
    }

    renderBlock(block) {
        if (!block) return '';
        switch (block.type) {
            case 'text':
                return `<div style="${this.styleToString(block.settings)}">${block.content.text || ''}</div>`;
            case 'image':
                return `<img src="${block.content.imageUrl}" alt="${block.content.alt || ''}" style="${this.styleToString(block.settings)}" />`;
            case 'button':
                return `<a href="${block.content.url || '#'}" style="${this.styleToString({ ...block.settings, display: 'inline-block' })}">${block.content.text || 'Click Here'}</a>`;
            case 'divider':
                return `<hr style="border:0;border-top:1px solid ${block.settings?.color || '#e5e7eb'};margin:${block.settings?.margin || '20px 0'};" />`;
            case 'spacer':
                return `<div style="height:${block.settings?.height || 20}px;"></div>`;
            case 'html':
                return block.content.html || '';
            default:
                return `<div>${JSON.stringify(block.content)}</div>`;
        }
    }

    styleToString(settings) {
        if (!settings) return '';
        const styleMap = {
            backgroundColor: 'background-color',
            textColor: 'color',
            fontFamily: 'font-family',
            fontSize: 'font-size',
            lineHeight: 'line-height',
            fontWeight: 'font-weight',
            textAlign: 'text-align',
            padding: 'padding',
            margin: 'margin',
            borderRadius: 'border-radius',
            border: 'border',
            boxShadow: 'box-shadow',
            width: 'width',
            maxWidth: 'max-width',
            height: 'height',
            display: 'display'
        };

        return Object.entries(settings)
            .filter(([key]) => styleMap[key])
            .map(([key, value]) => `${styleMap[key]}: ${value};`)
            .join(' ');
    }
}

module.exports = new EmailService();