// ============================================================
// PRODUCT DETAILS PAGE — Trendy Wardrobe
// ============================================================

// ---- CONFIG ----
const API_URL = 'https://trendy-backend-jq27.onrender.com/api';

// ---- XSS ----
function escHtml(str) {
    if (str == null) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ---- Image Helper ----
function getImageUrl(path, width) {
    if (!path) return '';
    let url = path.startsWith('http') ? path : path;
    if (url.includes('res.cloudinary.com') && !url.includes('/upload/')) return url;
    if (url.includes('res.cloudinary.com')) {
        const parts = url.split('/upload/');
        if (parts.length === 2) {
            const w = width || 800;
            url = parts[0] + '/upload/f_webp,q_auto,w_' + w + '/' + parts[1];
        }
    }
    return url;
}

// ---- Stock Helpers ----
function getEffectiveStock(product) {
    if (product.soldOut) return 0;
    if (product.stock > 0) return product.stock;
    if (product.limitedAvailable && product.limitedPieces > 0) return product.limitedPieces;
    if (product.preOrder) return 999;
    return 0;
}
function isProductAvailable(product) {
    if (product.soldOut) return false;
    if (product.stock > 0) return true;
    if (product.limitedAvailable && product.limitedPieces > 0) return true;
    if (product.preOrder) return true;
    return false;
}

// ---- Auth ----
function getToken() { return localStorage.getItem('token'); }
function getUser() { const u = localStorage.getItem('user'); return u ? JSON.parse(u) : null; }
function isLoggedIn() { return !!getToken(); }

function authFetch(url, opts = {}) {
    const token = getToken();
    if (!token) return Promise.reject(new Error('Not logged in'));
    const headers = { ...(opts.headers || {}), 'Authorization': `Bearer ${token}` };
    return fetch(url, { ...opts, headers }).then(res => {
        if (res.status === 401 || res.status === 403) { clearAuth(); throw new Error('Session expired'); }
        return res;
    });
}

function setAuth(user, token) {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    updateUI();
}

function clearAuth() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    updateUI();
}

function updateUI() {
    const user = getUser();
    if (user) {
        document.getElementById('userIcon').className = 'fas fa-user-check';
        updateProfileDropdown(user);
        if (document.getElementById('authOverlay').style.display === 'flex') showDashboard(user);
    } else {
        document.getElementById('userIcon').className = 'far fa-user';
        updateProfileDropdown(null);
        if (document.getElementById('authOverlay').style.display === 'flex') showAuthForms();
    }
    updateWishlistIcon();
    updateCartBadge();
}

function updateProfileDropdown(user) {
    const header = document.getElementById('dropdownHeader');
    if (!header) return;
    if (user) {
        header.innerHTML = `<div class="avatar-placeholder">${escHtml(user.name.charAt(0).toUpperCase())}</div><div class="user-name">${escHtml(user.name)}</div><div class="user-email">${escHtml(user.email)}</div>`;
    } else {
        header.innerHTML = `<div class="avatar-placeholder">?</div><div class="user-name">Welcome, Guest</div><div class="user-email">Sign in for personalized experience</div>`;
    }
    document.getElementById('ddLogout').style.display = user ? 'flex' : 'none';
    ['ddProfile','ddOrders','ddWishlist','ddAddresses','ddSettings'].forEach(id => {
        document.getElementById(id).style.display = user ? 'flex' : 'none';
    });
}

// ---- Toast ----
function showToast(msg, type) {
    const toast = document.getElementById('toast');
    const msgEl = document.getElementById('toastMessage');
    if (!toast || !msgEl) { alert(msg); return; }
    msgEl.textContent = msg;
    toast.className = 'toast';
    if (type) toast.classList.add(type);
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), 4000);
}
document.getElementById('toastClose').addEventListener('click', () => {
    document.getElementById('toast').classList.remove('show');
});

// ---- Cart (localStorage-based, consistent with SPA) ----
function getCart() {
    try { return JSON.parse(localStorage.getItem('tw_cart')) || []; } catch(e) { return []; }
}
function saveCart(items) {
    localStorage.setItem('tw_cart', JSON.stringify(items));
    updateCartBadge();
}
function updateCartBadge() {
    const items = getCart();
    const count = items.reduce((s, i) => s + (i.quantity || 1), 0);
    ['cartBadge', 'cartBadgeDesktop', 'mobileCartBadge'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.textContent = count; el.style.display = count > 0 ? 'flex' : 'none'; el.setAttribute('data-count', count); }
    });
}

function addToCart(product) {
    const items = getCart();
    const qty = product.quantity || 1;
    const size = product.size || '';
    const color = product.color || '';
    const effectiveStock = getEffectiveStock(product);
    const idx = items.findIndex(i => i.id === product._id && i.size === size && i.color === color);
    if (idx > -1) {
        if (items[idx].quantity + qty > effectiveStock) {
            showToast(`Only ${effectiveStock} available`, 'error');
            return;
        }
        items[idx].quantity += qty;
    } else {
        if (effectiveStock < 1) {
            showToast('Out of stock', 'error');
            return;
        }
        items.push({
            id: product._id,
            name: product.name,
            price: (product.flashSale && product.flashSalePrice) ? product.flashSalePrice : (product.price || 0),
            originalPrice: product.originalPrice || 0,
            image: (product.images && product.images[0]) ? product.images[0] : (product.thumbnail || ''),
            quantity: qty,
            size: size,
            color: color,
            slug: product.slug || '',
            stock: effectiveStock
        });
    }
    saveCart(items);
    showToast('Added to cart!', 'success');
    if (typeof window.renderMiniCart === 'function') window.renderMiniCart();
}

// ---- Wishlist (localStorage-based) ----
let wishlistItems = [];
function loadWishlist() {
    try { wishlistItems = JSON.parse(localStorage.getItem('tw_wishlist')) || []; } catch(e) { wishlistItems = []; }
    updateWishlistIcon();
}
function saveWishlist() {
    localStorage.setItem('tw_wishlist', JSON.stringify(wishlistItems));
    updateWishlistIcon();
    if (isLoggedIn()) {
        authFetch(`${API_URL}/wishlist`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: wishlistItems })
        }).catch(() => {});
    }
}
function isInWishlist(id) {
    return wishlistItems.includes(id);
}
function updateWishlistIcon() {
    // Desktop
    const icon = document.getElementById('wishlistIconDesktop');
    if (icon) {
        icon.className = wishlistItems.length > 0 ? 'fas fa-heart heart-icon liked' : 'far fa-heart heart-icon';
    }
    // Badge
    ['wishlistBadge', 'wishlistBadgeDesktop'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = wishlistItems.length;
            el.style.display = wishlistItems.length > 0 ? 'flex' : 'none';
        }
    });
    // Mobile badge
    const mb = document.getElementById('mobileWishlistBadge');
    if (mb) {
        mb.textContent = wishlistItems.length;
        mb.style.display = wishlistItems.length > 0 ? 'flex' : 'none';
    }
    // Product details page wishlist button
    const btn = document.getElementById('pdWishlistBtn');
    if (btn && currentProduct) {
        const liked = isInWishlist(currentProduct._id);
        btn.classList.toggle('liked', liked);
        btn.querySelector('i').className = liked ? 'fas fa-heart' : 'far fa-heart';
        btn.setAttribute('aria-label', liked ? 'Remove from wishlist' : 'Add to wishlist');
    }
}

