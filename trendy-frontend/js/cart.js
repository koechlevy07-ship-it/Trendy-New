// ============================================================
// SHOPPING CART PAGE — Trendy Wardrobe
// ============================================================

const API_URL = 'https://trendy-backend-jq27.onrender.com/api';

// ---- Helpers ----
function escHtml(str) {
    if (str == null) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function $(id) { return document.getElementById(id); }

function getImageUrl(path, width) {
    if (!path) return '';
    let url = path.startsWith('http') ? path : path;
    if (url.includes('res.cloudinary.com') && !url.includes('/upload/')) return url;
    if (url.includes('res.cloudinary.com')) {
        const parts = url.split('/upload/');
        if (parts.length === 2) {
            const w = width || 400;
            url = parts[0] + '/upload/f_webp,q_auto,w_' + w + '/' + parts[1];
        }
    }
    return url;
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
    localStorage.removeItem('tw_cart');
    localStorage.removeItem('cart');
    updateUI();
}

function updateUI() {
    const user = getUser();
    const userIcon = document.getElementById('userIcon');
    if (userIcon) userIcon.className = user ? 'fas fa-user-check' : 'far fa-user';
    updateProfileDropdown(user);
    updateAllBadges();
}

// ---- Badge sync (consistent with SPA) ----
let cartCount = 0;
let wishlistCount = 0;

function updateAllBadges() {
    // Cart badge from API
    if (isLoggedIn()) {
        authFetch(`${API_URL}/cart/count`).then(r => r.json()).then(d => {
            cartCount = d.count || 0;
            renderBadges();
        }).catch(() => {
            // Fallback to localStorage
            cartCount = getLocalCart().reduce((s,i) => s + (i.quantity||1), 0);
            renderBadges();
        });
        authFetch(`${API_URL}/wishlist/count`).then(r => r.json()).then(d => {
            wishlistCount = d.count || 0;
            renderBadges();
        }).catch(() => {});
    } else {
        cartCount = getLocalCart().reduce((s,i) => s + (i.quantity||1), 0);
        wishlistCount = getLocalWishlist().length;
        renderBadges();
    }
}

function renderBadges() {
    ['cartBadge','cartBadgeDesktop','mobileCartBadge'].forEach(id => {
        const el = $(id);
        if (el) { el.textContent = cartCount; el.style.display = cartCount > 0 ? 'flex' : 'none'; el.setAttribute('data-count', cartCount); }
    });
    ['wishlistBadge','wishlistBadgeDesktop'].forEach(id => {
        const el = $(id);
        if (el) { el.textContent = wishlistCount; el.style.display = wishlistCount > 0 ? 'flex' : 'none'; el.setAttribute('data-count', wishlistCount); }
    });
    const mwb = $('mobileWishlistBadge');
    if (mwb) { mwb.textContent = wishlistCount; mwb.style.display = wishlistCount > 0 ? 'flex' : 'none'; }
    // Desktop wishlist icon
    const wi = $('wishlistIconDesktop');
    if (wi) wi.className = wishlistCount > 0 ? 'fas fa-heart heart-icon liked' : 'far fa-heart heart-icon';
}

// ---- LocalStorage fallback ----
function getLocalCart() {
    try { return JSON.parse(localStorage.getItem('tw_cart')) || []; } catch(e) { return []; }
}
function setLocalCart(items) {
    localStorage.setItem('tw_cart', JSON.stringify(items));
    updateAllBadges();
}

function getLocalWishlist() {
    try { return JSON.parse(localStorage.getItem('tw_wishlist')) || []; } catch(e) { return []; }
}

// ---- Toast ----
function showToast(msg, type) {
    const toast = $('toast');
    const msgEl = $('toastMessage');
    if (!toast || !msgEl) { alert(msg); return; }
    msgEl.textContent = msg;
    toast.className = 'toast';
    if (type) toast.classList.add(type);
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), 4000);
}
$('toastClose')?.addEventListener('click', () => $('toast').classList.remove('show'));

// ============================================================
// STATE
// ============================================================
let cartData = null; // Full cart data from API
let appliedCoupon = null;

// ============================================================
// CART RENDERING
// ============================================================
async function loadCart() {
    showLoading();
    if (!isLoggedIn()) {
        renderGuestPrompt();
        return;
    }

    try {
        const res = await authFetch(`${API_URL}/cart`);
        const json = await res.json();
        cartData = json.data || json;

        // Sync to localStorage for badge consistency
        const items = cartData.items || [];
        const lsItems = items.map(i => ({
            id: i.productId?._id || i.productId,
            name: i.name,
            price: i.price,
            originalPrice: i.originalPrice,
            quantity: i.quantity,
            image: i.image,
            size: i.size,
            color: i.color
        }));
        setLocalCart(lsItems);

        renderCart();
    } catch (err) {
        // Fallback to localStorage cart
        const ls = getLocalCart();
        if (ls.length > 0) {
            cartData = { items: ls, savedForLater: [], summary: { totalItems: ls.reduce((s,i) => s+(i.quantity||1),0), subtotal: ls.reduce((s,i) => s+(i.price||0)*(i.quantity||1),0), savings: 0, shipping: 500, couponDiscount: 0, grandTotal: ls.reduce((s,i) => s+(i.price||0)*(i.quantity||1),0)+500 } };
            renderCart();
        } else {
            renderEmpty();
        }
    }
}

