// ============================================================
// WISHLIST PAGE — Trendy Wardrobe
// ============================================================

// ---- CONFIG ----
const API_URL = 'https://trendy-backend-jq27.onrender.com/api';
const IMAGE_BASE = API_URL.replace('/api', '');

// ---- State ----
let wishlistItems = [];
let wishlistStats = { count: 0, inStock: 0, outOfStock: 0, estimatedValue: 0 };
let wlSearchQuery = '';
let wlSortBy = 'newest';
let wlCategoryFilter = 'all';
let wlAvailabilityFilter = 'all';

// ---- XSS ----
function escHtml(str) {
    if (str == null) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
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

// ---- Image Helper ----
function getImageUrl(path, width) {
    if (!path) return '';
    let url = path.startsWith('http://') || path.startsWith('https://') ? path : IMAGE_BASE + path;
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
function getUser() { try { const u = localStorage.getItem('user'); return u ? JSON.parse(u) : null; } catch(e) { return null; } }
function isLoggedIn() { return !!getToken(); }
function clearAuth() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    location.reload();
}

function authFetch(url, opts = {}) {
    const token = getToken();
    if (!token) return Promise.reject(new Error('Not logged in'));
    const headers = { ...(opts.headers || {}), 'Authorization': `Bearer ${token}` };
    return fetch(url, { ...opts, headers }).then(res => {
        if (res.status === 401 || res.status === 403) { clearAuth(); throw new Error('Session expired'); }
        return res;
    });
}

// ---- Guest Wishlist (localStorage) ----
function getGuestWishlist() {
    try { return JSON.parse(localStorage.getItem('tw_wishlist')) || []; } catch(e) { return []; }
}
function saveGuestWishlist(ids) {
    localStorage.setItem('tw_wishlist', JSON.stringify(ids));
}
function addGuestWishlist(id) {
    const list = getGuestWishlist();
    if (!list.includes(id)) { list.push(id); saveGuestWishlist(list); }
}
function removeGuestWishlist(id) {
    saveGuestWishlist(getGuestWishlist().filter(i => i !== id));
}
function isInGuestWishlist(id) {
    return getGuestWishlist().includes(id);
}

// ---- Toast ----
function showToast(msg, type) {
    const toast = document.getElementById('toast');
    const msgEl = document.getElementById('toastMessage');
    if (!toast || !msgEl) return;
    msgEl.textContent = msg;
    toast.className = 'toast show';
    if (type === 'success') toast.style.borderLeftColor = '#059669';
    else if (type === 'error') toast.style.borderLeftColor = '#DC2626';
    else toast.style.borderLeftColor = '#C8A35A';
    clearTimeout(toast._hide);
    toast._hide = setTimeout(() => toast.classList.remove('show'), 3000);
}
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('toastClose')?.addEventListener('click', () => {
        document.getElementById('toast')?.classList.remove('show');
    });
});

// ---- Badge Update ----
function updateWishlistBadge() {
    const count = wishlistStats.count || wishlistItems.length || getGuestWishlist().length || 0;
    ['wishlistBadge', 'wishlistBadgeDesktop'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = count;
            el.style.display = count > 0 ? 'flex' : 'none';
            el.setAttribute('data-count', count);
        }
    });
    const mwb = document.getElementById('mobileWishlistBadge');
    if (mwb) { mwb.textContent = count; mwb.style.display = count > 0 ? 'flex' : 'none'; }
    const wi = document.getElementById('wishlistIconDesktop');
    if (wi) wi.className = count > 0 ? 'fas fa-heart heart-icon liked' : 'far fa-heart heart-icon';
}

// ---- Stats ----
function computeStats(items) {
    const count = items.length;
    let inStock = 0, estimatedValue = 0;
    items.forEach(item => {
        const p = item.productId || item;
        if (p) {
            if (isProductAvailable(p)) inStock++;
            estimatedValue += p.price || 0;
        }
    });
    return { count, inStock, outOfStock: count - inStock, estimatedValue };
}

