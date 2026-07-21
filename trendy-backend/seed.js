require('dotenv').config();
const mongoose = require('mongoose');
const Category = require('./models/Category');
const Product = require('./models/Product');
const FAQ = require('./models/FAQ');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/trendy-wardrobe';

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
        console.log('Cleared existing categories, products, and FAQs');

        // Insert categories
        const createdCategories = await Category.insertMany(categories);
        console.log(`Created ${createdCategories.length} categories`);

        // Insert products
        const createdProducts = await Product.insertMany(products);
        console.log(`Created ${createdProducts.length} products`);

        // Insert FAQs
        const createdFAQs = await FAQ.insertMany(faqs);
        console.log(`Created ${createdFAQs.length} FAQs`);

        console.log('\nSeed complete!');
        console.log('Categories:', createdCategories.map(c => c.name).join(', '));
        console.log('Products:', createdProducts.length);
        console.log('FAQs:', createdFAQs.length);

        process.exit(0);
    } catch (err) {
        console.error('Seed error:', err);
        process.exit(1);
    }
}

seed();