function showLoading() {
    const container = $('cartItemsContainer');
    const summary = $('cartSummary');
    const empty = $('cartEmpty');
    const loading = $('cartLoading');
    if (loading) loading.style.display = 'flex';
    if (container) container.innerHTML = '';
    if (summary) summary.style.display = 'none';
    if (empty) empty.style.display = 'none';
}

function renderGuestPrompt() {
    $('cartLoading').style.display = 'none';
    $('cartContent').style.display = 'block';

    // Check if guest has local cart items
    const ls = getLocalCart();
    if (ls.length > 0) {
        cartData = {
            items: ls.map(i => ({
                _id: i.id,
                productId: { _id: i.id },
                name: i.name,
                price: i.price,
                originalPrice: i.originalPrice || 0,
                quantity: i.quantity || 1,
                size: i.size || '',
                color: i.color || '',
                image: i.image || '',
                stock: 99,
                inStock: true
            })),
            savedForLater: [],
            summary: {
                totalItems: ls.reduce((s,i) => s+(i.quantity||1),0),
                subtotal: ls.reduce((s,i) => s+(i.price||0)*(i.quantity||1),0),
                savings: 0,
                shipping: 500,
                couponDiscount: 0,
                grandTotal: ls.reduce((s,i) => s+(i.price||0)*(i.quantity||1),0)+500
            }
        };
        renderCart();
        return;
    }

    $('cartGuestPrompt').style.display = 'block';
    $('cartContent').style.display = 'block';
}

async function renderCart() {
    $('cartLoading').style.display = 'none';
    $('cartContent').style.display = 'block';
    $('cartEmpty').style.display = 'none';
    $('cartGuestPrompt').style.display = 'none';

    const items = cartData.items || [];
    const saved = cartData.savedForLater || [];
    const summary = cartData.summary || {};
    const hasItems = items.length > 0;

    // Title
    $('cartItemCount').textContent = `(${summary.totalItems || 0} item${(summary.totalItems||0) !== 1 ? 's' : ''})`;

    // Clear button
    $('cartClearBtn').style.display = hasItems ? 'flex' : 'none';

    // Items
    const container = $('cartItemsContainer');
    if (!hasItems) {
        container.innerHTML = '';
        renderEmpty();
        return;
    }

    container.innerHTML = items.map((item, idx) => renderCartItem(item, idx)).join('');

    // Summary
    renderSummary(summary);

    // Saved for later
    renderSavedItems(saved);

    // Load related products
    loadRelatedProducts();

    // Bind item events
    bindCartItemEvents();

    updateAllBadges();
}

function renderCartItem(item, idx) {
    const p = item.productId || item;
    const pId = p._id || item._id || item.id || '';
    const img = item.image || (p.images && p.images[0]) || '';
    const imgUrl = getImageUrl(img, 400);
    const name = item.name || p.name || 'Product';
    const brand = item.brand || p.brand || '';
    const category = item.category || p.category || '';
    const sku = item.sku || p.sku || '';
    const price = item.price || p.price || 0;
    const origPrice = item.originalPrice || p.originalPrice || 0;
    const hasDiscount = origPrice > price;
    const discountPct = hasDiscount ? Math.round(((origPrice - price) / origPrice) * 100) : 0;
    const qty = item.quantity || 1;
    const size = item.size || '';
    const color = item.color || '';
    const stock = item.stock !== undefined ? item.stock : (p.stock !== undefined ? p.stock : 99);
    const inStock = stock > 0;
    const delivery = item.deliveryEstimate || p.deliveryEstimate || '2-5 business days';
    const itemId = item._id || idx;
    const lineTotal = price * qty;

    let stockHtml = '';
    if (!inStock) stockHtml = '<span class="cart-item-stock out">Out of Stock</span>';
    else if (stock <= 5) stockHtml = `<span class="cart-item-stock low">Only ${stock} left</span>`;
    else stockHtml = '<span class="cart-item-stock in-stock">In Stock</span>';

    return `
        <div class="cart-item" data-item-id="${itemId}" data-product-id="${pId}" data-idx="${idx}">
            <a href="/product-details.html?id=${pId}" class="cart-item-img-wrap">
                <img src="${imgUrl || 'https://placehold.co/300x400/FAF9F6/C8A35A?text=Product'}" alt="${escHtml(name)}" loading="lazy" />
            </a>
            <div class="cart-item-details">
                ${brand ? `<div class="cart-item-brand">${escHtml(brand)}</div>` : ''}
                <a href="/product-details.html?id=${pId}" class="cart-item-name">${escHtml(name)}</a>
                <div class="cart-item-meta">
                    ${sku ? `<span><strong>SKU:</strong> ${escHtml(sku)}</span>` : ''}
                    ${category ? `<span><strong>Category:</strong> ${escHtml(category)}</span>` : ''}
                    ${size ? `<span><strong>Size:</strong> ${escHtml(size)}</span>` : ''}
                    ${color ? `<span><strong>Color:</strong> ${escHtml(color)}</span>` : ''}
                </div>
                ${stockHtml}
                <div class="cart-item-delivery"><i class="fas fa-truck"></i> Est. delivery: ${escHtml(delivery)}</div>
                <div class="cart-item-actions">
                    <button class="cart-item-action-btn save" data-action="save-for-later"><i class="far fa-bookmark"></i> Save for Later</button>
                    <button class="cart-item-action-btn wishlist" data-action="move-to-wishlist"><i class="far fa-heart"></i> Move to Wishlist</button>
                    <button class="cart-item-action-btn remove" data-action="remove"><i class="far fa-trash-alt"></i> Remove</button>
                </div>
            </div>
            <div class="cart-item-right">
                <div class="cart-item-price">
                    Ksh ${price.toLocaleString()}
                    ${hasDiscount ? `<span class="original">Ksh ${origPrice.toLocaleString()}</span>` : ''}
                    ${discountPct ? `<span class="cart-item-discount">-${discountPct}%</span>` : ''}
                </div>
                <div class="cart-qty-selector">
                    <button class="cart-qty-btn cart-qty-minus" ${qty <= 1 ? 'disabled' : ''}>−</button>
                    <input type="number" class="cart-qty-input" value="${qty}" min="1" max="${Math.max(stock, 99)}" readonly />
                    <button class="cart-qty-btn cart-qty-plus" ${qty >= stock ? 'disabled' : ''}>+</button>
                </div>
                <div class="cart-item-subtotal"><strong>Ksh ${lineTotal.toLocaleString()}</strong></div>
            </div>
        </div>`;
}