function renderStats(stats) {
    const el = document.getElementById('wishlistStats');
    if (!el) return;
    if (stats.count === 0) { el.style.display = 'none'; return; }
    el.style.display = 'grid';
    document.getElementById('wlStatTotal').textContent = stats.count;
    document.getElementById('wlStatInStock').textContent = stats.inStock;
    document.getElementById('wlStatOutOfStock').textContent = stats.outOfStock;
    document.getElementById('wlStatValue').textContent = 'Ksh ' + (stats.estimatedValue || 0).toLocaleString();
}

// ---- Render Items ----
function renderWishlistItems() {
    const container = document.getElementById('wishlistItemsContainer');
    const filterEl = document.getElementById('wishlistFilters');
    const clearBtn = document.getElementById('wishlistClearBtn');
    const shareBtn = document.getElementById('wishlistShareBtn');
    const moveAllBtn = document.getElementById('wishlistMoveAllBtn');
    const countEl = document.getElementById('wishlistItemCount');
    if (!container) return;

    const items = wishlistItems;
    const isGuest = !isLoggedIn();

    // Update count
    if (countEl) countEl.textContent = `(${items.length} item${items.length !== 1 ? 's' : ''})`;

    // Toggle action buttons
    if (clearBtn) clearBtn.style.display = items.length > 0 && !isGuest ? 'flex' : 'none';
    if (shareBtn) shareBtn.style.display = items.length > 0 && !isGuest ? 'flex' : 'none';
    if (moveAllBtn) {
        const hasInStock = items.some(item => {
            const p = item.productId || item;
            return p && isProductAvailable(p);
        });
        moveAllBtn.style.display = items.length > 0 && !isGuest ? 'flex' : 'none';
        moveAllBtn.disabled = !hasInStock;
    }

    // Collect categories for filter
    if (!isGuest && filterEl) {
        const cats = [...new Set(items.map(item => {
            const p = item.productId || item;
            return p ? p.category : null;
        }).filter(Boolean))].sort();
        const catSelect = document.getElementById('wishlistCategoryFilter');
        if (catSelect) {
            const currentVal = catSelect.value;
            catSelect.innerHTML = '<option value="all">All Categories</option>' +
                cats.map(c => `<option value="${c}" ${wlCategoryFilter === c ? 'selected' : ''}>${escHtml(c)}</option>`).join('');
            catSelect.value = currentVal;
        }
    }

    // Filter
    let filtered = [...items];
    if (wlCategoryFilter !== 'all') filtered = filtered.filter(item => {
        const p = item.productId || item;
        return p && p.category === wlCategoryFilter;
    });
    if (wlAvailabilityFilter === 'in-stock') filtered = filtered.filter(item => {
        const p = item.productId || item;
        return p && isProductAvailable(p);
    });
    if (wlAvailabilityFilter === 'out-of-stock') filtered = filtered.filter(item => {
        const p = item.productId || item;
        return p && !isProductAvailable(p);
    });
    if (wlSearchQuery) {
        const q = wlSearchQuery.toLowerCase();
        filtered = filtered.filter(item => {
            const p = item.productId || item;
            return p && ((p.name || '').toLowerCase().includes(q) || (p.brand || '').toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q));
        });
    }
    if (wlSortBy === 'price-low') filtered.sort((a, b) => ((a.productId || a).price || 0) - ((b.productId || b).price || 0));
    else if (wlSortBy === 'price-high') filtered.sort((a, b) => ((b.productId || b).price || 0) - ((a.productId || a).price || 0));
    else if (wlSortBy === 'name') filtered.sort((a, b) => (((a.productId || a).name || '')).localeCompare(((b.productId || b).name || '')));
    else if (wlSortBy === 'discount') filtered.sort((a, b) => {
        const getDiscount = item => {
            const p = item.productId || item;
            return p.originalPrice && p.originalPrice > p.price ? ((p.originalPrice - p.price) / p.originalPrice) : 0;
        };
        return getDiscount(b) - getDiscount(a);
    });
    else filtered.sort((a, b) => new Date((b.productId || b).updatedAt || (b.productId || b).createdAt || 0) - new Date((a.productId || a).updatedAt || (a.productId || a).createdAt || 0));

    if (filterEl) filterEl.style.display = items.length > 0 ? 'flex' : 'none';

    if (filtered.length === 0) {
        container.innerHTML =
            `<div class="wishlist-empty">
                <div class="wishlist-empty-icon"><i class="far fa-heart"></i></div>
                <h3>${items.length === 0 ? 'Your Wishlist is Empty' : 'No Items Match Your Search'}</h3>
                <p>${items.length === 0 ? 'Save your favorite items for later and never lose track of what you love.' : 'Try adjusting your filters or search terms.'}</p>
                ${items.length === 0 ? '<button class="wishlist-empty-btn" onclick="window.location.href=\'/\'">Continue Shopping</button>' : ''}
            </div>`;
        return;
    }

    container.innerHTML = '<div class="wishlist-items-grid">' +
        filtered.map(item => renderWishlistCard(item, isGuest)).join('') +
        '</div>';
}

