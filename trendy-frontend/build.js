const fs = require('fs');
const path = require('path');

function copyRecursive(src, dest) {
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }
        const files = fs.readdirSync(src);
        for (const file of files) {
            copyRecursive(path.join(src, file), path.join(dest, file));
        }
    } else {
        fs.copyFileSync(src, dest);
    }
}

function build() {
    const publicDir = path.join(__dirname, 'public');

    // Clean and create public directory
    if (fs.existsSync(publicDir)) {
        fs.rmSync(publicDir, { recursive: true, force: true });
    }
    fs.mkdirSync(publicDir, { recursive: true });

    // Files to copy from root
    const rootFiles = [
        'index.html', 'admin.html', 'contact.html', '404.html',
        'about.html', 'terms.html', 'privacy.html', 'product-details.html',
        'cart.html', 'checkout.html', 'wishlist.html', 'order-confirmation.html',
        'account.html', 'robots.txt', 'sitemap.xml', 'manifest.json',
        'manifest.webmanifest', 'favicon.svg', 'sw.js'
    ];

    for (const file of rootFiles) {
        const src = path.join(__dirname, file);
        const dest = path.join(publicDir, file);
        if (fs.existsSync(src)) {
            fs.copyFileSync(src, dest);
            console.log(`Copied: ${file}`);
        } else {
            console.warn(`Warning: ${file} not found`);
        }
    }

    // Directories to copy recursively
    const dirs = ['admin', 'css', 'js', 'assets'];
    for (const dir of dirs) {
        const src = path.join(__dirname, dir);
        const dest = path.join(publicDir, dir);
        if (fs.existsSync(src)) {
            copyRecursive(src, dest);
            console.log(`Copied directory: ${dir}`);
        } else {
            console.warn(`Warning: ${dir} directory not found`);
        }
    }

    console.log('\nBuild completed successfully!');
    console.log(`Output: ${publicDir}`);
}

build();