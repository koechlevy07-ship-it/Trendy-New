require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Category = require('./models/Category');
const Product = require('./models/Product');
const FAQ = require('./models/FAQ');
const User = require('./models/User');
const Coupon = require('./models/Coupon');
const FlashSale = require('./models/FlashSale');
const GiftCard = require('./models/GiftCard');
const PromoBanner = require('./models/PromoBanner');
const Promotion = require('./models/Promotion');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/trendy-wardrobe';

// Helper: generate unique slug
function generateSlug(name) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  return `${base}-${timestamp}-${random}`;
}

const categories = [
    { name: 'Trench Coats', slug: 'trench-coats', description: 'Premium executive trench coats for the modern professional', image: 'https://placehold.co/600x400/2C2C2C/C8A35A?text=Trench+Coats', displayOrder: 1, featured: true },
    { name: 'Wardrobe Essentials', slug: 'wardrobe-essentials', description: 'Timeless wardrobe pieces for every occasion', image: 'https://placehold.co/600x400/2C2C2C/C8A35A?text=Wardrobe', displayOrder: 2, featured: true },
    { name: 'Designer Shoes', slug: 'designer-shoes', description: 'Step into luxury with our premium footwear collection', image: 'https://placehold.co/600x400/2C2C2C/C8A35A?text=Shoes', displayOrder: 3, featured: true },
    { name: 'Formal Wear', slug: 'formal-wear', description: 'Executive suits and formal attire', image: 'https://placehold.co/600x400/2C2C2C/C8A35A?text=Formal', displayOrder: 4, featured: false },
    { name: 'Casual Wear', slug: 'casual-wear', description: 'Relaxed styles for everyday luxury', image: 'https://placehold.co/600x400/2C2C2C/C8A35A?text=Casual', displayOrder: 5, featured: false },
    { name: 'Accessories', slug: 'accessories', description: 'Complete your look with premium accessories', image: 'https://placehold.co/600x400/2C2C2C/C8A35A?text=Accessories', displayOrder: 6, featured: false }
];