function renderWishlistCard(item, isGuest) {
    const p = item.productId || item;
    if (!p) return '';
    const img = (p.images && p.images[0]) ? getImageUrl(p.images[0], 400) : (p.thumbnail ? getImageUrl(p.thumbnail) : 'https://placehold.co/300x400/FAF9F6/C8A35A?text=Product');
    const discount = p.originalPrice && p.originalPrice > p.price ? Math.round(((p.originalPrice - p.price) / p.originalPrice) * 100) : 0;
    const outOfStock = !isProductAvailable(p);
    const rating = p.rating || 0;
    const stars = Array.from({length: 5}, (_, i) => i < Math.round(rating) ? '&#9733;' : '&#9734;').join('');
    const itemId = item._id || item.id || '';
    const productId = p._id || p.id || '';

    let badges = '';
    if (discount) badges += `<span class="wishlist-item-badge discount">-${discount}%</span>`;
    if (outOfStock) badges += `<span class="wishlist-item-badge out-of-stock">Out of Stock</span>`;
    if (p.isNewArrival) badges += `<span class="wishlist-item-badge new">New</span>`;
    if (p.limitedAvailable) badges += `<span class="wishlist-item-badge limited">Limited</span>`;

    let metaHtml = '';
    if (item.size) metaHtml += `<span class="wishlist-item-meta-tag"><i class="fas fa-ruler"></i>${escHtml(item.size)}</span>`;
    if (item.color) metaHtml += `<span class="wishlist-item-meta-tag"><i class="fas fa-palette"></i>${escHtml(item.color)}</span>`;
    if (p.sku) metaHtml += `<span class="wishlist-item-meta-tag">SKU: ${escHtml(p.sku)}</span>`;

    const effStock = getEffectiveStock(p);
    const stockLabel = outOfStock ? 'Out of Stock' : effStock <= (p.stockThreshold || 5) ? `Only ${effStock} left` : 'In Stock';
    const stockClass = outOfStock ? 'out-of-stock' : 'in-stock';
    const stockIcon = outOfStock ? 'fa-times-circle' : effStock <= (p.stockThreshold || 5) ? 'fa-exclamation-circle' : 'fa-check-circle';

    return `
        <div class="wishlist-item" data-product-id="${escHtml(productId)}">
            <div class="wishlist-item-image-wrap">
                <img class="wishlist-item-image" src="${escHtml(img)}" alt="${escHtml(p.name || '')}" loading="lazy" onclick="window.location.href='/product-details.html?id=${productId}'" />
                ${badges}
                ${!isGuest ? `<button class="wishlist-item-remove" onclick="removeFromWishlist('${itemId}', '${escHtml(p.name || 'Item')}')" title="Remove"><i class="fas fa-trash-alt"></i></button>` : ''}
            </div>
            <div class="wishlist-item-info">
                <div class="wishlist-item-brand">${escHtml(p.brand || p.category || 'Trendy Wardrobe')}</div>
                <div class="wishlist-item-name"><a href="/product-details.html?id=${productId}">${escHtml(p.name || '')}</a></div>
                ${rating > 0 ? `<div class="wishlist-item-rating">${stars} <span class="count">(${p.totalReviews || 0})</span></div>` : ''}
                <div class="wishlist-item-price-row">
                    <span class="wishlist-item-price">Ksh ${(p.price || 0).toLocaleString()}</span>
                    ${discount ? `<span class="wishlist-item-original">Ksh ${(p.originalPrice || 0).toLocaleString()}</span><span class="wishlist-item-discount-text">-${discount}%</span>` : ''}
                </div>
                ${metaHtml ? `<div class="wishlist-item-meta">${metaHtml}</div>` : ''}
                <div class="wishlist-item-stock ${stockClass}"><i class="fas ${stockIcon}"></i> ${stockLabel}</div>
                ${p.deliveryEstimate ? `<div class="wishlist-item-delivery"><i class="fas fa-truck"></i> ${escHtml(p.deliveryEstimate)}</div>` : ''}
                <div class="wishlist-item-actions">
                    <button class="wishlist-item-add-cart" ${outOfStock ? 'disabled' : ''} onclick="${isGuest ? `showToast('Please log in to add to cart','error');showLoginPrompt()` : `moveToCart('${itemId}','${productId}')`}">
                        <i class="fas fa-cart-plus"></i> ${outOfStock ? 'Unavailable' : 'Add to Cart'}
                    </button>
                    <button class="wishlist-item-view" onclick="window.location.href='/product-details.html?id=${productId}'" title="Quick View"><i class="fas fa-eye"></i></button>
                </div>
            </div>
        </div>`;
}

