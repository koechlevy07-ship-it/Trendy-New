const Handlebars = require('handlebars');
const fs = require('fs');
const path = require('path');

// Register custom helpers
Handlebars.registerHelper('eq', (a, b) => a === b);
Handlebars.registerHelper('ne', (a, b) => a !== b);
Handlebars.registerHelper('gt', (a, b) => a > b);
Handlebars.registerHelper('gte', (a, b) => a >= b);
Handlebars.registerHelper('lt', (a, b) => a < b);
Handlebars.registerHelper('lte', (a, b) => a <= b);
Handlebars.registerHelper('and', (a, b) => a && b);
Handlebars.registerHelper('or', (a, b) => a || b);
Handlebars.registerHelper('not', (a) => !a);
Handlebars.registerHelper('ifCond', function(v1, operator, v2, options) {
    switch (operator) {
        case '==': return (v1 == v2) ? options.fn(this) : options.inverse(this);
        case '===': return (v1 === v2) ? options.fn(this) : options.inverse(this);
        case '!=': return (v1 != v2) ? options.fn(this) : options.inverse(this);
        case '!==': return (v1 !== v2) ? options.fn(this) : options.inverse(this);
        case '<': return (v1 < v2) ? options.fn(this) : options.inverse(this);
        case '<=': return (v1 <= v2) ? options.fn(this) : options.inverse(this);
        case '>': return (v1 > v2) ? options.fn(this) : options.inverse(this);
        case '>=': return (v1 >= v2) ? options.fn(this) : options.inverse(this);
        case '&&': return (v1 && v2) ? options.fn(this) : options.inverse(this);
        case '||': return (v1 || v2) ? options.fn(this) : options.inverse(this);
        default: return options.inverse(this);
    }
});
Handlebars.registerHelper('formatCurrency', (value, currency = 'KES') => {
    if (value === null || value === undefined) return '';
    return new Intl.NumberFormat('en-KE', { style: 'currency', currency, minimumFractionDigits: 0 }).format(value);
});
Handlebars.registerHelper('formatDate', (date, format = 'short') => {
    if (!date) return '';
    const d = new Date(date);
    if (format === 'short') return d.toLocaleDateString('en-KE');
    if (format === 'long') return d.toLocaleDateString('en-KE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    if (format === 'time') return d.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('en-KE');
});
Handlebars.registerHelper('formatNumber', (value) => {
    if (value === null || value === undefined) return '';
    return new Intl.NumberFormat('en-KE').format(value);
});
Handlebars.registerHelper('multiply', (a, b) => (a || 0) * (b || 0));
Handlebars.registerHelper('divide', (a, b) => b ? (a || 0) / b : 0);
Handlebars.registerHelper('percentage', (value, total) => total ? ((value / total) * 100).toFixed(1) : 0);
Handlebars.registerHelper('truncate', (str, length = 100) => {
    if (!str) return '';
    return str.length > length ? str.substring(0, length) + '...' : str;
});
Handlebars.registerHelper('capitalize', (str) => {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
});
Handlebars.registerHelper('uppercase', (str) => str ? str.toUpperCase() : '');
Handlebars.registerHelper('lowercase', (str) => str ? str.toLowerCase() : '');
Handlebars.registerHelper('json', (obj) => JSON.stringify(obj, null, 2));
Handlebars.registerHelper('eachWithIndex', function(array, options) {
    if (!array || !array.length) return options.inverse(this);
    return array.map((item, index) => options.fn({ ...item, index, isFirst: index === 0, isLast: index === array.length - 1 })).join('');
});
Handlebars.registerHelper('range', function(start, end, options) {
    let result = '';
    for (let i = start; i <= end; i++) {
        result += options.fn({ index: i });
    }
    return result;
});

class TemplateRenderer {
    constructor() {
        this.compiledTemplates = new Map();
    }

    async render(template, data = {}) {
        // template can be HTML string, compiled template, or template object
        let source = template;
        
        if (typeof template === 'object') {
            source = template.html || template.blocks?.map(b => this.renderBlock(b)).join('') || '';
        }

        const compiled = this.getCompiled(source);
        return compiled(data);
    }

    getCompiled(source) {
        const key = this.hashCode(source);
        if (!this.compiledTemplates.has(key)) {
            this.compiledTemplates.set(key, Handlebars.compile(source, {
                noEscape: true,
                strict: false
            }));
        }
        return this.compiledTemplates.get(key);
    }

    hashCode(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(36);
    }

    renderBlock(block) {
        if (!block) return '';
        
        const settings = block.settings || {};
        const styles = this.settingsToStyles(settings);
        
        switch (block.type) {
            case 'logo':
                return `<div style="${styles}text-align:center;padding:20px 0;">${block.content.logoUrl ? `<img src="${block.content.logoUrl}" alt="${block.content.altText || 'Logo'}" style="max-width:200px;height:auto;" />` : `<span style="font-size:24px;font-weight:bold;color:#C8A35A;">${block.content.siteName || 'Trendy Wardrobe'}</span>`}</div>`;
            
            case 'hero':
                return `<div style="${styles}position:relative;text-align:center;padding:60px 20px;">${block.content.imageUrl ? `<img src="${block.content.imageUrl}" alt="" style="width:100%;height:auto;max-width:600px;display:block;margin:0 auto;" />` : ''}${block.content.headline ? `<h1 style="margin:20px 0 10px;font-size:32px;font-weight:bold;color:${settings.textColor || '#111827'};">${block.content.headline}</h1>` : ''}${block.content.subheadline ? `<p style="font-size:18px;color:${settings.textColor || '#6B7280'};margin-bottom:20px;">${block.content.subheadline}</p>` : ''}${block.content.ctaText && block.content.ctaUrl ? `<a href="${block.content.ctaUrl}" style="display:inline-block;padding:14px 32px;background:${settings.buttonBackgroundColor || '#111827'};color:${settings.buttonTextColor || '#ffffff'};text-decoration:none;border-radius:8px;font-weight:600;font-size:16px;">${block.content.ctaText}</a>` : ''}</div>`;
            
            case 'heading':
                return `<h${block.content.level || 1} style="margin:0 0 16px;font-size:${block.content.size || 28}px;font-weight:bold;color:${settings.textColor || '#111827'};text-align:${settings.alignment || 'left'};">${block.content.text || ''}</h${block.content.level || 1}>`;
            
            case 'text':
                return `<div style="${styles}">${block.content.text || ''}</div>`;
            
            case 'image':
                return `<div style="${styles}text-align:center;"><img src="${block.content.imageUrl || ''}" alt="${block.content.alt || ''}" style="max-width:100%;height:auto;display:block;margin:0 auto;" ${block.content.url ? `onclick="window.open('${block.content.url}')"` : ''} /></div>`;
            
            case 'button':
                return `<div style="${styles}text-align:${settings.alignment || 'center'};"><a href="${block.content.url || '#'}" style="display:inline-block;padding:${settings.padding || '14px 32px'};background:${settings.backgroundColor || '#111827'};color:${settings.textColor || '#ffffff'};text-decoration:none;border-radius:${settings.borderRadius || 8}px;font-weight:600;font-size:${settings.fontSize || 16}px;${settings.fontWeight ? `font-weight:${settings.fontWeight};` : ''}">${block.content.text || 'Click Here'}</a></div>`;
            
            case 'product_grid':
                if (!block.content.products || !block.content.products.length) return '';
                const products = block.content.products.map(p => `
                    <div style="width:${100 / (block.content.columns || 2)}%;padding:10px;box-sizing:border-box;">
                        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
                            ${p.image ? `<img src="${p.image}" alt="${p.name}" style="width:100%;height:200px;object-fit:cover;" />` : ''}
                            <div style="padding:16px;">
                                <h3 style="margin:0 0 8px;font-size:16px;font-weight:600;color:#111827;">${p.name}</h3>
                                ${p.originalPrice && p.originalPrice > p.price ? `<span style="text-decoration:line-through;color:#9ca3af;font-size:14px;">Ksh ${p.originalPrice.toLocaleString()}</span> ` : ''}
                                <span style="font-weight:700;color:#111827;font-size:18px;">Ksh ${p.price.toLocaleString()}</span>
                            </div>
                        </div>
                    </div>
                `).join('');
                return `<div style="${styles}"><div style="display:flex;flex-wrap:wrap;margin:-10px;">${products}</div></div>`;
            
            case 'cta':
                return `<div style="${styles}text-align:center;padding:32px 20px;background:${settings.backgroundColor || '#f9fafb'};border-radius:12px;"><h2 style="margin:0 0 12px;font-size:24px;font-weight:bold;color:#111827;">${block.content.headline || ''}</h2>${block.content.subtext ? `<p style="margin:0 0 20px;font-size:16px;color:#6b7280;">${block.content.subtext}</p>` : ''}<a href="${block.content.url || '#'}" style="display:inline-block;padding:16px 32px;background:${settings.buttonBackgroundColor || '#111827'};color:${settings.buttonTextColor || '#fff'};text-decoration:none;border-radius:8px;font-weight:600;font-size:16px;">${block.content.buttonText || 'Shop Now'}</a></div>`;
            
            case 'divider':
                return `<hr style="border:0;border-top:1px solid ${settings.color || '#e5e7eb'};margin:${settings.margin || '24px 0'};width:${settings.width || '100%'};${settings.alignment ? `margin-left:${settings.alignment === 'left' ? 0 : 'auto'};margin-right:${settings.alignment === 'right' ? 0 : 'auto'}` : ''};" />`;
            
            case 'spacer':
                return `<div style="height:${settings.height || 20}px;"></div>`;
            
            case 'social':
                const icons = {
                    facebook: '📘', twitter: '🐦', instagram: '📷', 
                    linkedin: '💼', youtube: '📺', tiktok: '🎵',
                    whatsapp: '💬', pinterest: '📌'
                };
                const socialLinks = (block.content.links || []).map(l => 
                    `<a href="${l.url}" style="display:inline-block;margin:0 8px;padding:8px;background:#f3f4f6;border-radius:50%;text-decoration:none;">${icons[l.platform] || l.platform}</a>`
                ).join('');
                return `<div style="${styles}text-align:center;">${socialLinks}</div>`;
            
            case 'footer':
                return `<div style="${styles}text-align:center;padding:24px;background:${settings.backgroundColor || '#f9fafb'};border-radius:8px;"><p style="margin:0 0 12px;font-size:14px;color:#6b7280;">${block.content.company || 'Trendy Wardrobe'}</p><p style="margin:0 0 12px;font-size:12px;color:#9ca3af;">${block.content.address || ''}</p><p style="margin:0 0 12px;font-size:12px;color:#9ca3af;"><a href="${block.content.unsubscribeUrl || '#'}" style="color:#9ca3af;">Unsubscribe</a> | <a href="${block.content.preferencesUrl || '#'}" style="color:#9ca3af;">Preferences</a></p></div>`;
            
            case 'html':
                return block.content.html || '';
            
            default:
                return `<div style="${styles}">${JSON.stringify(block.content)}</div>`;
        }
    }

    settingsToStyles(settings) {
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
            display: 'display',
            buttonBackgroundColor: 'background-color',
            buttonTextColor: 'color'
        };

        return Object.entries(settings)
            .filter(([key]) => styleMap[key])
            .map(([key, value]) => `${styleMap[key]}: ${value};`)
            .join(' ');
    }

    // Precompile common templates
    getBaseTemplate() {
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <title>{{subject}}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { margin: 0; padding: 0; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; background-color: #f3f4f6; }
        @media only screen and (max-width: 600px) {
            .mobile-full { width: 100% !important; }
            .mobile-center { text-align: center !important; }
            .mobile-stack { display: block !important; width: 100% !important; }
            .mobile-padding { padding: 16px !important; }
        }
    </style>
</head>
<body style="margin:0;padding:0;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;background-color:#f3f4f6;">
    <div style="max-width:600px;margin:0 auto;padding:20px;">
        {{> content}}
    </div>
    {{#if trackingPixel}}
    <img src="{{trackingPixel}}" width="1" height="1" alt="" style="display:none;" />
    {{/if}}
</body>
</html>
        `;
    }

    renderToString(template, data) {
        const templateFn = Handlebars.compile(template);
        return templateFn(data);
    }
}

module.exports = new TemplateRenderer();