const products = [
    // Trench Coats - Men
    { name: 'Executive Double-Breasted Trench', description: 'Classic double-breasted trench coat in premium cotton blend. Water-resistant, fully lined, with storm flap and belt. Perfect for the modern executive.', price: 12500, originalPrice: 15000, stock: 25, sku: 'TC-001', category: 'Trench Coats', gender: 'men', images: ['https://placehold.co/600x800/2C2C2C/C8A35A?text=Trench+1'], sizes: ['S', 'M', 'L', 'XL', 'XXL'], colors: ['Black', 'Navy', 'Khaki'], featured: true, isNewArrival: true, isBestSeller: true, status: 'published' },
    { name: 'Slim Fit Rain Trench', description: 'Lightweight slim-fit trench with modern cut. Water-repellent finish, interior pocket, and removable lining for all-season wear.', price: 9800, originalPrice: 12000, stock: 30, sku: 'TC-002', category: 'Trench Coats', gender: 'men', images: ['https://placehold.co/600x800/2C2C2C/C8A35A?text=Trench+2'], sizes: ['S', 'M', 'L', 'XL'], colors: ['Charcoal', 'Olive', 'Camel'], featured: true, isNewArrival: false, isBestSeller: true, status: 'published' },
    { name: 'Heritage Camel Overcoat', description: 'Full-length camel overcoat in Italian wool blend. Peak lapels, double-breasted front, and satin-lined interior.', price: 18500, originalPrice: 22000, stock: 15, sku: 'TC-003', category: 'Trench Coats', gender: 'men', images: ['https://placehold.co/600x800/2C2C2C/C8A35A?text=Trench+3'], sizes: ['M', 'L', 'XL', 'XXL'], colors: ['Camel', 'Black'], featured: true, isNewArrival: true, isBestSeller: false, status: 'published' },
    // Trench Coats - Women
    { name: 'Elegant Belted Trench Coat', description: 'Sophisticated belted trench in premium gabardine. Feminine silhouette with storm shield, epaulettes, and self-tie belt.', price: 11500, originalPrice: 14000, stock: 20, sku: 'TC-004', category: 'Trench Coats', gender: 'women', images: ['https://placehold.co/600x800/2C2C2C/C8A35A?text=Trench+4'], sizes: ['XS', 'S', 'M', 'L', 'XL'], colors: ['Beige', 'Black', 'Dusty Rose'], featured: true, isNewArrival: true, isBestSeller: true, status: 'published' },
    { name: 'Cropped Trench Jacket', description: 'Modern cropped trench with oversized collar. Lightweight cotton blend, perfect for layering. Back vent for ease of movement.', price: 8500, originalPrice: 10000, stock: 35, sku: 'TC-005', category: 'Trench Coats', gender: 'women', images: ['https://placehold.co/600x800/2C2C2C/C8A35A?text=Trench+5'], sizes: ['XS', 'S', 'M', 'L'], colors: ['Ivory', 'Sage', 'Black'], featured: false, isNewArrival: true, isBestSeller: false, status: 'published' },
    // Wardrobe Essentials - Men
    { name: 'Premium Cotton Oxford Shirt', description: 'Classic oxford shirt in 100% Egyptian cotton. Button-down collar, mother-of-pearl buttons, and back pleat for comfort.', price: 4500, originalPrice: 5500, stock: 50, sku: 'WE-001', category: 'Wardrobe Essentials', gender: 'men', images: ['https://placehold.co/600x800/2C2C2C/C8A35A?text=Shirt+1'], sizes: ['S', 'M', 'L', 'XL', 'XXL'], colors: ['White', 'Light Blue', 'Pink'], featured: false, isNewArrival: false, isBestSeller: true, status: 'published' },
    { name: 'Tailored Chino Trousers', description: 'Slim-fit chinos in premium stretch cotton. Flat front, slanted pockets, and tailored hem. Available in versatile colors.', price: 5200, originalPrice: 6500, stock: 40, sku: 'WE-002', category: 'Wardrobe Essentials', gender: 'men', images: ['https://placehold.co/600x800/2C2C2C/C8A35A?text=Chinos'], sizes: ['28', '30', '32', '34', '36', '38'], colors: ['Navy', 'Khaki', 'Charcoal', 'Olive'], featured: false, isNewArrival: false, isBestSeller: true, status: 'published' },
    { name: 'Merino Wool V-Neck Sweater', description: 'Ultra-soft merino wool sweater. Lightweight yet warm, perfect for layering. Ribbed cuffs and hem.', price: 7800, originalPrice: 9500, stock: 30, sku: 'WE-003', category: 'Wardrobe Essentials', gender: 'men', images: ['https://placehold.co/600x800/2C2C2C/C8A35A?text=Sweater+1'], sizes: ['S', 'M', 'L', 'XL', 'XXL'], colors: ['Charcoal', 'Navy', 'Burgundy', 'Forest Green'], featured: false, isNewArrival: true, isBestSeller: false, status: 'published' },
    { name: 'Cashmere Blend Cardigan', description: 'Luxurious cashmere blend cardigan with button front. Shawl collar, patch pockets, and ribbed trim.', price: 14500, originalPrice: 18000, stock: 15, sku: 'WE-004', category: 'Wardrobe Essentials', gender: 'men', images: ['https://placehold.co/600x800/2C2C2C/C8A35A?text=Cardigan'], sizes: ['M', 'L', 'XL', 'XXL'], colors: ['Grey', 'Navy', 'Camel'], featured: true, isNewArrival: false, isBestSeller: false, status: 'published' },
    { name: 'Slim Fit Dress Shirt', description: 'Modern slim-fit dress shirt in poplin cotton. Spread collar, French cuffs, and non-iron finish for easy care.', price: 5200, originalPrice: 6500, stock: 35, sku: 'WE-005', category: 'Wardrobe Essentials', gender: 'men', images: ['https://placehold.co/600x800/2C2C2C/C8A35A?text=Shirt+2'], sizes: ['S', 'M', 'L', 'XL', 'XXL'], colors: ['White', 'Blue', 'Light Grey', 'Lavender'], featured: false, isNewArrival: true, isBestSeller: true, status: 'published' },
    // Wardrobe Essentials - Women
    { name: 'Silk Blend Blouse', description: 'Luxurious silk blend blouse with delicate drape. V-neck, button cuffs, and curved hem. Perfect for office or evening.', price: 6500, originalPrice: 8000, stock: 25, sku: 'WE-006', category: 'Wardrobe Essentials', gender: 'women', images: ['https://placehold.co/600x800/2C2C2C/C8A35A?text=Blouse+1'], sizes: ['XS', 'S', 'M', 'L'], colors: ['Ivory', 'Blush', 'Black'], featured: false, isNewArrival: true, isBestSeller: false, status: 'published' },
    { name: 'High-Waisted Tailored Trousers', description: 'Flattering high-waisted trousers in structured crepe. Side zip, pressed crease, and ankle-length cut.', price: 5800, originalPrice: 7200, stock: 30, sku: 'WE-007', category: 'Wardrobe Essentials', gender: 'women', images: ['https://placehold.co/600x800/2C2C2C/C8A35A?text=Trousers+1'], sizes: ['XS', 'S', 'M', 'L', 'XL'], colors: ['Black', 'Navy', 'Charcoal', 'Cream'], featured: true, isNewArrival: true, isBestSeller: true, status: 'published' },
    { name: 'Silk Blend Blouse', description: 'Luxurious silk blend blouse with delicate drape. V-neck, button cuffs, and curved hem. Perfect for office or evening.', price: 6500, originalPrice: 8000, stock: 25, sku: 'WE-008', category: 'Wardrobe Essentials', gender: 'women', images: ['https://placehold.co/600x800/2C2C2C/C8A35A?text=Blouse+1'], sizes: ['XS', 'S', 'M', 'L'], colors: ['Ivory', 'Blush', 'Black'], featured: false, isNewArrival: true, isBestSeller: false, status: 'published' }
];