// ---- Load Wishlist ----
async function loadWishlist() {
    const loading = document.getElementById('wishlistLoading');
    const content = document.getElementById('wishlistContent');
    const guestPrompt = document.getElementById('wishlistGuestPrompt');
    const main = document.getElementById('wishlistMain');

    if (!isLoggedIn()) {
        const guest = getGuestWishlist();
        if (guest.length === 0) {
            if (loading) loading.style.display = 'none';
            if (content) content.style.display = 'block';
            if (guestPrompt) guestPrompt.style.display = 'flex';
            if (main) main.style.display = 'none';
            updateWishlistBadge();
            return;
        }
        if (loading) loading.style.display = 'flex';
        if (content) content.style.display = 'none';
        if (guestPrompt) guestPrompt.style.display = 'none';

        const products = await Promise.all(guest.map(async id => {
            try {
                const r = await fetch(`${API_URL}/products/${id}`);
                const d = await r.json();
                return d.data || d;
            } catch(e) { return null; }
        }));
        const valid = products.filter(Boolean);
        wishlistItems = valid.map(p => ({ productId: p, _id: p._id }));
        wishlistStats = computeStats(wishlistItems);

        if (loading) loading.style.display = 'none';
        if (content) content.style.display = 'block';
        if (guestPrompt) guestPrompt.style.display = 'none';
        if (main) main.style.display = 'block';

        renderStats(wishlistStats);
        renderWishlistItems();
        updateWishlistBadge();
        return;
    }

    // Logged in
    if (loading) loading.style.display = 'flex';
    if (content) content.style.display = 'none';

    try {
        const res = await authFetch(`${API_URL}/wishlist`);
        if (!res.ok) throw new Error('Failed to load wishlist');
        const data = await res.json();
        const items = data.items || [];
        wishlistItems = items;
        wishlistStats = data.stats || computeStats(items);

        if (loading) loading.style.display = 'none';
        if (content) content.style.display = 'block';
        if (guestPrompt) guestPrompt.style.display = 'none';
        if (main) main.style.display = 'block';

        renderStats(wishlistStats);
        renderWishlistItems();
        updateWishlistBadge();

        // Sync guest wishlist to server
        const guest = getGuestWishlist();
        if (guest.length > 0) {
            try {
                await authFetch(`${API_URL}/wishlist/sync`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ items: guest.map(id => ({ productId: id })) })
                });
                localStorage.removeItem('tw_wishlist');
            } catch(e) {}
        }
    } catch (err) {
        if (loading) loading.style.display = 'none';
        if (content) content.style.display = 'block';
        if (main) main.style.display = 'block';
        document.getElementById('wishlistItemsContainer').innerHTML =
            '<div class="wishlist-empty"><h3>Could not load wishlist</h3><p>Please try again later.</p></div>';
    }
}