function toggleWishlist(product) {
    if (!product) return;
    const id = product._id || product;
    const idx = wishlistItems.indexOf(id);
    if (idx > -1) {
        wishlistItems.splice(idx, 1);
        showToast('Removed from wishlist', 'info');
    } else {
        wishlistItems.push(id);
        showToast('Added to wishlist!', 'success');
        // Sync with backend
        if (isLoggedIn()) {
            authFetch(`${API_URL}/wishlist`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ productId: id })
            }).catch(() => {});
        }
    }
    saveWishlist();
}

// ---- Recently Viewed ----
function trackRecentlyViewed(product) {
    if (!product || !product._id) return;
    let viewed = [];
    try { viewed = JSON.parse(localStorage.getItem('tw_recently')) || []; } catch(e) {}
    viewed = viewed.filter(v => v._id !== product._id);
    viewed.unshift({
        _id: product._id,
        name: product.name,
        price: product.price,
        originalPrice: product.originalPrice,
        images: product.images || [product.thumbnail].filter(Boolean),
        rating: product.rating || 0,
        totalReviews: product.totalReviews || 0,
        category: product.category,
        brand: product.brand
    });
    if (viewed.length > 12) viewed = viewed.slice(0, 12);
    localStorage.setItem('tw_recently', JSON.stringify(viewed));
}

// ---- Render product card (for related/recently) ----
function renderMiniProductCard(product) {
    const img = product.images && product.images[0] ? getImageUrl(product.images[0], 400) : 'https://placehold.co/300x400/FAF9F6/C8A35A?text=Product';
    const discount = product.originalPrice && product.originalPrice > product.price
        ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100) : 0;
    const stars = Array.from({length: 5}, (_, i) => `<i class="fas fa-star ${i < Math.round(product.rating || 0) ? '' : 'empty'}"></i>`).join('');
    return `
        <article class="product-card" onclick="window.location.href='/product-details.html?id=${product._id}'">
            <div class="product-image-wrap">
                <img src="${img}" alt="${escHtml(product.name)}" loading="lazy" />
                ${discount ? `<span class="badge-discount">-${discount}%</span>` : ''}
                ${!isProductAvailable(product) ? '<span class="badge-out">Out of Stock</span>' : ''}
                ${product.isNewArrival ? '<span class="badge-new">New</span>' : ''}
            </div>
            <div class="product-info">
                <div class="product-brand">${escHtml(product.brand || product.category || 'Trendy Wardrobe')}</div>
                <div class="product-name">${escHtml(product.name)}</div>
                <div class="product-rating">
                    <span class="stars">${stars}</span>
                    ${product.totalReviews ? `<span class="count">(${product.totalReviews})</span>` : ''}
                </div>
                <div class="product-price-row">
                    <span class="current">Ksh ${(product.price || 0).toLocaleString()}</span>
                    ${discount ? `<span class="original">Ksh ${product.originalPrice.toLocaleString()}</span>` : ''}
                </div>
            </div>
        </article>`;
}

// ---- State ----
let currentProduct = null;
let currentGalleryIndex = 0;

// ---- DOM refs ----
const $ = id => document.getElementById(id);
const pdLoading = $('pdLoading');
const pdError = $('pdError');
const pdContent = $('pdContent');
const pdErrorMessage = $('pdErrorMessage');

// ---- Init ----
async function init() {
    const params = new URLSearchParams(window.location.search);
    const productId = params.get('id');

    if (!productId) {
        showError('No product ID specified. Please select a product from the store.');
        return;
    }

    try {
        const res = await fetch(`${API_URL}/products/${productId}`);
        if (!res.ok) throw new Error('Product not found');
        const raw = await res.json();
        const product = raw.data || raw;
        if (!product || !product._id) throw new Error('Invalid product data');

        currentProduct = product;
        renderProduct(product);
        reviewPage = 1;
        loadReviews(product._id);
        loadQA(product._id);
        loadRelated(product._id);
        updateUI();
        loadWishlist();

    } catch (err) {
        showError(err.message || 'Could not load product. Please try again.');
    }
}

function showError(msg) {
    pdLoading.style.display = 'none';
    pdError.style.display = 'flex';
    pdErrorMessage.textContent = msg;
}

// ---- Render Product ----
function renderProduct(p) {
    pdLoading.style.display = 'none';
    pdContent.style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });

    const inStock = isProductAvailable(p);
    const effectiveStock = getEffectiveStock(p);
    const displayPrice = (p.flashSale && p.flashSalePrice) ? p.flashSalePrice : p.price;
    const discount = p.originalPrice && p.originalPrice > p.price ? Math.round(((p.originalPrice - p.price) / p.originalPrice) * 100) : 0;

    // Page title & meta
    document.title = `${p.name} — Trendy Wardrobe | Ksh ${p.price.toLocaleString()}`;

    // Dynamic meta tags
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.content = (p.description || '').replace(/<[^>]+>/g, '').substring(0, 160);
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.content = `${p.name} — Trendy Wardrobe`;
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.content = (p.description || '').replace(/<[^>]+>/g, '').substring(0, 160);
    const ogImage = document.querySelector('meta[property="og:image"]');
    if (ogImage && p.images && p.images[0]) ogImage.content = p.images[0];
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.href = window.location.href.split('?')[0] + '?id=' + p._id;

    // Product JSON-LD Schema
    const existingSchema = document.getElementById('productSchema');
    if (existingSchema) existingSchema.remove();
    const productSchema = {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": p.name,
        "description": (p.description || '').replace(/<[^>]+>/g, ''),
        "image": p.images || [],
        "sku": p.sku || undefined,
        "brand": p.brand ? { "@type": "Brand", "name": p.brand } : undefined,
        "category": p.category || undefined,
        "offers": {
            "@type": "Offer",
            "priceCurrency": "KES",
            "price": p.price,
            "availability": isProductAvailable(p) ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
            "url": window.location.href.split('?')[0] + '?id=' + p._id
        },
        "aggregateRating": p.rating ? {
            "@type": "AggregateRating",
            "ratingValue": p.rating,
            "reviewCount": p.totalReviews || 0
        } : undefined
    };
    const schemaScript = document.createElement('script');
    schemaScript.id = 'productSchema';
    schemaScript.type = 'application/ld+json';
    schemaScript.textContent = JSON.stringify(productSchema);
    document.head.appendChild(schemaScript);

    // Breadcrumb
    const breadCat = $('pdBreadCategory');
    if (p.category) {
        breadCat.textContent = p.category.replace(/-/g, ' ').toUpperCase();
        breadCat.href = `/?category=${p.category}`;
    } else {
        breadCat.textContent = 'Products';
    }
    $('pdBreadCurrent').textContent = p.name;

    // Gallery
    renderGallery(p);

    // Badges
    renderBadges(p);

    // Brand
    $('pdBrand').textContent = p.brand || '';

    // Name
    $('pdName').textContent = p.name;

    // Rating
    renderRating(p);

    // Price
    let priceHtml = `Ksh ${displayPrice.toLocaleString()}`;
    if (p.originalPrice && p.originalPrice > p.price) {
        priceHtml += ` <span class="pd-original">Ksh ${p.originalPrice.toLocaleString()}</span>`;
        priceHtml += ` <span class="pd-discount">-${discount}%</span>`;
    }
    $('pdPrice').innerHTML = priceHtml;

    // Flash sale timer
    if (p.flashSale && p.flashSaleEnd && new Date(p.flashSaleEnd) > new Date()) {
        const timer = $('pdFlashTimer');
        timer.style.display = 'flex';
        timer.innerHTML = `<i class="fas fa-bolt"></i> Flash sale ends in <div class="pd-timer" id="pdTimer"></div>`;
        startFlashTimer(p.flashSaleEnd);
    }

    // Installment
    if (p.installmentEligible && p.installmentPrice) {
        const inst = $('pdInstallment');
        inst.style.display = 'block';
        const payments = Math.ceil(displayPrice / p.installmentPrice);
        inst.innerHTML = `<i class="fas fa-credit-card"></i> Lipa Mdogo Mdogo: ${payments}x Ksh ${p.installmentPrice.toLocaleString()}/mo`;
    }

    // Short description
    $('pdShortDesc').textContent = p.shortDescription || p.description || '';

    // Colors
    renderColors(p);

    // Sizes
    renderSizes(p);

    // Stock
    const stockEl = $('pdStock');
    if (!inStock) {
        stockEl.className = 'pd-stock out-of-stock';
        stockEl.innerHTML = '<i class="fas fa-times-circle"></i> Out of Stock';
        $('pdAddToCart').disabled = true;
        $('pdBuyNow').disabled = true;
    } else if (effectiveStock <= 5) {
        stockEl.className = 'pd-stock low-stock';
        stockEl.innerHTML = `<i class="fas fa-exclamation-circle"></i> Only ${effectiveStock} left in stock`;
    } else {
        stockEl.className = 'pd-stock in-stock';
        stockEl.innerHTML = `<i class="fas fa-check-circle"></i> In Stock — ${effectiveStock} available`;
    }
    if (qtyInput) qtyInput.max = effectiveStock || 1;

    // Delivery info
    if (p.deliveryEstimate) {
        const delEl = $('pdDeliveryEstimate');
        if (delEl) delEl.textContent = p.deliveryEstimate;
    }

    // Meta
    $('pdSku').textContent = p.sku || 'N/A';
    $('pdCategory').textContent = p.category ? p.category.replace(/-/g, ' ') : 'N/A';
    $('pdBrandMeta').textContent = p.brand || 'N/A';
    $('pdMaterial').textContent = p.material || 'N/A';

    // Tags
    if (p.tags && p.tags.length) {
        $('pdTagsWrap').style.display = 'flex';
        $('pdTags').textContent = p.tags.join(', ');
    }

    // Description
    $('pdFullDescription').innerHTML = p.description ? p.description : '<p>No description available.</p>';

    // Specifications
    renderSpecs(p);

    // Update wishlist button state
    updateWishlistIcon();
}