function renderSummary(summary) {
    const s = summary || {};
    const subtotal = s.subtotal || 0;
    const savings = s.savings || 0;
    const shipping = s.shipping !== undefined ? s.shipping : (subtotal >= 15000 ? 0 : 500);
    const couponDiscount = (appliedCoupon && appliedCoupon.discount) ? appliedCoupon.discount : (s.couponDiscount || 0);
    const grandTotal = Math.max(0, subtotal - couponDiscount + shipping);

    $('summaryItems').textContent = s.totalItems || 0;
    $('summarySubtotal').textContent = `Ksh ${subtotal.toLocaleString()}`;
    $('summaryShipping').textContent = shipping === 0 ? 'Free' : `Ksh ${shipping.toLocaleString()}`;
    $('summaryTotal').textContent = `Ksh ${grandTotal.toLocaleString()}`;

    // Savings
    const savingsEl = $('summarySavings');
    if (savings > 0) {
        savingsEl.style.display = 'flex';
        savingsEl.querySelector('.summary-value').textContent = `- Ksh ${savings.toLocaleString()}`;
    } else {
        savingsEl.style.display = 'none';
    }

    // Coupon discount row
    const discountRow = $('summaryDiscountRow');
    if (couponDiscount > 0) {
        discountRow.style.display = 'flex';
        discountRow.querySelector('.summary-value').textContent = `- Ksh ${couponDiscount.toLocaleString()}`;
    } else {
        discountRow.style.display = 'none';
    }

    // Free shipping progress
    const freeShipEl = $('summaryFreeShipping');
    const progressBar = $('shippingProgressBar');
    const threshold = 15000;
    if (subtotal > 0 && subtotal < threshold) {
        const remaining = threshold - subtotal;
        freeShipEl.style.display = 'flex';
        freeShipEl.innerHTML = `<i class="fas fa-truck"></i> Add Ksh ${remaining.toLocaleString()} more for free delivery`;
        const pct = Math.min((subtotal / threshold) * 100, 99);
        if (progressBar) progressBar.style.width = pct + '%';
    } else if (subtotal >= threshold) {
        freeShipEl.style.display = 'flex';
        freeShipEl.innerHTML = '<i class="fas fa-check-circle"></i> You qualify for free delivery!';
        if (progressBar) progressBar.style.width = '100%';
    } else {
        freeShipEl.style.display = 'none';
    }

    // Coupon display
    renderCouponSection();

    $('cartSummary').style.display = 'block';
}

function renderCouponSection() {
    const couponInput = $('couponInput');
    const couponBtn = $('couponApplyBtn');
    const couponMsg = $('couponMsg');
    const couponApplied = $('couponApplied');

    if (appliedCoupon) {
        couponApplied.style.display = 'flex';
        couponApplied.querySelector('.coupon-code-text').textContent = appliedCoupon.code || '';
        couponApplied.querySelector('.coupon-discount-text').textContent = `-Ksh ${(appliedCoupon.discount || 0).toLocaleString()}`;
        couponInput.value = appliedCoupon.code || '';
        couponInput.disabled = true;
        couponBtn.textContent = 'Applied';
        couponBtn.disabled = true;
        couponMsg.style.display = 'none';
    } else {
        couponApplied.style.display = 'none';
        couponInput.disabled = false;
        couponBtn.textContent = 'Apply';
        couponBtn.disabled = false;
    }
}

function renderSavedItems(saved) {
    const section = $('savedSection');
    const grid = $('savedGrid');
    if (!saved || !saved.length) {
        section.style.display = 'none';
        return;
    }
    section.style.display = 'block';
    grid.innerHTML = saved.map(item => {
        const p = item.productId || item;
        const img = item.image || (p.images && p.images[0]) || '';
        const name = item.name || p.name || 'Product';
        const price = item.price || p.price || 0;
        const itemId = item._id;
        return `
            <div class="cart-saved-item" data-item-id="${itemId}">
                <img src="${getImageUrl(img, 200) || 'https://placehold.co/200x250/FAF9F6/C8A35A?text=P'}" alt="${escHtml(name)}" loading="lazy" />
                <div class="cart-saved-item-info">
                    <div class="name">${escHtml(name)}</div>
                    <div class="price">Ksh ${price.toLocaleString()}</div>
                </div>
                <div class="cart-saved-item-actions">
                    <button class="move-cart" data-action="move-to-cart" data-item-id="${itemId}"><i class="fas fa-shopping-bag"></i> Move to Cart</button>
                    <button data-action="remove-saved" data-item-id="${itemId}"><i class="far fa-trash-alt"></i> Remove</button>
                </div>
            </div>`;
    }).join('');

    // Bind saved item events
    grid.querySelectorAll('[data-action="move-to-cart"]').forEach(btn => {
        btn.addEventListener('click', () => toggleSaveForLater(btn.dataset.itemId));
    });
    grid.querySelectorAll('[data-action="remove-saved"]').forEach(btn => {
        btn.addEventListener('click', () => removeItem(btn.dataset.itemId));
    });
}