const faqs = [
    // General
    { question: 'How do I track my order?', answer: 'Once your order ships, you\'ll receive an email with a tracking number. You can also log into your account and visit <strong>My Orders</strong> to see real-time tracking updates.', category: 'orders', tags: ['tracking', 'shipping', 'orders'], displayOrder: 1 },
    { question: 'What is your return policy?', answer: 'We offer a 30-day return policy for unworn items with original tags attached. Initiate a return from <strong>My Orders</strong> in your account. Refunds are processed within 5-7 business days after we receive the return.', category: 'returns', tags: ['returns', 'exchanges', 'refund'], displayOrder: 2 },
    { question: 'How long does shipping take?', answer: 'Standard delivery within Nairobi: 1-2 business days. Rest of Kenya: 3-5 business days. International orders: 7-14 business days. Express options are available at checkout.', category: 'shipping', tags: ['shipping', 'delivery', 'timeline'], displayOrder: 3 },
    { question: 'Can I modify or cancel my order?', answer: 'Orders can be modified or cancelled within 1 hour of placement. After that, they enter processing. Contact us immediately via WhatsApp for urgent changes.', category: 'orders', tags: ['cancel', 'modify', 'orders'], displayOrder: 4 },
    { question: 'Do you offer international shipping?', answer: 'Yes, we ship worldwide. Shipping costs and delivery times vary by destination. Customs duties and taxes are the responsibility of the recipient.', category: 'shipping', tags: ['international', 'shipping', 'customs'], displayOrder: 5 },
    { question: 'How do I contact customer support?', answer: 'Use the contact form on this page, chat on <a href="https://wa.me/254728985417" target="_blank">WhatsApp</a>, email <a href="mailto:markelpalace@gmail.com">markelpalace@gmail.com</a>, or call <strong>+254 728 985 417</strong>. We\'re available 24/7.', category: 'general', tags: ['support', 'contact', 'help'], displayOrder: 6 },
    // Orders
    { question: 'What payment methods do you accept?', answer: 'We accept M-Pesa, Visa, Mastercard, American Express, and bank transfers. All payments are processed securely.', category: 'payments', tags: ['payment', 'mpesa', 'cards'], displayOrder: 7 },
    { question: 'Can I pay on delivery?', answer: 'Cash on delivery is available within Nairobi for orders under Ksh 50,000. Select "Cash on Delivery" at checkout.', category: 'payments', tags: ['cod', 'cash on delivery'], displayOrder: 8 },
    { question: 'My payment failed but I was charged.', answer: 'Sometimes banks place a temporary hold that appears as a charge. This typically resolves within 24-48 hours. If the charge persists, contact us with your order number and we\'ll investigate.', category: 'payments', tags: ['payment issues', 'refund'], displayOrder: 9 },
    // Shipping
    { question: 'Do you offer free shipping?', answer: 'Free standard shipping on orders over Ksh 15,000 within Kenya. International orders over $500 qualify for free shipping.', category: 'shipping', tags: ['free shipping', 'promotions'], displayOrder: 10 },
    { question: 'Can I change my shipping address after ordering?', answer: 'If your order hasn\'t shipped yet, contact us immediately via WhatsApp. We\'ll do our best to update the address before dispatch.', category: 'shipping', tags: ['address change', 'shipping'], displayOrder: 11 },
    // Returns
    { question: 'How do I initiate a return?', answer: 'Log into your account, go to <strong>My Orders</strong>, select the order, and click "Return Items". Follow the steps to generate a return label and instructions.', category: 'returns', tags: ['returns', 'process'], displayOrder: 12 },
    { question: 'Who pays for return shipping?', answer: 'We cover return shipping for defective or incorrect items. For other returns (size, fit, change of mind), the customer covers return shipping costs.', category: 'returns', tags: ['return shipping', 'costs'], displayOrder: 13 },
    { question: 'How long do refunds take?', answer: 'Refunds are processed within 5-7 business days after we receive your return. The refund will be issued to your original payment method. M-Pesa refunds are typically instant once processed.', category: 'returns', tags: ['refund timeline', 'mpesa'], displayOrder: 14 },
    // Account
    { question: 'How do I create an account?', answer: 'Click the user icon in the top navigation and select "Create Account". You\'ll need to provide your name, email, and create a password.', category: 'account', tags: ['register', 'signup', 'account'], displayOrder: 15 },
    { question: 'I forgot my password. What should I do?', answer: 'Click "Forgot Password" on the login page. Enter your email and we\'ll send you a link to reset your password.', category: 'account', tags: ['password reset', 'forgot password'], displayOrder: 16 },
    { question: 'How do I update my profile information?', answer: 'Log into your account and go to <strong>My Profile</strong>. You can update your name, phone, date of birth, gender, and profile photo.', category: 'account', tags: ['profile', 'update'], displayOrder: 17 },
    { question: 'Can I save multiple addresses?', answer: 'Yes! Go to <strong>Address Book</strong> in your account to save multiple shipping addresses with labels like Home, Work, or Other.', category: 'account', tags: ['addresses', 'address book'], displayOrder: 18 },
    // Products
    { question: 'How do I know my size?', answer: 'Each product page has a size guide. Click "Size Guide" near the size selector. We recommend measuring yourself and comparing to our charts.', category: 'products', tags: ['sizing', 'size guide', 'fit'], displayOrder: 19 },
    { question: 'Are products true to color?', answer: 'We strive for accurate product photos, but colors may vary slightly due to screen settings. Product descriptions include color details.', category: 'products', tags: ['colors', 'accuracy'], displayOrder: 20 },
    { question: 'Do you restock sold-out items?', answer: 'Popular items are often restocked. Click "Notify Me" on the product page to get an email when it\'s back in stock.', category: 'products', tags: ['restock', 'notify', 'stock'], displayOrder: 21 },
    // Technical
    { question: 'The website isn\'t loading properly.', answer: 'Try clearing your browser cache and cookies, or use a different browser. If the issue persists, contact us with details about your device and browser.', category: 'technical', tags: ['website', 'troubleshooting', 'browser'], displayOrder: 22 },
    { question: 'I\'m not receiving order confirmation emails.', answer: 'Check your spam/junk folder. Add <strong>markelpalace@gmail.com</strong> to your contacts. If still missing, contact us and we\'ll resend.', category: 'technical', tags: ['email', 'notifications', 'confirmation'], displayOrder: 23 }
];