// ---- Gallery ----
function renderGallery(p) {
    const images = p.images && p.images.length ? p.images : (p.thumbnail ? [p.thumbnail] : []);
    currentGalleryIndex = 0;

    const mainImg = $('pdMainImage');
    const thumbnails = $('pdThumbnails');
    const indicator = $('pdGalleryIndicator');
    const prevBtn = $('pdGalleryPrev');
    const nextBtn = $('pdGalleryNext');

    if (images.length === 0) {
        mainImg.src = 'https://placehold.co/600x750/FAF9F6/C8A35A?text=No+Image';
        return;
    }

    function showImage(index) {
        currentGalleryIndex = index;
        mainImg.src = getImageUrl(images[index], 800);
        // Update thumbnails
        thumbnails.querySelectorAll('img').forEach((img, i) => {
            img.classList.toggle('active', i === index);
        });
        // Update indicator
        indicator.querySelectorAll('span').forEach((dot, i) => {
            dot.classList.toggle('active', i === index);
        });
    }

    // Main image
    mainImg.src = getImageUrl(images[0], 800);

    // Thumbnails
    thumbnails.innerHTML = images.map((img, i) =>
        `<img src="${getImageUrl(img, 200)}" alt="${escHtml(p.name)} ${i+1}" class="${i === 0 ? 'active' : ''}" data-index="${i}" />`
    ).join('');
    thumbnails.querySelectorAll('img').forEach(el => {
        el.addEventListener('click', () => showImage(parseInt(el.dataset.index)));
    });

    // Indicator dots
    indicator.innerHTML = images.map((_, i) => `<span class="${i === 0 ? 'active' : ''}" data-index="${i}"></span>`).join('');
    indicator.querySelectorAll('span').forEach(el => {
        el.addEventListener('click', () => showImage(parseInt(el.dataset.index)));
    });

    // Prev/Next
    prevBtn.addEventListener('click', () => {
        const i = (currentGalleryIndex - 1 + images.length) % images.length;
        showImage(i);
    });
    nextBtn.addEventListener('click', () => {
        const i = (currentGalleryIndex + 1) % images.length;
        showImage(i);
    });

    // Keyboard
    document.addEventListener('keydown', function galleryKey(e) {
        if (e.key === 'ArrowLeft') { prevBtn.click(); }
        if (e.key === 'ArrowRight') { nextBtn.click(); }
    });

    // Touch swipe for gallery
    let touchStartX = 0;
    const wrap = $('pdMainImageWrap');
    wrap.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
    wrap.addEventListener('touchend', e => {
        const diff = touchStartX - e.changedTouches[0].clientX;
        if (Math.abs(diff) > 50) {
            if (diff > 0) nextBtn.click();
            else prevBtn.click();
        }
    }, { passive: true });

    // Image zoom (desktop only)
    setupImageZoom(mainImg, p);
}

// ---- Image Zoom ----
function setupImageZoom(mainImg, p) {
    const wrap = $('pdMainImageWrap');
    const lens = $('pdZoomLens');
    const result = $('pdZoomResult');
    const images = (p.images && p.images.length) ? p.images : (p.thumbnail ? [p.thumbnail] : []);

    if (window.innerWidth < 1024 || images.length === 0) return;

    wrap.addEventListener('mouseenter', () => {
        lens.style.display = 'block';
        result.style.display = 'block';
        result.style.backgroundImage = `url(${getImageUrl(images[currentGalleryIndex] || images[0], 1200)})`;
    });

    wrap.addEventListener('mouseleave', () => {
        lens.style.display = 'none';
        result.style.display = 'none';
    });

    wrap.addEventListener('mousemove', (e) => {
        const rect = wrap.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const lensW = lens.offsetWidth;
        const lensH = lens.offsetHeight;
        const imgW = wrap.offsetWidth;
        const imgH = wrap.offsetHeight;

        let lx = x - lensW / 2;
        let ly = y - lensH / 2;
        lx = Math.max(0, Math.min(lx, imgW - lensW));
        ly = Math.max(0, Math.min(ly, imgH - lensH));

        lens.style.left = lx + 'px';
        lens.style.top = ly + 'px';

        const resultW = result.offsetWidth;
        const resultH = result.offsetHeight;
        const ratioX = resultW / lensW;
        const ratioY = resultH / lensH;

        result.style.backgroundPosition = `-${lx * ratioX}px -${ly * ratioY}px`;
        result.style.backgroundSize = `${imgW * ratioX}px ${imgH * ratioY}px`;
    });
}

// ---- Badges ----
function renderBadges(p) {
    const container = $('pdBadges');
    const badges = [];
    if (p.flashSale && p.flashSaleEnd && new Date(p.flashSaleEnd) > new Date()) badges.push('<span class="pd-badge flash-sale">⚡ Flash Sale</span>');
    if (p.isNewArrival) badges.push('<span class="pd-badge new">New Arrival</span>');
    if (p.isBestSeller) badges.push('<span class="pd-badge best-seller">Best Seller</span>');
    if (p.featured) badges.push('<span class="pd-badge featured">Featured</span>');
    if (p.sponsored) badges.push('<span class="pd-badge sponsored">Sponsored</span>');
    if (p.preOrder) badges.push('<span class="pd-badge pre-order">Pre-Order</span>');
    if (p.limitedAvailable && p.limitedPieces && p.limitedPieces <= 10) badges.push(`<span class="pd-badge limited">Only ${p.limitedPieces} Left</span>`);
    if (p.installmentEligible) badges.push('<span class="pd-badge installment">Lipa Mdogo Mdogo</span>');
    container.innerHTML = badges.join('');
}