function renderEmpty() {
    $('cartLoading').style.display = 'none';
    $('cartContent').style.display = 'block';
    $('cartSummary').style.display = 'none';
    $('cartClearBtn').style.display = 'none';
    $('savedSection').style.display = 'none';
    $('cartEmpty').style.display = 'block';
    $('cartItemsContainer').innerHTML = '';
    loadRelatedProducts();
}

function bindCartItemEvents() {
    // Quantity minus
    document.querySelectorAll('.cart-qty-minus').forEach(btn => {
        btn.addEventListener('click', function() {
            const itemEl = this.closest('.cart-item');
            const input = itemEl.querySelector('.cart-qty-input');
            const v = parseInt(input.value) || 1;
            if (v > 1) updateQuantity(itemEl, v - 1);
        });
    });

    // Quantity plus
    document.querySelectorAll('.cart-qty-plus').forEach(btn => {
        btn.addEventListener('click', function() {
            const itemEl = this.closest('.cart-item');
            const input = itemEl.querySelector('.cart-qty-input');
            const max = parseInt(input.max) || 99;
            const v = parseInt(input.value) || 1;
            if (v < max) updateQuantity(itemEl, v + 1);
        });
    });

    // Action buttons
    document.querySelectorAll('.cart-item-action-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const itemEl = this.closest('.cart-item');
            const itemId = itemEl.dataset.itemId;
            const action = this.dataset.action;
            if (action === 'save-for-later') toggleSaveForLater(itemId);
            else if (action === 'move-to-wishlist') moveToWishlist(itemId);
            else if (action === 'remove') removeItem(itemId);
        });
    });
}

// ============================================================
// CART ACTIONS (API-based)
// ============================================================