// ---- Add to Wishlist (from other pages, API) ----
async function addToWishlistAPI(productId, opts = {}) {
    if (!isLoggedIn()) {
        addGuestWishlist(productId);
        updateWishlistBadge();
        return;
    }
    const res = await authFetch(`${API_URL}/wishlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, ...opts })
    });
    if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        if (d.message === 'Product already in wishlist') return;
        throw new Error(d.message || 'Failed to add');
    }
    await loadWishlist();
}

// ---- Remove from Wishlist ----
async function removeFromWishlist(itemId, itemName) {
    if (!isLoggedIn()) {
        const list = getGuestWishlist();
        const p = wishlistItems.find(item => item._id === itemId || item.id === itemId);
        const productId = p ? (p.productId?._id || p._id || p.id) : itemId;
        removeGuestWishlist(productId);
        wishlistItems = wishlistItems.filter(item => (item._id || item.id) !== itemId);
        wishlistStats = computeStats(wishlistItems);
        renderStats(wishlistStats);
        renderWishlistItems();
        updateWishlistBadge();
        showToast(`${itemName || 'Item'} removed from wishlist`, 'info');
        return;
    }

    try {
        const p = wishlistItems.find(item => item._id === itemId || item.id === itemId);
        const productId = p ? (p.productId?._id || p._id || p.id) : itemId;

        const res = await authFetch(`${API_URL}/wishlist/${productId}`, { method: 'DELETE' });
        if (res.ok) {
            wishlistItems = wishlistItems.filter(item => (item._id || item.id) !== itemId);
            wishlistStats = computeStats(wishlistItems);
            renderStats(wishlistStats);
            renderWishlistItems();
            updateWishlistBadge();
            showToast(`${itemName || 'Item'} removed from wishlist`, 'info');
        }
    } catch(e) {
        showToast('Could not remove item', 'error');
    }
}

// ---- Move to Cart ----
async function moveToCart(itemId, productId) {
    if (!isLoggedIn()) { showToast('Please log in to add to cart', 'error'); showLoginPrompt(); return; }
    try {
        const res = await authFetch(`${API_URL}/wishlist/move-to-cart/${itemId}`, { method: 'POST' });
        if (!res.ok) {
            const d = await res.json().catch(() => ({}));
            showToast(d.message || 'Could not move to cart', 'error');
            return;
        }
        wishlistItems = wishlistItems.filter(item => (item._id || item.id) !== itemId);
        wishlistStats = computeStats(wishlistItems);
        renderStats(wishlistStats);
        renderWishlistItems();
        updateWishlistBadge();
        await updateCartBadge();
        showToast('Moved to cart', 'success');
    } catch(e) {
        showToast('Could not move to cart', 'error');
    }
}

// ---- Move All to Cart ----
async function moveAllToCart() {
    if (!isLoggedIn()) { showToast('Please log in first', 'error'); showLoginPrompt(); return; }
    try {
        const res = await authFetch(`${API_URL}/wishlist/move-all-to-cart`, { method: 'POST' });
        if (!res.ok) {
            const d = await res.json().catch(() => ({}));
            showToast(d.message || 'Could not move items', 'error');
            return;
        }
        const d = await res.json();
        await loadWishlist();
        await updateCartBadge();
        showToast(d.message || 'Items moved to cart', 'success');
    } catch(e) {
        showToast('Could not move items', 'error');
    }
}

// ---- Clear Wishlist ----
async function clearWishlist() {
    if (!isLoggedIn()) return;
    if (!confirm('Clear your entire wishlist?')) return;
    try {
        const res = await authFetch(`${API_URL}/wishlist/clear`, { method: 'DELETE' });
        if (res.ok) {
            wishlistItems = [];
            wishlistStats = { count: 0, inStock: 0, outOfStock: 0, estimatedValue: 0 };
            renderStats(wishlistStats);
            renderWishlistItems();
            updateWishlistBadge();
            showToast('Wishlist cleared', 'info');
        }
    } catch(e) {
        showToast('Could not clear wishlist', 'error');
    }
}

// ---- Share Wishlist ----
let wishlistShareUrl = '';
async function shareWishlist() {
    if (!isLoggedIn()) return;
    const overlay = document.getElementById('wishlistShareOverlay');
    const linkInput = document.getElementById('wishlistShareLink');
    if (!overlay || !linkInput) return;

    if (!wishlistShareUrl) {
        try {
            const res = await authFetch(`${API_URL}/wishlist/share`, { method: 'POST' });
            if (!res.ok) { showToast('Could not generate share link', 'error'); return; }
            const d = await res.json();
            wishlistShareUrl = d.shareUrl || '';
        } catch(e) {
            showToast('Could not generate share link', 'error');
            return;
        }
    }
    linkInput.value = wishlistShareUrl;
    overlay.classList.add('show');

    const nativeBtn = document.getElementById('wishlistShareNative');
    if (navigator.share) {
        nativeBtn.style.display = 'block';
        nativeBtn.querySelector('button').onclick = () => {
            navigator.share({ title: 'My Wishlist - Trendy Wardrobe', text: 'Check out my favorite items!', url: wishlistShareUrl }).catch(() => {});
        };
    } else {
        nativeBtn.style.display = 'none';
    }
}

async function disableSharing() {
    try {
        await authFetch(`${API_URL}/wishlist/share`, { method: 'DELETE' });
        wishlistShareUrl = '';
        document.getElementById('wishlistShareOverlay').classList.remove('show');
        showToast('Wishlist sharing disabled', 'info');
    } catch(e) {
        showToast('Could not disable sharing', 'error');
    }
}

async function copyShareLink() {
    const input = document.getElementById('wishlistShareLink');
    const btn = document.getElementById('wishlistShareCopyBtn');
    if (!input || !btn) return;
    try {
        await navigator.clipboard.writeText(input.value);
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
    } catch(e) {
        input.select();
        input.setSelectionRange(0, 99999);
        try { document.execCommand('copy'); btn.textContent = 'Copied!'; } catch(e2) {}
    }
}

// ---- Cart Badge Sync ----
async function updateCartBadge() {
    if (!isLoggedIn()) {
        const cart = JSON.parse(localStorage.getItem('tw_cart')) || JSON.parse(localStorage.getItem('cart')) || [];
        const count = cart.reduce((sum, i) => sum + (i.quantity || 1), 0);
        ['cartBadge', 'cartBadgeDesktop'].forEach(id => {
            const el = document.getElementById(id);
            if (el) { el.textContent = count; el.style.display = count > 0 ? 'flex' : 'none'; }
        });
        const mcb = document.getElementById('mobileCartBadge');
        if (mcb) { mcb.textContent = count; mcb.style.display = count > 0 ? 'flex' : 'none'; }
        return;
    }
    try {
        const res = await authFetch(`${API_URL}/cart/count`);
        const data = await res.json();
        const count = data.count || 0;
        ['cartBadge', 'cartBadgeDesktop'].forEach(id => {
            const el = document.getElementById(id);
            if (el) { el.textContent = count; el.style.display = count > 0 ? 'flex' : 'none'; }
        });
        const mcb = document.getElementById('mobileCartBadge');
        if (mcb) { mcb.textContent = count; mcb.style.display = count > 0 ? 'flex' : 'none'; }
    } catch(e) {}
}

// ---- Filter Handlers ----
function setupFilters() {
    const searchInput = document.getElementById('wishlistSearchInput');
    const sortSelect = document.getElementById('wishlistSortSelect');
    const catFilter = document.getElementById('wishlistCategoryFilter');
    const availFilter = document.getElementById('wishlistAvailabilityFilter');

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            wlSearchQuery = searchInput.value;
            renderWishlistItems();
        });
    }
    if (sortSelect) {
        sortSelect.addEventListener('change', () => {
            wlSortBy = sortSelect.value;
            renderWishlistItems();
        });
    }
    if (catFilter) {
        catFilter.addEventListener('change', () => {
            wlCategoryFilter = catFilter.value;
            renderWishlistItems();
        });
    }
    if (availFilter) {
        availFilter.addEventListener('change', () => {
            wlAvailabilityFilter = availFilter.value;
            renderWishlistItems();
        });
    }
}

// ---- Auth Modal (from SPA) ----
function showLoginPrompt() {
    if (typeof window.openAuthModal === 'function') { window.openAuthModal(); return; }
    window.location.href = '/';
}

// ---- Init ----
document.addEventListener('DOMContentLoaded', async () => {
    // Load shared SPA module if available
    if (window.loadSharedModule) await window.loadSharedModule();

    setupFilters();
    await loadWishlist();
    await updateCartBadge();

    // Event listeners
    document.getElementById('wishlistGuestLoginBtn')?.addEventListener('click', () => {
        if (typeof window.openAuthModal === 'function') { window.openAuthModal(); return; }
        window.location.href = '/';
    });
    document.getElementById('wishlistGuestRegisterBtn')?.addEventListener('click', () => {
        if (typeof window.openAuthModal === 'function') { window.openAuthModal('register'); return; }
        window.location.href = '/';
    });
    document.getElementById('wishlistClearBtn')?.addEventListener('click', clearWishlist);
    document.getElementById('wishlistShareBtn')?.addEventListener('click', shareWishlist);
    document.getElementById('wishlistMoveAllBtn')?.addEventListener('click', moveAllToCart);
    document.getElementById('wishlistShareClose')?.addEventListener('click', () => {
        document.getElementById('wishlistShareOverlay')?.classList.remove('show');
    });
    document.getElementById('wishlistShareOverlay')?.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) e.target.classList.remove('show');
    });
    document.getElementById('wishlistShareCopyBtn')?.addEventListener('click', copyShareLink);
    document.getElementById('wishlistShareDisable')?.addEventListener('click', disableSharing);
    document.getElementById('wishlistBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = '/wishlist.html';
    });
    document.getElementById('wishlistBtnDesktop')?.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = '/wishlist.html';
    });
    document.querySelectorAll('[id="ddWishlist"]').forEach(el => {
        el?.addEventListener('click', (e) => {
            e.preventDefault();
            window.location.href = '/wishlist.html';
        });
    });

    // Profile dropdown listeners
    const profileBtn = document.getElementById('profileBtn');
    const profileDropdown = document.getElementById('profileDropdown');
    if (profileBtn && profileDropdown) {
        profileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const expanded = profileBtn.getAttribute('aria-expanded') === 'true';
            profileBtn.setAttribute('aria-expanded', !expanded);
            profileDropdown.setAttribute('aria-hidden', expanded);
            profileDropdown.style.display = expanded ? 'none' : 'block';
        });
        document.addEventListener('click', (e) => {
            if (!profileBtn.contains(e.target) && !profileDropdown.contains(e.target)) {
                profileBtn.setAttribute('aria-expanded', 'false');
                profileDropdown.setAttribute('aria-hidden', 'true');
                profileDropdown.style.display = 'none';
            }
        });
    }
});

// Export functions for use from other pages
window.addToWishlistAPI = addToWishlistAPI;
window.loadWishlist = loadWishlist;
window.updateWishlistBadge = updateWishlistBadge;
window.removeFromWishlist = removeFromWishlist;
window.moveToCart = moveToCart;