// ---- Rating ----
function renderRating(p) {
    const rating = p.rating || 0;
    const fullStars = Math.floor(rating);
    const hasHalf = rating % 1 >= 0.5;
    const stars = Array.from({length: 5}, (_, i) =>
        `<i class="fas fa-star ${i < fullStars ? '' : (i === fullStars && hasHalf ? 'half' : 'empty')}"></i>`
    ).join('');
    $('pdStars').innerHTML = stars;
    const score = $('pdRatingScore');
    const count = $('pdRatingCount');
    if (rating > 0) {
        score.textContent = rating.toFixed(1);
        count.textContent = p.totalReviews || 0;
    } else {
        score.textContent = 'No ratings';
        count.textContent = '';
    }
}

// ---- Colors ----
function renderColors(p) {
    const section = $('pdColorSection');
    const nameEl = $('pdColorName');
    const chips = $('pdColorChips');

    if (!p.colors || !p.colors.length) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'flex';
    const swatches = p.colorSwatches || [];
    chips.innerHTML = p.colors.map((color, i) => {
        const swatch = swatches[i];
        const bg = swatch && swatch.hex ? swatch.hex : (swatch && swatch.name ? '#' + swatch.name : '#ccc');
        const hexColor = swatch && swatch.hex ? swatch.hex : color;
        return `<button class="pd-color-chip ${i === 0 ? 'active' : ''}" data-color="${escHtml(color)}" style="background:${hexColor};" title="${escHtml(color)}"></button>`;
    }).join('');

    nameEl.textContent = p.colors[0] || '—';
    chips.querySelectorAll('.pd-color-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            chips.querySelectorAll('.pd-color-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            nameEl.textContent = chip.dataset.color;
        });
    });
}

// ---- Sizes ----
function renderSizes(p) {
    const section = $('pdSizeSection');
    const nameEl = $('pdSizeName');
    const chips = $('pdSizeChips');

    if (!p.sizes || !p.sizes.length) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'flex';
    chips.innerHTML = p.sizes.map((size, i) =>
        `<button class="pd-size-chip ${i === 0 ? 'active' : ''}" data-size="${escHtml(size)}">${escHtml(size)}</button>`
    ).join('');

    nameEl.textContent = p.sizes[0] || '—';
    chips.querySelectorAll('.pd-size-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            chips.querySelectorAll('.pd-size-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            nameEl.textContent = chip.dataset.size;
        });
    });
}

// ---- Flash Sale Timer ----
function startFlashTimer(endDate) {
    const timer = $('pdTimer');
    if (!timer) return;
    function update() {
        const diff = new Date(endDate) - new Date();
        if (diff <= 0) {
            timer.textContent = 'Ended';
            return;
        }
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        timer.innerHTML = `<span>${String(h).padStart(2,'0')}</span>:<span>${String(m).padStart(2,'0')}</span>:<span>${String(s).padStart(2,'0')}</span>`;
    }
    update();
    setInterval(update, 1000);
}

// ---- Specs ----
function renderSpecs(p) {
    const table = $('pdSpecsTable');
    const empty = $('pdSpecsEmpty');
    if (p.specifications && p.specifications.length) {
        empty.style.display = 'none';
        table.style.display = 'table';
        table.innerHTML = p.specifications.map(s =>
            `<tr><th>${escHtml(s.key)}</th><td>${escHtml(s.value)}</td></tr>`
        ).join('');
    } else {
        table.style.display = 'none';
        empty.style.display = 'block';
    }
}

// ---- Tabs ----
document.querySelectorAll('.pd-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.pd-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.pd-tab-pane').forEach(p => p.classList.remove('active'));
        const tab = document.getElementById('tab-' + btn.dataset.tab);
        if (tab) tab.classList.add('active');
    });
});

// Size guide tabs
document.querySelectorAll('.pd-size-tab').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.pd-size-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.pd-size-table-wrap').forEach(w => w.classList.remove('active'));
        const sg = document.getElementById('sg-' + btn.dataset.sg);
        if (sg) sg.classList.add('active');
    });
});