async function updateQuantity(itemEl, newQty) {
    const itemId = itemEl.dataset.itemId;
    if (!isLoggedIn()) {
        // LocalStorage fallback
        const items = getLocalCart();
        const idx = parseInt(itemEl.dataset.idx);
        if (items[idx]) {
            items[idx].quantity = Math.max(1, newQty);
            setLocalCart(items);
            loadCart();
        }
        return;
    }

    try {
        const res = await authFetch(`${API_URL}/cart/${itemId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ quantity: newQty })
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.message || 'Update failed');
        cartData = json.data || json;
        renderCart();
    } catch (err) {
        showToast(err.message || 'Could not update quantity', 'error');
    }
}

async function toggleSaveForLater(itemId) {
    if (!isLoggedIn()) { showToast('Please log in to use this feature', 'error'); openAuthModal(); return; }
    try {
        const res = await authFetch(`${API_URL}/cart/save-for-later/${itemId}`, { method: 'POST' });
        const json = await res.json();
        if (!res.ok) throw new Error(json.message || 'Failed');
        cartData = json.data || json;
        showToast('Item moved', 'success');
        renderCart();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function moveToWishlist(itemId) {
    if (!isLoggedIn()) { showToast('Please log in', 'error'); openAuthModal(); return; }
    try {
        const res = await authFetch(`${API_URL}/cart/move-to-wishlist/${itemId}`, { method: 'POST' });
        const json = await res.json();
        if (!res.ok) throw new Error(json.message || 'Failed');
        showToast('Item moved to wishlist', 'success');
        updateAllBadges();
        loadCart();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function removeItem(itemId) {
    if (!isLoggedIn()) {
        const items = getLocalCart();
        const idx = parseInt(document.querySelector(`[data-item-id="${itemId}"]`)?.dataset.idx);
        if (idx >= 0) items.splice(idx, 1);
        setLocalCart(items);
        loadCart();
        return;
    }

    try {
        const res = await authFetch(`${API_URL}/cart/${itemId}`, { method: 'DELETE' });
        const json = await res.json();
        if (!res.ok) throw new Error(json.message || 'Failed');
        if (json.data) cartData = json.data;
        showToast('Item removed', 'info');
        updateAllBadges();
        loadCart();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function clearCart() {
    if (!isLoggedIn()) {
        if (!confirm('Clear your entire cart?')) return;
        setLocalCart([]);
        loadCart();
        return;
    }

    if (!confirm('Clear your entire cart?')) return;
    try {
        const res = await authFetch(`${API_URL}/cart`, { method: 'DELETE' });
        const json = await res.json();
        if (!res.ok) throw new Error(json.message || 'Failed');
        appliedCoupon = null;
        showToast('Cart cleared', 'info');
        updateAllBadges();
        loadCart();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ============================================================
// COUPON
// ============================================================
async function applyCoupon() {
    const input = $('couponInput');
    const msg = $('couponMsg');
    const code = input.value.trim();
    if (!code) { msg.textContent = 'Please enter a coupon code'; msg.className = 'summary-coupon-msg error'; return; }

    if (!isLoggedIn()) { showToast('Please log in to use coupons', 'error'); openAuthModal(); return; }

    const btn = $('couponApplyBtn');
    btn.disabled = true;
    btn.textContent = 'Validating...';

    try {
        const cartItems = cartData?.items || [];
        const subtotal = cartItems.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0);

        // Use backend cart coupon application
        const res = await authFetch(`${API_URL}/cart/apply-coupon`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code })
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.message || 'Invalid coupon');

        const data = json.data;
        appliedCoupon = data.coupon || { code: code.toUpperCase(), discount: data.summary?.couponDiscount || 0 };

        msg.textContent = `Coupon applied! You saved Ksh ${(appliedCoupon.discount || 0).toLocaleString()}`;
        msg.className = 'summary-coupon-msg success';

        // Update summary with coupon
        if (data.summary) {
            const summary = cartData.summary || {};
            summary.couponDiscount = data.summary.couponDiscount || 0;
            summary.grandTotal = data.summary.grandTotal || summary.subtotal;
            cartData.summary = summary;
        }
        renderSummary(cartData.summary || {});
    } catch (err) {
        msg.textContent = err.message;
        msg.className = 'summary-coupon-msg error';
        appliedCoupon = null;
    } finally {
        btn.disabled = false;
        btn.textContent = 'Applied';
    }
}

async function removeCoupon() {
    if (!isLoggedIn()) return;
    try {
        await authFetch(`${API_URL}/cart/coupon`, { method: 'DELETE' });
        appliedCoupon = null;
        $('couponInput').disabled = false;
        $('couponApplyBtn').disabled = false;
        $('couponApplyBtn').textContent = 'Apply';
        $('couponMsg').style.display = 'none';
        showToast('Coupon removed', 'info');
        loadCart();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ============================================================
// CHECKOUT
// ============================================================
async function proceedToCheckout() {
    if (!isLoggedIn()) { showToast('Please log in to checkout', 'error'); openAuthModal(); return; }

    const items = cartData?.items || getLocalCart();
    if (!items.length) { showToast('Your cart is empty', 'error'); return; }

    // Validate stock before checkout
    try {
        const res = await authFetch(`${API_URL}/cart/validate-stock`, { method: 'POST' });
        const json = await res.json();
        const validation = json.data;
        if (validation && !validation.valid) {
            const issues = validation.issues || [];
            if (issues.length > 0) {
                const msgs = issues.map(i => `${i.name}: ${i.issue}`).join('\n');
                showToast('Stock issues found. Please review your cart.', 'error');
                // Highlight items with issues
                issues.forEach(issue => {
                    if (issue.itemId) {
                        const el = document.querySelector(`[data-item-id="${issue.itemId}"]`);
                        if (el) el.style.border = '2px solid #DC2626';
                    }
                });
                return;
            }
        }
    } catch (e) {
        // If validation fails, proceed anyway
    }

    openCheckoutModal();
}

// ============================================================
// RELATED PRODUCTS
// ============================================================
async function loadRelatedProducts() {
    const section = $('relatedSection');
    const grid = $('relatedGrid');

    if (cartData?.items?.length) {
        // Try to get first item's category
        const firstItem = cartData.items[0];
        const cat = firstItem.category || '';
        try {
            const params = cat ? `?category=${encodeURIComponent(cat)}&limit=4` : '?limit=4';
            const res = await fetch(`${API_URL}/products/featured${params}`);
            const json = await res.json();
            const products = json.data || json || [];
            if (products.length) {
                section.style.display = 'block';
                grid.innerHTML = products.slice(0, 4).map(p => renderProductCard(p)).join('');
                return;
            }
        } catch(e) {}
    }

    // Fallback: featured products
    try {
        const res = await fetch(`${API_URL}/products/featured?limit=4`);
        const json = await res.json();
        const products = json.data || json || [];
        if (products.length) {
            section.style.display = 'block';
            grid.innerHTML = products.slice(0, 4).map(p => renderProductCard(p)).join('');
        } else {
            section.style.display = 'none';
        }
    } catch(e) {
        section.style.display = 'none';
    }
}

function renderProductCard(p) {
    const img = p.images?.[0] ? getImageUrl(p.images[0], 400) : 'https://placehold.co/300x400/FAF9F6/C8A35A?text=Product';
    const discount = p.originalPrice && p.originalPrice > p.price ? Math.round(((p.originalPrice - p.price) / p.originalPrice) * 100) : 0;
    const stars = Array.from({length: 5}, (_, i) => `<i class="fas fa-star ${i < Math.round(p.rating||0) ? '' : 'empty'}"></i>`).join('');
    return `
        <article class="product-card" onclick="window.location.href='/product-details.html?id=${p._id}'">
            <div class="product-image-wrap">
                <img src="${img}" alt="${escHtml(p.name)}" loading="lazy" />
                ${discount ? `<span class="badge-discount">-${discount}%</span>` : ''}
                ${p.stock !== undefined && p.stock < 1 ? '<span class="badge-out">Out of Stock</span>' : ''}
            </div>
            <div class="product-info">
                <div class="product-brand">${escHtml(p.brand || p.category || 'Trendy Wardrobe')}</div>
                <div class="product-name">${escHtml(p.name)}</div>
                <div class="product-rating"><span class="stars">${stars}</span>${p.totalReviews ? `<span class="count">(${p.totalReviews})</span>` : ''}</div>
                <div class="product-price-row">
                    <span class="current">Ksh ${(p.price||0).toLocaleString()}</span>
                    ${discount ? `<span class="original">Ksh ${p.originalPrice.toLocaleString()}</span>` : ''}
                </div>
            </div>
        </article>`;
}

// ============================================================
// MODALS (reuse from SPA patterns)
// ============================================================

// Auth modal
function openAuthModal() {
    $('authOverlay').style.display = 'flex';
    document.body.classList.add('no-scroll');
    if (isLoggedIn()) showDashboard(getUser());
    else showAuthForms();
}
function closeAuthModal() {
    $('authOverlay').style.display = 'none';
    document.body.classList.remove('no-scroll');
}

$('authCloseBtn')?.addEventListener('click', closeAuthModal);
$('authOverlay')?.addEventListener('click', function(e) { if (e.target === this) closeAuthModal(); });

function showAuthForms() {
    $('authForms').style.display = 'block';
    $('authLoggedIn').style.display = 'none';
    $('authModalTitle').textContent = 'Account';
    document.querySelectorAll('.auth-tabs button').forEach(b => b.classList.remove('active'));
    document.querySelector('[data-tab="login"]')?.classList.add('active');
    $('loginForm').style.display = 'flex';
    $('registerForm').style.display = 'none';
}

function showDashboard(user) {
    $('authForms').style.display = 'none';
    $('authLoggedIn').style.display = 'block';
    $('authModalTitle').textContent = 'My Account';
    $('userAvatar').textContent = user.name.charAt(0).toUpperCase();
    $('userDisplayName').textContent = user.name;
    $('userDisplayEmail').textContent = user.email;
    $('profileName').value = user.name || '';
    $('profileEmail').value = user.email || '';
}

// Auth tabs
document.querySelectorAll('.auth-tabs button').forEach(tab => {
    tab.addEventListener('click', function() {
        document.querySelectorAll('.auth-tabs button').forEach(t => t.classList.remove('active'));
        this.classList.add('active');
        $('loginForm').style.display = this.dataset.tab === 'login' ? 'flex' : 'none';
        $('registerForm').style.display = this.dataset.tab === 'register' ? 'flex' : 'none';
    });
});

// Login
$('loginForm')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    const email = $('loginEmail').value.trim();
    const password = $('loginPassword').value.trim();
    try {
        const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (!res.ok) { showToast(data.message || 'Login failed', 'error'); return; }
        setAuth(data.user, data.token);
        showToast('Welcome back!', 'success');
        closeAuthModal();
        loadCart();
    } catch (err) { showToast('Connection error', 'error'); }
});

// Register
$('registerForm')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    const name = $('registerName').value.trim();
    const email = $('registerEmail').value.trim();
    const password = $('registerPassword').value.trim();
    const confirm = $('registerConfirm').value.trim();
    if (password !== confirm) { showToast('Passwords do not match', 'error'); return; }
    try {
        const res = await fetch(`${API_URL}/auth/register`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password })
        });
        const data = await res.json();
        if (!res.ok) { showToast(data.message || 'Registration failed', 'error'); return; }
        setAuth(data.user, data.token);
        showToast('Account created!', 'success');
        closeAuthModal();
        loadCart();
    } catch (err) { showToast('Connection error', 'error'); }
});

// Logout
$('logoutBtn')?.addEventListener('click', function() {
    clearAuth();
    closeAuthModal();
    showToast('Logged out', 'info');
    loadCart();
});

// Mini Cart
function openCartModal() {
    $('miniCartOverlay').classList.add('show');
    document.body.classList.add('no-scroll');
    renderMiniCart();
}
function closeCartModal() {
    $('miniCartOverlay').classList.remove('show');
    document.body.classList.remove('no-scroll');
}
$('closeCart')?.addEventListener('click', closeCartModal);
$('miniCartOverlay')?.addEventListener('click', function(e) { if (e.target === this) closeCartModal(); });
$('continueShoppingBtn')?.addEventListener('click', closeCartModal);

function renderMiniCart() {
    const items = getLocalCart();
    const container = $('cartItemsContainerMini');
    const totalContainer = $('cartTotalContainer');
    const emptyMsg = $('emptyCartMsg');
    if (!container || !totalContainer || !emptyMsg) return;

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
        total += (item.price || 0) * (item.quantity || 1);
        const img = item.image ? getImageUrl(item.image, 200) : 'https://placehold.co/80x100/FAF9F6/C8A35A?text=P';
        return `<div class="cart-item" style="grid-template-columns:60px 1fr auto;padding:10px;gap:10px;">
            <img src="${img}" alt="${escHtml(item.name)}" style="width:60px;height:75px;object-fit:cover;border-radius:6px;" loading="lazy" />
            <div class="cart-item-details" style="gap:2px;">
                <div class="cart-item-name" style="font-size:0.8rem;">${escHtml(item.name)}</div>
                <div style="font-size:0.7rem;color:var(--text-secondary);">Qty: ${item.quantity || 1}</div>
            </div>
            <div class="cart-item-price" style="font-size:0.85rem;">Ksh ${((item.price||0)*(item.quantity||1)).toLocaleString()}</div>
        </div>`;
    }).join('');
    const delivery = total >= 15000 ? 0 : 500;
    $('cartTotalPrice').textContent = `Ksh ${(total + delivery).toLocaleString()}`;
}

// Checkout
function openCheckoutModal() {
    $('checkoutOverlay').style.display = 'flex';
    document.body.classList.add('no-scroll');
    renderCheckout();
}
function closeCheckout() {
    $('checkoutOverlay').style.display = 'none';
    document.body.classList.remove('no-scroll');
}
$('checkoutCloseBtn')?.addEventListener('click', closeCheckout);
$('checkoutOverlay')?.addEventListener('click', function(e) { if (e.target === this) closeCheckout(); });
$('checkoutBtn')?.addEventListener('click', openCheckoutModal);

$('checkoutPayment')?.addEventListener('change', function() {
    ['mpesaInstructions','cardInstructions','bankInstructions'].forEach(id => {
        const el = $(id);
        if (el) el.style.display = 'none';
    });
    const map = { mpesa: 'mpesaInstructions', card: 'cardInstructions', bank: 'bankInstructions' };
    const el = $(map[this.value]);
    if (el) el.style.display = 'block';
});

function renderCheckout() {
    const items = getLocalCart();
    const container = $('checkoutItems');
    if (!container) return;
    let subtotal = 0;
    container.innerHTML = items.map(item => {
        const t = (item.price || 0) * (item.quantity || 1);
        subtotal += t;
        return `<div class="checkout-item"><span>${escHtml(item.name)} x${item.quantity || 1}</span><span>Ksh ${t.toLocaleString()}</span></div>`;
    }).join('');
    const delivery = subtotal >= 15000 ? 0 : 500;
    $('checkoutSubtotal').textContent = `Ksh ${subtotal.toLocaleString()}`;
    $('checkoutDelivery').textContent = delivery === 0 ? 'Free' : `Ksh ${delivery.toLocaleString()}`;
    const discount = appliedCoupon?.discount || 0;
    if (discount > 0) {
        $('discountRow').style.display = 'flex';
        $('checkoutDiscount').textContent = `- Ksh ${discount.toLocaleString()}`;
    } else {
        $('discountRow').style.display = 'none';
    }
    const total = subtotal + delivery - discount;
    $('checkoutTotal').textContent = `Ksh ${Math.max(0, total).toLocaleString()}`;
}

// Coupon in checkout
$('applyCouponBtn')?.addEventListener('click', async () => {
    const code = $('checkoutCoupon').value.trim();
    const msg = $('couponMessage');
    if (!code) { msg.textContent = 'Enter a coupon code'; msg.style.display = 'block'; msg.style.color = '#DC2626'; return; }
    try {
        const res = await fetch(`${API_URL}/coupons/validate?code=${encodeURIComponent(code)}&subtotal=${$('checkoutSubtotal').textContent.replace('Ksh ','').replace(/,/g,'')}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Invalid coupon');
        const c = data.data;
        appliedCoupon = { code: c.code, discount: c.discount };
        msg.textContent = `Coupon applied! Discount: Ksh ${c.discount.toLocaleString()}`;
        msg.style.display = 'block'; msg.style.color = '#16A34A';
        renderCheckout();
    } catch (err) {
        msg.textContent = err.message; msg.style.display = 'block'; msg.style.color = '#DC2626';
    }
});