async function seed() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        // Clear existing data
        await Category.deleteMany({});
        await Product.deleteMany({});
        await FAQ.deleteMany({});
        await User.deleteMany({});
        console.log('Cleared existing data');

        // Insert categories
        const createdCategories = await Category.insertMany(categories);
        console.log(`Created ${createdCategories.length} categories`);

        // Generate unique slugs for each product
        const productsWithSlugs = products.map(p => {
            const categoryDoc = createdCategories.find(c => c.name === p.category);
            return {
                ...p,
                slug: generateSlug(p.name),
                category: categoryDoc ? categoryDoc._id : null
            };
        });

        // Insert products one by one
        let insertedCount = 0;
        for (const productData of productsWithSlugs) {
            const product = new Product(productData);
            await product.save();
            insertedCount++;
        }
        console.log(`Created ${insertedCount} products`);

        // Insert FAQs
        const createdFAQs = await FAQ.insertMany(faqs);
        console.log(`Created ${createdFAQs.length} FAQs`);

        // ---- USERS ----
        // Admin user
        const adminPassword = await bcrypt.hash('Admin123!', 10);
        await User.create({
            name: 'Admin',
            email: 'admin@trendy.com',
            password: adminPassword,
            role: 'admin',
            isVerified: true,
        });
        console.log('✅ Created admin user: admin@trendy.com / Admin123!');

        // Customer user
        const customerPassword = await bcrypt.hash('Customer123!', 10);
        await User.create({
            name: 'John Customer',
            email: 'customer@example.com',
            password: customerPassword,
            role: 'customer',
            isVerified: true,
        });
        console.log('✅ Created customer user: customer@example.com / Customer123!');

        // ---- COUPONS ----
        const now = new Date();
        const threeMonths = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
        const coupons = [
            { name: 'Welcome Discount', code: 'WELCOME15', description: '15% off your first order', discountType: 'percentage', discountValue: 15, maxDiscount: 5000, minCartValue: 3000, usageLimit: 500, newCustomerOnly: true, status: 'active', startDate: now, endDate: threeMonths },
            { name: 'Flash Sale 10%', code: 'FLASH10', description: '10% off everything', discountType: 'percentage', discountValue: 10, maxDiscount: 3000, minCartValue: 2000, usageLimit: 1000, status: 'active', startDate: now, endDate: threeMonths },
            { name: 'Flat Ksh 500 Off', code: 'SAVE500', description: 'Ksh 500 off orders above Ksh 8,000', discountType: 'fixed', discountValue: 500, minCartValue: 8000, usageLimit: 200, status: 'active', startDate: now, endDate: threeMonths },
            { name: 'Free Shipping', code: 'FREESHIP', description: 'Free delivery on orders over Ksh 5,000', discountType: 'free_shipping', discountValue: 0, minCartValue: 5000, usageLimit: 1000, status: 'active', startDate: now, endDate: threeMonths },
            { name: 'VIP Exclusive 20%', code: 'VIP20', description: '20% off for loyal customers', discountType: 'percentage', discountValue: 20, maxDiscount: 8000, minCartValue: 5000, usageLimit: 100, status: 'active', startDate: now, endDate: threeMonths }
        ];
        for (const c of coupons) {
            await Coupon.findOneAndUpdate({ code: c.code }, c, { upsert: true, new: true });
        }
        console.log(`✅ Created ${coupons.length} coupons`);

        // ---- FLASH SALES ----
        const oneWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const threeDays = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
        const flashProducts = await Product.find({ status: 'published' }).limit(5).lean();
        const flashSaleProducts = flashProducts.map(p => ({
            product: p._id,
            originalPrice: p.originalPrice || p.price,
            salePrice: Math.round((p.originalPrice || p.price) * 0.75),
            discountPercent: 25,
            quantity: -1,
            sold: 0
        }));
        if (flashSaleProducts.length > 0) {
            await FlashSale.findOneAndUpdate(
                { name: 'Weekend Flash Sale' },
                {
                    name: 'Weekend Flash Sale', description: 'Up to 25% off selected items — limited time only!',
                    products: flashSaleProducts, startDate: now, endDate: oneWeek, status: 'active',
                    displaySettings: { showCountdown: true, showBadge: true, badgeText: 'FLASH SALE', badgeColor: '#DC2626' },
                    targeting: { showOnHomepage: true, applicableCustomerSegments: ['all'] }
                },
                { upsert: true, new: true }
            );
            console.log('✅ Created Weekend Flash Sale');
        }

        const midProducts = flashProducts.slice(0, 3).map(p => ({
            product: p._id, originalPrice: p.originalPrice || p.price,
            salePrice: Math.round((p.originalPrice || p.price) * 0.80), discountPercent: 20,
            quantity: -1, sold: 0
        }));
        if (midProducts.length > 0) {
            await FlashSale.findOneAndUpdate(
                { name: 'Midweek Madness' },
                {
                    name: 'Midweek Madness', description: '20% off wardrobe staples',
                    products: midProducts, startDate: now, endDate: threeDays, status: 'active',
                    displaySettings: { showCountdown: true, showBadge: true, badgeText: 'MIDWEEK DEAL', badgeColor: '#7C3AED' },
                    targeting: { showOnHomepage: true, applicableCustomerSegments: ['all'] }
                },
                { upsert: true, new: true }
            );
            console.log('✅ Created Midweek Madness Flash Sale');
        }

        // ---- GIFT CARDS ----
        const giftCards = [
            { code: 'GIFT1000', name: 'Gift Card Ksh 1,000', originalValue: 1000, currentBalance: 1000, type: 'fixed', status: 'active', recipient: 'Gift Recipient', senderName: 'Trendy Wardrobe', channel: 'admin' },
            { code: 'GIFT2500', name: 'Gift Card Ksh 2,500', originalValue: 2500, currentBalance: 2500, type: 'fixed', status: 'active', recipient: 'Gift Recipient', senderName: 'Trendy Wardrobe', channel: 'admin' },
            { code: 'GIFT5000', name: 'Gift Card Ksh 5,000', originalValue: 5000, currentBalance: 5000, type: 'fixed', status: 'active', recipient: 'Gift Recipient', senderName: 'Trendy Wardrobe', channel: 'admin' },
            { code: 'LOYALTY500', name: 'Loyalty Reward Ksh 500', originalValue: 500, currentBalance: 500, type: 'fixed', status: 'active', channel: 'loyalty_reward' }
        ];
        for (const gc of giftCards) {
            await GiftCard.findOneAndUpdate({ code: gc.code }, gc, { upsert: true, new: true });
        }
        console.log(`✅ Created ${giftCards.length} gift cards`);

        // ---- PROMO BANNERS ----
        const banners = [
            { title: 'Grand Opening Sale', subtitle: 'Enjoy 15% off your first order with code WELCOME15', buttonText: 'Shop Now', buttonLink: '/products', location: 'homepage', backgroundColor: '#1A1A1A', textColor: '#C8A35A', status: 'active', displayOrder: 1 },
            { title: 'Free Delivery', subtitle: 'On all orders over Ksh 15,000 — Kenya wide', buttonText: 'View Products', buttonLink: '/products', location: 'homepage', backgroundColor: '#0D3B0D', textColor: '#FFFFFF', status: 'active', displayOrder: 2 },
            { title: 'Gift Cards Available', subtitle: 'The perfect gift for someone special. Available in Ksh 1,000 – 5,000', buttonText: 'Learn More', buttonLink: '/contact.html', location: 'homepage', backgroundColor: '#1A0A2E', textColor: '#C8A35A', status: 'active', displayOrder: 3 }
        ];
        for (const b of banners) {
            await PromoBanner.findOneAndUpdate({ title: b.title }, b, { upsert: true, new: true });
        }
        console.log(`✅ Created ${banners.length} promo banners`);

        // ---- PROMOTIONS ----
        const promos = [
            { name: 'Summer Collection Sale', description: '20% off new arrivals for a limited time', type: 'percentage', discountValue: 20, maxDiscount: 6000, minCartValue: 5000, startDate: now, endDate: threeMonths, status: 'active', rules: [{ type: 'all_products' }] },
            { name: 'Buy 2 Get 10% Off', description: 'Buy 2 or more items and get 10% off', type: 'percentage', discountValue: 10, minQuantity: 2, minCartValue: 4000, startDate: now, endDate: threeMonths, status: 'active', rules: [{ type: 'min_quantity', value: 2 }] }
        ];
        for (const p of promos) {
            await Promotion.findOneAndUpdate({ name: p.name }, p, { upsert: true, new: true });
        }
        console.log(`✅ Created ${promos.length} promotions`);

        console.log('\n✅ Seed complete!');
        console.log(`Categories: ${createdCategories.length}`);
        console.log(`Products: ${insertedCount}`);
        console.log(`FAQs: ${createdFAQs.length}`);
        console.log(`Users: 2 (1 admin, 1 customer)`);
        console.log(`Coupons: ${coupons.length}`);
        console.log(`Flash Sales: 2`);
        console.log(`Gift Cards: ${giftCards.length}`);
        console.log(`Promo Banners: ${banners.length}`);
        console.log(`Promotions: ${promos.length}`);

        process.exit(0);
    } catch (err) {
        console.error('Seed error:', err);
        process.exit(1);
    }
}

seed();