// ---- Size Guide Button ----
document.getElementById('pdSizeGuideBtn')?.addEventListener('click', () => {
    document.querySelectorAll('.pd-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.pd-tab-pane').forEach(p => p.classList.remove('active'));
    document.querySelector('.pd-tab-btn[data-tab="size-guide"]')?.classList.add('active');
    document.getElementById('tab-size-guide')?.classList.add('active');
    document.getElementById('pdTabsNav')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// ---- Quantity ----
const qtyInput = $('pdQtyInput');
$('pdQtyMinus').addEventListener('click', () => {
    const v = parseInt(qtyInput.value) || 1;
    if (v > 1) qtyInput.value = v - 1;
});
$('pdQtyPlus').addEventListener('click', () => {
    const max = parseInt(qtyInput.max) || 99;
    const v = parseInt(qtyInput.value) || 1;
    if (v < max) qtyInput.value = v + 1;
});
qtyInput.addEventListener('change', () => {
    let v = parseInt(qtyInput.value) || 1;
    const max = parseInt(qtyInput.max) || 99;
    if (v < 1) v = 1;
    if (v > max) v = max;
    qtyInput.value = v;
});

// ---- Add to Cart ----
$('pdAddToCart').addEventListener('click', () => {
    if (!currentProduct) return;
    const colorSection = $('pdColorSection');
    const sizeSection = $('pdSizeSection');
    if (colorSection && colorSection.style.display !== 'none' && !document.querySelector('.pd-color-chip.active')) {
        showToast('Please select a color', 'error'); return;
    }
    if (sizeSection && sizeSection.style.display !== 'none' && !document.querySelector('.pd-size-chip.active')) {
        showToast('Please select a size', 'error'); return;
    }
    const qty = parseInt(qtyInput.value) || 1;
    const size = document.querySelector('.pd-size-chip.active')?.dataset.size || '';
    const color = document.querySelector('.pd-color-chip.active')?.dataset.color || '';
    const item = { ...currentProduct, quantity: qty, size, color };
    addToCart(item);
});

// ---- Buy Now ----
$('pdBuyNow').addEventListener('click', () => {
    if (!currentProduct) return;
    if (!isLoggedIn()) {
        showToast('Please log in to purchase', 'error');
        openAuthModal();
        return;
    }
    const colorSection = $('pdColorSection');
    const sizeSection = $('pdSizeSection');
    if (colorSection && colorSection.style.display !== 'none' && !document.querySelector('.pd-color-chip.active')) {
        showToast('Please select a color', 'error'); return;
    }
    if (sizeSection && sizeSection.style.display !== 'none' && !document.querySelector('.pd-size-chip.active')) {
        showToast('Please select a size', 'error'); return;
    }
    const qty = parseInt(qtyInput.value) || 1;
    const size = document.querySelector('.pd-size-chip.active')?.dataset.size || '';
    const color = document.querySelector('.pd-color-chip.active')?.dataset.color || '';
    const item = { ...currentProduct, quantity: qty, size, color };
    addToCart(item);
    setTimeout(openCheckout, 300);
});

// ---- Wishlist ----
$('pdWishlistBtn').addEventListener('click', () => {
    if (!currentProduct) return;
    toggleWishlist(currentProduct);
});

// ---- Share ----
$('pdShareBtn').addEventListener('click', () => {
    const url = window.location.href;
    if (navigator.share) {
        navigator.share({ title: currentProduct?.name || 'Trendy Wardrobe', text: 'Check out this product!', url });
    } else {
        navigator.clipboard.writeText(url).then(() => {
            showToast('Link copied to clipboard!', 'success');
        }).catch(() => {
            showToast('Share: ' + url, 'info');
        });
    }
});

// ---- Compare ----
$('pdCompareBtn').addEventListener('click', () => {
    if (!currentProduct) return;
    let compare = [];
    try { compare = JSON.parse(localStorage.getItem('tw_compare')) || []; } catch(e) {}
    if (compare.find(c => c._id === currentProduct._id)) {
        showToast('Already in comparison', 'info');
        return;
    }
    if (compare.length >= 4) {
        showToast('Maximum 4 products for comparison', 'error');
        return;
    }
    compare.push(currentProduct);
    localStorage.setItem('tw_compare', JSON.stringify(compare));
    showToast('Added to comparison', 'success');
});

// ---- Reviews ----
let reviewPage = 1;
const REVIEW_LIMIT = 5;
let totalReviewPages = 1;

async function loadReviews(productId, append = false) {
    const list = $('pdReviewsList');
    try {
        const res = await fetch(`${API_URL}/reviews/product/${productId}?page=${reviewPage}&limit=${REVIEW_LIMIT}`);
        const raw = await res.json();
        const reviews = raw.data || raw || [];
        const pagination = raw.pagination || {};
        totalReviewPages = pagination.pages || 1;

        if (!append) {
            // Summary
            const summary = $('pdReviewsSummary');
            const stats = raw.stats || {};
            if (stats.totalReviews > 0) {
                const avgRating = stats.avgRating || 0;
                const totalReviews = stats.totalReviews;
                const stars = Array.from({length: 5}, (_, i) =>
                    `<i class="fas fa-star ${i < Math.round(avgRating) ? '' : 'empty'}"></i>`
                ).join('');
                summary.innerHTML = `<span>${stars}</span> <strong>${avgRating.toFixed(1)}</strong> (${totalReviews} review${totalReviews !== 1 ? 's' : ''})`;
            } else {
                summary.innerHTML = '<span style="color:var(--text-secondary);font-size:0.85rem;">No reviews yet. Be the first to review!</span>';
            }
        }

        const renderReview = (r) => {
            const rStars = Array.from({length: 5}, (_, i) =>
                `<i class="fas fa-star ${i < (r.rating || 0) ? '' : 'empty'}"></i>`
            ).join('');
            const initial = (r.userName || r.name || 'A').charAt(0).toUpperCase();
            return `
                <div class="pd-review-card">
                    <div class="pd-review-header">
                        <div class="pd-review-avatar">${initial}</div>
                        <div class="pd-review-author">
                            <strong>${escHtml(r.userName || r.name || 'Anonymous')}</strong>
                            <span class="pd-review-date">${r.createdAt ? new Date(r.createdAt).toLocaleDateString() : ''}</span>
                        </div>
                        <div class="pd-review-stars">${rStars}</div>
                    </div>
                    ${r.title ? `<div class="pd-review-title">${escHtml(r.title)}</div>` : ''}
                    ${r.comment ? `<div class="pd-review-comment">${escHtml(r.comment)}</div>` : ''}
                </div>`;
        };

        if (!append && reviews.length === 0) {
            list.innerHTML = '<div class="pd-reviews-empty">No reviews yet. Be the first to share your experience!</div>';
        } else {
            const html = reviews.map(renderReview).join('');
            if (append) {
                list.insertAdjacentHTML('beforeend', html);
            } else {
                list.innerHTML = html;
            }
        }

        // Load More button
        let loadMoreBtn = $('pdReviewsLoadMore');
        if (reviewPage < totalReviewPages) {
            if (!loadMoreBtn) {
                loadMoreBtn = document.createElement('button');
                loadMoreBtn.id = 'pdReviewsLoadMore';
                loadMoreBtn.className = 'btn btn-outline';
                loadMoreBtn.style.marginTop = '1rem';
                list.parentNode.appendChild(loadMoreBtn);
            }
            loadMoreBtn.textContent = `Load More Reviews (${pagination.total - reviewPage * REVIEW_LIMIT} remaining)`;
            loadMoreBtn.onclick = async () => {
                reviewPage++;
                loadMoreBtn.textContent = 'Loading...';
                await loadReviews(productId, true);
            };
        } else if (loadMoreBtn) {
            loadMoreBtn.remove();
        }

        // Login prompt / form
        const prompt = $('pdReviewLoginPrompt');
        const form = $('pdReviewForm');
        if (isLoggedIn()) {
            prompt.style.display = 'none';
            form.style.display = 'block';
        } else {
            prompt.style.display = 'block';
            form.style.display = 'none';
        }

    } catch (err) {
        list.innerHTML = '<div class="pd-reviews-empty">Could not load reviews.</div>';
    }
}

// Star rating interaction
document.querySelectorAll('.pd-star-rating i').forEach(star => {
    star.addEventListener('click', () => {
        const val = parseInt(star.dataset.star);
        document.querySelectorAll('.pd-star-rating i').forEach((s, i) => {
            s.classList.toggle('active', i < val);
            s.className = i < val ? 'fas fa-star active' : 'far fa-star';
        });
    });
    star.addEventListener('mouseenter', () => {
        const val = parseInt(star.dataset.star);
        document.querySelectorAll('.pd-star-rating i').forEach((s, i) => {
            s.style.color = i < val ? '#F59E0B' : '';
        });
    });
    star.addEventListener('mouseleave', () => {
        document.querySelectorAll('.pd-star-rating i').forEach(s => {
            if (!s.classList.contains('active')) s.style.color = '';
        });
    });
});

// Submit review
$('pdSubmitReview').addEventListener('click', async () => {
    if (!isLoggedIn()) { showToast('Please log in to submit a review', 'error'); return; }
    const rating = document.querySelectorAll('.pd-star-rating i.active').length;
    if (rating === 0) { showToast('Please select a star rating', 'error'); return; }
    const title = $('pdReviewTitle').value.trim();
    const comment = $('pdReviewComment').value.trim();
    if (!comment) { showToast('Please write a review comment', 'error'); return; }

    try {
        const res = await authFetch(`${API_URL}/reviews`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productId: currentProduct._id, rating, title, comment })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Failed to submit review');
        showToast('Review submitted! It will appear after approval.', 'success');
        $('pdReviewTitle').value = '';
        $('pdReviewComment').value = '';
        document.querySelectorAll('.pd-star-rating i').forEach(s => { s.className = 'far fa-star'; s.classList.remove('active'); });
        reviewPage = 1;
        loadReviews(currentProduct._id);
    } catch (err) {
        showToast(err.message, 'error');
    }
});

// ---- Questions & Answers ----
async function loadQA(productId) {
    const list = $('pdQAList');
    try {
        const res = await fetch(`${API_URL}/qa/product/${productId}`);
        const raw = await res.json();
        const qas = raw.data || raw || [];
        const visible = Array.isArray(qas) ? qas.filter(q => q.status === 'approved' || !q.status) : [];

        if (!visible.length) {
            list.innerHTML = '<div class="pd-qa-empty">No questions yet. Ask the first question!</div>';
            return;
        }

        list.innerHTML = visible.map(q => {
            const answerHtml = q.answers && q.answers.length ? `
                <div class="pd-qa-answer">
                    <i class="fas fa-check-circle"></i> <strong>Answer:</strong> ${escHtml(q.answers[0].text)}
                </div>` : '';
            return `
                <div class="pd-qa-card">
                    <div class="pd-qa-question">
                        <i class="fas fa-question-circle"></i>
                        <div>
                            <strong>${escHtml(q.text)}</strong>
                            <span class="pd-qa-meta">by ${escHtml(q.user?.name || q.userName || 'Anonymous')} &middot; ${q.createdAt ? new Date(q.createdAt).toLocaleDateString() : ''}</span>
                        </div>
                    </div>
                    ${answerHtml}
                </div>`;
        }).join('');
    } catch (err) {
        list.innerHTML = '<div class="pd-qa-empty">Could not load Q&A.</div>';
    }
}

// Submit question
$('pdSubmitQuestion').addEventListener('click', async () => {
    if (!isLoggedIn()) { showToast('Please log in to ask a question', 'error'); openAuthModal(); return; }
    const question = $('pdQuestionInput').value.trim();
    if (!question) { showToast('Please type your question', 'error'); return; }

    try {
        const res = await fetch(`${API_URL}/qa`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productId: currentProduct._id, text: question })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Failed');
        showToast('Question submitted!', 'success');
        $('pdQuestionInput').value = '';
        loadQA(currentProduct._id);
    } catch (err) {
        showToast(err.message, 'error');
    }
});