// Place order
$('checkoutForm')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    if (!isLoggedIn()) { showToast('Please log in', 'error'); return; }
    const items = getLocalCart();
    if (!items.length) { showToast('Cart is empty', 'error'); return; }

    const btn = $('placeOrderBtn');
    btn.disabled = true; btn.textContent = 'Placing Order...';

    try {
        for (const item of items) {
            const res = await fetch(`${API_URL}/products/${item.id}`);
            const raw = await res.json();
            const p = raw.data || raw;
            if (p.stock !== undefined && p.stock < (item.quantity || 1)) {
                showToast(`Insufficient stock for ${p.name}`, 'error');
                btn.disabled = false; btn.textContent = 'Place Order'; return;
            }
        }

        const orderData = {
            items: items.map(i => ({ productId: i.id, name: i.name, quantity: i.quantity || 1, price: i.price || 0, size: i.size || undefined, color: i.color || undefined })),
            shippingAddress: {
                fullName: $('checkoutName').value.trim(),
                phone: $('checkoutPhone').value.trim(),
                address: $('checkoutAddress').value.trim(),
                city: $('checkoutCity').value.trim()
            },
            total: parseFloat($('checkoutTotal').textContent.replace('Ksh ','').replace(/,/g,'')),
            paymentMethod: $('checkoutPayment').value,
            coupon: appliedCoupon ? appliedCoupon.code : undefined
        };

        const res = await fetch(`${API_URL}/orders`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(orderData)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Order failed');

        setLocalCart([]);
        appliedCoupon = null;
        $('checkoutCoupon').value = '';
        $('couponMessage').style.display = 'none';
        $('discountRow').style.display = 'none';
        closeCheckout();

        $('orderNumberDisplay').textContent = `#${data.order?.orderNumber || data.order?._id?.toString().slice(-8).toUpperCase() || 'TW-000001'}`;
        $('orderSuccessOverlay').classList.add('show');
        showToast('Order placed successfully!', 'success');
        loadCart();
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        btn.disabled = false; btn.textContent = 'Place Order';
    }
});

$('orderSuccessDashboard')?.addEventListener('click', function() {
    $('orderSuccessOverlay').classList.remove('show');
    openAuthModal();
});

// ============================================================
// HEADER & NAV
// ============================================================
let lastScrollY = window.scrollY;
const stickyHeader = $('stickyHeader');
window.addEventListener('scroll', () => {
    const scrollY = window.scrollY;
    if (stickyHeader) {
        stickyHeader.classList.toggle('shrink', scrollY > 60);
        if (Math.abs(scrollY - lastScrollY) > 10) {
            if (scrollY > lastScrollY && scrollY > 100) stickyHeader.classList.add('hidden');
            else stickyHeader.classList.remove('hidden');
            lastScrollY = scrollY;
        }
    }
    const wa = $('floatingWhatsApp');
    if (wa) wa.classList.toggle('hidden-wa', scrollY < 200);
    const btt = $('backToTop');
    if (btt) btt.style.display = scrollY > 300 ? 'flex' : 'none';
}, { passive: true });

// Desktop hamburger
$('hamburgerBtnDesktop')?.addEventListener('click', () => {
    $('drawer').classList.toggle('open');
    $('drawerOverlay').classList.toggle('open');
    document.body.classList.toggle('no-scroll');
});
$('hamburgerBtn')?.addEventListener('click', function() {
    const open = $('drawer').classList.toggle('open');
    $('drawerOverlay').classList.toggle('open');
    document.body.classList.toggle('no-scroll');
    this.setAttribute('aria-expanded', open);
});
$('closeDrawer')?.addEventListener('click', closeDrawer);
$('drawerOverlay')?.addEventListener('click', closeDrawer);
function closeDrawer() {
    $('drawer').classList.remove('open');
    $('drawerOverlay').classList.remove('open');
    document.body.classList.remove('no-scroll');
}