// ---- Related Products ----
async function loadRelated(productId) {
    const section = $('pdRelatedSection');
    const grid = $('pdRelatedGrid');
    try {
        const res = await fetch(`${API_URL}/products/related/${productId}?limit=8`);
        const raw = await res.json();
        const products = raw.data || raw || [];
        if (!products.length) { section.style.display = 'none'; return; }
        section.style.display = 'block';
        grid.innerHTML = products.map(renderMiniProductCard).join('');
    } catch (err) {
        section.style.display = 'none';
    }
}

// ---- Newsletter ----
$('pdNewsletterForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('pdNewsletterEmail').value.trim();
    const msg = $('pdNewsletterMsg');
    if (!email || !email.includes('@')) {
        msg.textContent = 'Please enter a valid email address.';
        msg.className = 'pd-newsletter-msg error';
        return;
    }
    try {
        const res = await fetch(`${API_URL}/newsletter`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Failed');
        msg.textContent = 'Thank you for subscribing!';
        msg.className = 'pd-newsletter-msg success';
        $('pdNewsletterEmail').value = '';
    } catch (err) {
        msg.textContent = err.message || 'Subscription failed. Please try again.';
        msg.className = 'pd-newsletter-msg error';
    }
});

// ============================================================
// AUTH MODAL (reuse from SPA patterns)
// ============================================================
function openAuthModal() {
    const overlay = document.getElementById('authOverlay');
    overlay.style.display = 'flex';
    document.body.classList.add('no-scroll');
    if (isLoggedIn()) {
        showDashboard(getUser());
    } else {
        showAuthForms();
    }
}
function closeAuthModal() {
    document.getElementById('authOverlay').style.display = 'none';
    document.body.classList.remove('no-scroll');
}

document.getElementById('authCloseBtn').addEventListener('click', closeAuthModal);
document.getElementById('authOverlay').addEventListener('click', function(e) {
    if (e.target === this) closeAuthModal();
});

function showAuthForms() {
    document.getElementById('authForms').style.display = 'block';
    document.getElementById('authLoggedIn').style.display = 'none';
    document.getElementById('authModalTitle').textContent = 'Account';
    document.querySelectorAll('.auth-tabs button').forEach(b => b.classList.remove('active'));
    document.querySelector('[data-tab="login"]').classList.add('active');
    document.getElementById('loginForm').style.display = 'flex';
    document.getElementById('registerForm').style.display = 'none';
}

function showDashboard(user) {
    document.getElementById('authForms').style.display = 'none';
    document.getElementById('authLoggedIn').style.display = 'block';
    document.getElementById('authModalTitle').textContent = 'My Account';
    document.getElementById('userAvatar').textContent = user.name.charAt(0).toUpperCase();
    document.getElementById('userDisplayName').textContent = user.name;
    document.getElementById('userDisplayEmail').textContent = user.email;
    document.getElementById('profileName').value = user.name || '';
    document.getElementById('profileEmail').value = user.email || '';
}

// Auth tabs
document.querySelectorAll('.auth-tabs button').forEach(tab => {
    tab.addEventListener('click', function() {
        document.querySelectorAll('.auth-tabs button').forEach(t => t.classList.remove('active'));
        this.classList.add('active');
        const tabName = this.dataset.tab;
        document.getElementById('loginForm').style.display = tabName === 'login' ? 'flex' : 'none';
        document.getElementById('registerForm').style.display = tabName === 'register' ? 'flex' : 'none';
    });
});

// Login
document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value.trim();
    try {
        const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (!res.ok) { showToast(data.message || 'Login failed', 'error'); return; }
        setAuth(data.user, data.token);
        showToast('Welcome back, ' + data.user.name + '!', 'success');
        closeAuthModal();
        loadReviews(currentProduct?._id);
        loadWishlist();
    } catch (err) {
        showToast('Connection error', 'error');
    }
});

// Register
document.getElementById('registerForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const name = document.getElementById('registerName').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value.trim();
    const confirm = document.getElementById('registerConfirm').value.trim();
    if (password !== confirm) { showToast('Passwords do not match', 'error'); return; }
    try {
        const res = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password })
        });
        const data = await res.json();
        if (!res.ok) { showToast(data.message || 'Registration failed', 'error'); return; }
        setAuth(data.user, data.token);
        showToast('Welcome, ' + data.user.name + '!', 'success');
        closeAuthModal();
    } catch (err) {
        showToast('Connection error', 'error');
    }
});

// Logout
document.getElementById('logoutBtn').addEventListener('click', function() {
    clearAuth();
    closeAuthModal();
    showToast('Logged out', 'info');
});

// Profile dropdown
const profileBtn = document.getElementById('profileBtn');
const profileDropdown = document.getElementById('profileDropdown');
if (profileBtn && profileDropdown) {
    profileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        profileDropdown.classList.toggle('open');
        profileBtn.setAttribute('aria-expanded', profileDropdown.classList.contains('open'));
    });
    document.addEventListener('click', (e) => {
        if (!document.getElementById('profileBtnWrapper').contains(e.target)) {
            profileDropdown.classList.remove('open');
            profileBtn.setAttribute('aria-expanded', 'false');
        }
    });
}

// ============================================================
// MINI CART
// ============================================================
function openCartModal() {
    document.getElementById('miniCartOverlay').classList.add('show');
    document.body.classList.add('no-scroll');
    renderMiniCart();
}
function closeCartModal() {
    document.getElementById('miniCartOverlay').classList.remove('show');
    document.body.classList.remove('no-scroll');
}

document.getElementById('closeCart').addEventListener('click', closeCartModal);
document.getElementById('miniCartOverlay').addEventListener('click', function(e) {
    if (e.target === this) closeCartModal();
});
document.getElementById('continueShoppingBtn').addEventListener('click', closeCartModal);