// Mobile search
$('searchBtnMobile')?.addEventListener('click', function() {
    const bar = $('mobileSearchBar');
    const isOpen = bar.classList.toggle('open');
    this.setAttribute('aria-expanded', isOpen);
    bar.setAttribute('aria-hidden', !isOpen);
    if (isOpen) setTimeout(() => $('mobileSearchInput')?.focus(), 100);
});

// Search overlay
$('searchBtn')?.addEventListener('click', () => {
    $('searchOverlay').classList.add('open');
    document.body.classList.add('no-scroll');
    setTimeout(() => $('searchOverlayInput')?.focus(), 100);
});
$('searchClose')?.addEventListener('click', () => {
    $('searchOverlay').classList.remove('open');
    document.body.classList.remove('no-scroll');
});
$('searchOverlay')?.addEventListener('click', function(e) {
    if (e.target === this || (!e.target.closest('.search-panel') && !e.target.closest('.search-result-item'))) {
        this.classList.remove('open');
        document.body.classList.remove('no-scroll');
    }
});

// Profile dropdown
$('profileBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    $('profileDropdown').classList.toggle('open');
    $('profileBtn').setAttribute('aria-expanded', $('profileDropdown').classList.contains('open'));
});
document.addEventListener('click', (e) => {
    if ($('profileBtnWrapper') && !$('profileBtnWrapper').contains(e.target)) {
        $('profileDropdown')?.classList.remove('open');
        $('profileBtn')?.setAttribute('aria-expanded', 'false');
    }
});

// User button
$('userBtn')?.addEventListener('click', openAuthModal);
$('wishlistBtn')?.addEventListener('click', (e) => { e.preventDefault(); window.location.href = '/wishlist.html'; });

// Back to top
$('backToTop')?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

// Social links
async function loadSocialLinks() {
    try {
        const res = await fetch(`${API_URL}/social-links`);
        if (!res.ok) return;
        const data = await res.json();
        const links = data.data || data || {};
        const iconMap = { facebook: 'fab fa-facebook-f', twitter: 'fab fa-twitter', instagram: 'fab fa-instagram', pinterest: 'fab fa-pinterest', youtube: 'fab fa-youtube', tiktok: 'fab fa-tiktok', linkedin: 'fab fa-linkedin-in' };
        const html = Object.keys(links).filter(k => k !== '_id' && k !== 'createdAt' && k !== 'updatedAt' && k !== '__v' && k !== 'website' && links[k] && typeof links[k] === 'object' && links[k].enabled && links[k].url)
            .map(k => `<a href="${links[k].url}" target="_blank" aria-label="${k}"><i class="${iconMap[k] || 'fas fa-link'}"></i></a>`).join('');
        const footerEl = $('footerSocialLinks');
        const drawerEl = $('drawerSocialLinks');
        if (footerEl) footerEl.innerHTML = html;
        if (drawerEl) drawerEl.innerHTML = html;
    } catch(e) {}
}

// ============================================================
// KEYBOARD
// ============================================================
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if ($('miniCartOverlay')?.classList.contains('show')) closeCartModal();
        if ($('checkoutOverlay')?.style.display === 'flex') closeCheckout();
        if ($('authOverlay')?.style.display === 'flex') closeAuthModal();
        if ($('orderSuccessOverlay')?.classList.contains('show')) {
            $('orderSuccessOverlay').classList.remove('show');
            document.body.classList.remove('no-scroll');
        }
    }
});

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    loadSocialLinks();
    updateAllBadges();
    loadCart();

    // Bind global event listeners
    $('cartClearBtn')?.addEventListener('click', clearCart);
    $('couponApplyBtn')?.addEventListener('click', applyCoupon);
    $('couponRemoveBtn')?.addEventListener('click', removeCoupon);
    $('summaryCheckoutBtn')?.addEventListener('click', function(e) {
        e.preventDefault();
        if (!isLoggedIn()) { showToast('Please log in to checkout', 'error'); openAuthModal(); return; }
        const items = cartData?.items || getLocalCart();
        if (!items.length) { showToast('Your cart is empty', 'error'); return; }
        window.location.href = '/checkout.html';
    });
    $('cartEmptyShopBtn')?.addEventListener('click', () => window.location.href = '/');
    $('cartGuestLoginBtn')?.addEventListener('click', openAuthModal);
    $('cartGuestRegisterBtn')?.addEventListener('click', () => { openAuthModal(); setTimeout(() => document.querySelector('[data-tab="register"]')?.click(), 100); });
});