function renderMiniCart() {
    const items = getCart();
    const container = document.getElementById('cartItemsContainer');
    const totalContainer = document.getElementById('cartTotalContainer');
    const emptyMsg = document.getElementById('emptyCartMsg');
    const totalPrice = document.getElementById('cartTotalPrice');

    if (!items.length) {
        container.innerHTML = '';
        totalContainer.style.display = 'none';
        emptyMsg.style.display = 'block';
        return;
    }

    emptyMsg.style.display = 'none';
    totalContainer.style.display = 'block';

    let total = 0;
    container.innerHTML = items.map((item, idx) => {
        const itemTotal = (item.price || 0) * (item.quantity || 1);
        total += itemTotal;
        const img = item.image ? getImageUrl(item.image, 200) : 'https://placehold.co/80x100/FAF9F6/C8A35A?text=P';
        return `
            <div class="cart-item" data-index="${idx}">
                <img src="${img}" alt="${escHtml(item.name)}" />
                <div class="cart-item-info">
                    <div class="cart-item-name">${escHtml(item.name)}</div>
                    ${item.size ? `<div class="cart-item-variant">Size: ${escHtml(item.size)}</div>` : ''}
                    ${item.color ? `<div class="cart-item-variant">Color: ${escHtml(item.color)}</div>` : ''}
                    <div class="cart-item-qty">
                        <button class="cart-qty-btn" onclick="updateCartQty(${idx}, -1)">−</button>
                        <span>${item.quantity || 1}</span>
                        <button class="cart-qty-btn" onclick="updateCartQty(${idx}, 1)">+</button>
                    </div>
                </div>
                <div class="cart-item-total">Ksh ${itemTotal.toLocaleString()}</div>
                <button class="cart-item-remove" onclick="removeCartItem(${idx})"><i class="fas fa-times"></i></button>
            </div>`;
    }).join('');

    // Calculate delivery
    const threshold = window.FREE_DELIVERY_THRESHOLD || 15000;
    const deliveryFee = window.DELIVERY_FEE || 500;
    const delivery = total >= threshold ? 0 : deliveryFee;

    document.getElementById('checkoutSubtotal').textContent = `Ksh ${total.toLocaleString()}`;
    document.getElementById('checkoutDelivery').textContent = delivery === 0 ? 'Free' : `Ksh ${delivery.toLocaleString()}`;
    const grandTotal = total + delivery;
    document.getElementById('checkoutTotal').textContent = `Ksh ${grandTotal.toLocaleString()}`;
    totalPrice.textContent = `Ksh ${grandTotal.toLocaleString()}`;
}

window.renderMiniCart = renderMiniCart;

function updateCartQty(index, delta) {
    const items = getCart();
    if (!items[index]) return;
    const newQty = (items[index].quantity || 1) + delta;
    if (newQty < 1) {
        items.splice(index, 1);
    } else {
        items[index].quantity = newQty;
    }
    saveCart(items);
    renderMiniCart();
}

function removeCartItem(index) {
    const items = getCart();
    items.splice(index, 1);
    saveCart(items);
    renderMiniCart();
}

// Cart icon click
document.getElementById('cartBtn').addEventListener('click', openCartModal);
document.getElementById('cartBtnDesktop').addEventListener('click', openCartModal);

// ============================================================
// CHECKOUT
// ============================================================
let appliedCoupon = null;
function openCheckout() {
    if (!isLoggedIn()) { showToast('Please log in to checkout', 'error'); openAuthModal(); return; }
    const items = getCart();
    if (!items.length) { showToast('Your cart is empty', 'error'); return; }
    document.getElementById('checkoutOverlay').style.display = 'flex';
    document.body.classList.add('no-scroll');
    renderCheckout();
}

function closeCheckout() {
    document.getElementById('checkoutOverlay').style.display = 'none';
    document.body.classList.remove('no-scroll');
}

document.getElementById('checkoutCloseBtn').addEventListener('click', closeCheckout);
document.getElementById('checkoutOverlay').addEventListener('click', function(e) {
    if (e.target === this) closeCheckout();
});
document.getElementById('checkoutBtn').addEventListener('click', openCheckout);

// Payment method instructions
document.getElementById('checkoutPayment').addEventListener('change', function() {
    ['mpesaInstructions','cardInstructions','bankInstructions'].forEach(id => {
        document.getElementById(id).style.display = 'none';
    });
    const map = { mpesa: 'mpesaInstructions', card: 'cardInstructions', bank: 'bankInstructions' };
    const el = document.getElementById(map[this.value]);
    if (el) el.style.display = 'block';
});

function renderCheckout() {
    const items = getCart();
    const container = document.getElementById('checkoutItems');
    let subtotal = 0;
    container.innerHTML = items.map(item => {
        const t = (item.price || 0) * (item.quantity || 1);
        subtotal += t;
        return `<div class="checkout-item"><span>${escHtml(item.name)} x${item.quantity || 1}</span><span>Ksh ${t.toLocaleString()}</span></div>`;
    }).join('');

    const threshold = window.FREE_DELIVERY_THRESHOLD || 15000;
    const deliveryFee = window.DELIVERY_FEE || 500;
    const delivery = subtotal >= threshold ? 0 : deliveryFee;

    document.getElementById('checkoutSubtotal').textContent = `Ksh ${subtotal.toLocaleString()}`;
    document.getElementById('checkoutDelivery').textContent = delivery === 0 ? 'Free' : `Ksh ${delivery.toLocaleString()}`;
    const total = subtotal + delivery - (appliedCoupon ? (appliedCoupon.discount || 0) : 0);
    document.getElementById('checkoutTotal').textContent = `Ksh ${total.toLocaleString()}`;
}

// Coupon apply
document.getElementById('applyCouponBtn').addEventListener('click', async () => {
    const code = document.getElementById('checkoutCoupon').value.trim();
    const msg = document.getElementById('couponMessage');
    if (!code) { msg.textContent = 'Please enter a coupon code'; msg.style.display = 'block'; msg.style.color = '#DC2626'; return; }
    try {
        const res = await fetch(`${API_URL}/coupons/validate?code=${encodeURIComponent(code)}&total=${document.getElementById('checkoutTotal').textContent.replace('Ksh ','').replace(/,/g,'')}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Invalid coupon');
        appliedCoupon = data.coupon || data;
        msg.textContent = `Coupon applied! Discount: Ksh ${(appliedCoupon.discount || 0).toLocaleString()}`;
        msg.style.display = 'block';
        msg.style.color = '#16A34A';
        document.getElementById('discountRow').style.display = 'flex';
        document.getElementById('checkoutDiscount').textContent = `- Ksh ${(appliedCoupon.discount || 0).toLocaleString()}`;
        renderCheckout();
    } catch (err) {
        msg.textContent = err.message;
        msg.style.display = 'block';
        msg.style.color = '#DC2626';
    }
});

// Place order
document.getElementById('checkoutForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    if (!isLoggedIn()) { showToast('Please log in', 'error'); return; }
    const items = getCart();
    if (!items.length) { showToast('Cart is empty', 'error'); return; }

    const btn = document.getElementById('placeOrderBtn');
    btn.disabled = true;
    btn.textContent = 'Placing Order...';

    try {
        // Validate stock
        for (const item of items) {
            const res = await fetch(`${API_URL}/products/${item.id}`);
            const raw = await res.json();
            const p = raw.data || raw;
            if (!isProductAvailable(p) || getEffectiveStock(p) < (item.quantity || 1)) {
                showToast(`Insufficient stock for ${p.name}`, 'error');
                btn.disabled = false;
                btn.textContent = 'Place Order';
                return;
            }
        }

        const orderData = {
            items: items.map(item => ({
                productId: item.id,
                name: item.name,
                quantity: item.quantity || 1,
                price: item.price || 0,
                size: item.size || undefined,
                color: item.color || undefined
            })),
            shippingAddress: {
                fullName: document.getElementById('checkoutName').value.trim(),
                phone: document.getElementById('checkoutPhone').value.trim(),
                address: document.getElementById('checkoutAddress').value.trim(),
                city: document.getElementById('checkoutCity').value.trim()
            },
            total: parseFloat(document.getElementById('checkoutTotal').textContent.replace('Ksh ', '').replace(/,/g, '')),
            paymentMethod: document.getElementById('checkoutPayment').value,
            coupon: appliedCoupon ? appliedCoupon.code : undefined
        };

        const res = await fetch(`${API_URL}/orders`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(orderData)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Order failed');

        // Clear cart
        saveCart([]);
        appliedCoupon = null;
        document.getElementById('checkoutCoupon').value = '';
        document.getElementById('couponMessage').style.display = 'none';
        document.getElementById('discountRow').style.display = 'none';
        renderMiniCart();
        updateCartBadge();
        closeCheckout();

        // Show success
        document.getElementById('orderNumberDisplay').textContent = `#${data.order?.orderNumber || data.order?._id?.toString().slice(-8).toUpperCase() || 'TW-000001'}`;
        document.getElementById('orderSuccessOverlay').classList.add('show');
        showToast('Order placed successfully!', 'success');
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Place Order';
    }
});

// Order success dashboard
document.getElementById('orderSuccessDashboard').addEventListener('click', function() {
    document.getElementById('orderSuccessOverlay').classList.remove('show');
    document.body.classList.remove('no-scroll');
    openAuthModal();
    setTimeout(() => {
        const ordersTab = document.querySelector('.dashboard-tabs button[data-tab="orders"]');
        if (ordersTab) ordersTab.click();
    }, 300);
});

// ============================================================
// HEADER & NAVIGATION
// ============================================================

// Header scroll effects
let lastScrollY = window.scrollY;
const stickyHeader = document.getElementById('stickyHeader');
window.addEventListener('scroll', () => {
    const scrollY = window.scrollY;
    stickyHeader.classList.toggle('shrink', scrollY > 60);
    if (Math.abs(scrollY - lastScrollY) > 10) {
        if (scrollY > lastScrollY && scrollY > 100) {
            stickyHeader.classList.add('hidden');
        } else {
            stickyHeader.classList.remove('hidden');
        }
        lastScrollY = scrollY;
    }
}, { passive: true });

// Desktop hamburger -> mobile drawer
document.getElementById('hamburgerBtnDesktop')?.addEventListener('click', () => {
    document.getElementById('drawer').classList.toggle('open');
    document.getElementById('drawerOverlay').classList.toggle('open');
    document.body.classList.toggle('no-scroll');
});

// Mobile hamburger
document.getElementById('hamburgerBtn')?.addEventListener('click', function() {
    const open = document.getElementById('drawer').classList.toggle('open');
    document.getElementById('drawerOverlay').classList.toggle('open');
    document.body.classList.toggle('no-scroll');
    this.setAttribute('aria-expanded', open);
});

// Close drawer
document.getElementById('closeDrawer')?.addEventListener('click', () => {
    document.getElementById('drawer').classList.remove('open');
    document.getElementById('drawerOverlay').classList.remove('open');
    document.body.classList.remove('no-scroll');
});
document.getElementById('drawerOverlay')?.addEventListener('click', () => {
    document.getElementById('drawer').classList.remove('open');
    document.getElementById('drawerOverlay').classList.remove('open');
    document.body.classList.remove('no-scroll');
});

// Mobile search
document.getElementById('searchBtnMobile')?.addEventListener('click', function() {
    const bar = document.getElementById('mobileSearchBar');
    const isOpen = bar.classList.toggle('open');
    this.setAttribute('aria-expanded', isOpen);
    bar.setAttribute('aria-hidden', !isOpen);
    if (isOpen) setTimeout(() => document.getElementById('mobileSearchInput')?.focus(), 100);
});

// Search overlay
document.getElementById('searchBtn')?.addEventListener('click', () => {
    document.getElementById('searchOverlay').classList.add('open');
    document.body.classList.add('no-scroll');
    setTimeout(() => document.getElementById('searchOverlayInput')?.focus(), 100);
});
document.getElementById('searchClose')?.addEventListener('click', () => {
    document.getElementById('searchOverlay').classList.remove('open');
    document.body.classList.remove('no-scroll');
});
document.getElementById('searchOverlay')?.addEventListener('click', function(e) {
    if (e.target === this || (!e.target.closest('.search-panel') && !e.target.closest('.search-result-item'))) {
        this.classList.remove('open');
        document.body.classList.remove('no-scroll');
    }
});

// Back to top
document.getElementById('backToTop')?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
});
window.addEventListener('scroll', () => {
    const btn = document.getElementById('backToTop');
    if (btn) btn.style.display = window.scrollY > 300 ? 'flex' : 'none';
});

// Floating WhatsApp show on scroll
window.addEventListener('scroll', () => {
    const wa = document.getElementById('floatingWhatsApp');
    if (wa) wa.classList.toggle('hidden-wa', window.scrollY < 200);
}, { passive: true });

// ============================================================
// USER BUTTONS
// ============================================================
document.getElementById('userBtn')?.addEventListener('click', openAuthModal);
document.getElementById('wishlistBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    window.location.href = '/wishlist.html';
});

document.getElementById('drawerWishlist')?.addEventListener('click', (e) => {
    e.preventDefault();
    window.location.href = '/wishlist.html';
});

// Login prompt review link
document.getElementById('pdReviewLoginLink')?.addEventListener('click', (e) => {
    e.preventDefault();
    openAuthModal();
});

// ============================================================
// SOCIAL LINKS
// ============================================================
async function loadSocialLinks() {
    try {
        const res = await fetch(`${API_URL}/social-links`);
        if (!res.ok) return;
        const data = await res.json();
        const links = data.data || data || {};
        const iconMap = { facebook: 'fab fa-facebook-f', twitter: 'fab fa-twitter', instagram: 'fab fa-instagram', pinterest: 'fab fa-pinterest', youtube: 'fab fa-youtube', tiktok: 'fab fa-tiktok', linkedin: 'fab fa-linkedin-in' };
        const html = Object.keys(links).filter(k => k !== '_id' && k !== 'createdAt' && k !== 'updatedAt' && k !== '__v' && k !== 'website' && links[k] && typeof links[k] === 'object' && links[k].enabled && links[k].url)
            .map(k => `<a href="${links[k].url}" target="_blank" aria-label="${k}"><i class="${iconMap[k] || 'fas fa-link'}"></i></a>`).join('');
        document.getElementById('footerSocialLinks').innerHTML = html;
        document.getElementById('drawerSocialLinks').innerHTML = html;
    } catch(e) {}
}
loadSocialLinks();

// ============================================================
// WISHLIST FUNCTIONS
// ============================================================
function openWishlist() {
    if (isLoggedIn()) { openAuthModal(); setTimeout(() => document.querySelector('.dashboard-tabs button[data-tab="wishlist"]')?.click(), 300); }
    else showToast('Please log in to view wishlist', 'info');
}
window.openWishlist = openWishlist;
window.openCartModal = openCartModal;
window.openAuthModal = openAuthModal;
window.openCheckout = openCheckout;

// ============================================================
// KEYBOARD SHORTCUTS
// ============================================================
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (document.getElementById('quickViewOverlay')?.classList.contains('show')) closeQuickView();
        if (document.getElementById('miniCartOverlay')?.classList.contains('show')) closeCartModal();
        if (document.getElementById('checkoutOverlay')?.style.display === 'flex') closeCheckout();
        if (document.getElementById('authOverlay')?.style.display === 'flex') closeAuthModal();
        if (document.getElementById('orderSuccessOverlay')?.classList.contains('show')) {
            document.getElementById('orderSuccessOverlay').classList.remove('show');
            document.body.classList.remove('no-scroll');
        }
    }
});

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    loadWishlist();
    updateCartBadge();
    init();
});
