// ============================================================
// PROFESSIONAL CHECKOUT — Trendy Wardrobe
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
            const w = width || 200;
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
    updateUI();
}

function updateUI() {
    const user = getUser();
    const userIcon = $('userIcon');
    if (userIcon) userIcon.className = user ? 'fas fa-user-check' : 'far fa-user';
    updateProfileDropdown(user);
}

function updateProfileDropdown(user) {
    const dh = $('dropdownHeader');
    if (dh) dh.innerHTML = user ? `<div class="dropdown-user-name">${escHtml(user.name)}</div><div class="dropdown-user-email">${escHtml(user.email)}</div>` : '<div style="padding:8px 0;font-size:0.85rem;color:var(--text-secondary);">Not logged in</div>';
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
$('toastClose')?.addEventListener('click', () => $('toast')?.classList.remove('show'));

// ---- State ----
let checkoutData = null; // { items, subtotal, ... }
let selectedDelivery = null;
let selectedPayment = null;
let appliedCoupon = null;
let cartItems = [];

// ---- Badge Sync ----
function updateCartBadge() {
    const count = cartItems.reduce((s, i) => s + (i.quantity || 1), 0);
    ['cartBadge','cartBadgeDesktop','mobileCartBadge'].forEach(id => {
        const el = $(id);
        if (el) { el.textContent = count; el.style.display = count > 0 ? 'flex' : 'none'; }
    });
}

function updateWishlistBadge(count) {
    ['wishlistBadge','wishlistBadgeDesktop'].forEach(id => {
        const el = $(id);
        if (el) { el.textContent = count; el.style.display = count > 0 ? 'flex' : 'none'; }
    });
}

// ============================================================
// CHECKOUT INIT
// ============================================================

async function initCheckout() {
    if (!isLoggedIn()) {
        $('checkoutLoading').style.display = 'none';
        $('checkoutLoginPrompt').style.display = 'flex';
        return;
    }

    try {
        // Load cart from API
        const res = await authFetch(`${API_URL}/cart`);
        const json = await res.json();
        const data = json.data || json;
        const items = data.items || [];

        if (items.length === 0) {
            // Try localStorage fallback
            const ls = getLocalCart();
            if (ls.length > 0) {
                cartItems = ls;
            } else {
                showToast('Your cart is empty', 'error');
                window.location.href = '/cart.html';
                return;
            }
        } else {
            cartItems = items.map(i => ({
                id: i.productId?._id || i.productId,
                name: i.name,
                price: i.price,
                originalPrice: i.originalPrice || 0,
                quantity: i.quantity,
                image: i.image || (i.productId?.images && i.productId.images[0]) || '',
                size: i.size || '',
                color: i.color || '',
                sku: i.sku || '',
                brand: i.brand || '',
                category: i.category || '',
                stock: i.stock || 99
            }));
        }

        // Store cart data
        const subtotal = cartItems.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0);
        checkoutData = { items: cartItems, subtotal };

        $('checkoutLoading').style.display = 'none';
        $('checkoutContent').style.display = 'block';

        // Render summary sidebar
        renderSummarySidebar();

        // Load shipping info
        loadSavedAddresses();
        autoFillShipping();

        // Load delivery options
        loadDeliveryOptions();

        // Load payment methods
        loadPaymentMethods();

        // Update badges
        updateCartBadge();
        loadBadgeCounts();

    } catch (err) {
        // Fallback to localStorage
        const ls = getLocalCart();
        if (ls.length > 0) {
            cartItems = ls;
            const subtotal = cartItems.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0);
            checkoutData = { items: cartItems, subtotal };

            $('checkoutLoading').style.display = 'none';
            $('checkoutContent').style.display = 'block';
            renderSummarySidebar();
            loadSavedAddresses();
            autoFillShipping();
            loadDeliveryOptions();
            loadPaymentMethods();
            updateCartBadge();
        } else {
            showToast('Could not load cart', 'error');
            window.location.href = '/cart.html';
        }
    }
}

function getLocalCart() {
    try { return JSON.parse(localStorage.getItem('tw_cart')) || JSON.parse(localStorage.getItem('cart')) || []; } catch(e) { return []; }
}

function setLocalCart(items) {
    localStorage.setItem('tw_cart', JSON.stringify(items));
}

async function loadBadgeCounts() {
    if (!isLoggedIn()) return;
    try {
        const [wRes, cRes] = await Promise.allSettled([
            authFetch(`${API_URL}/wishlist/count`),
            authFetch(`${API_URL}/cart/count`)
        ]);
        if (wRes.status === 'fulfilled') {
            const wd = await wRes.value.json();
            updateWishlistBadge(wd.count || 0);
        }
        if (cRes.status === 'fulfilled') {
            const cd = await cRes.value.json();
            updateCartBadge(cd.count || 0);
        }
    } catch(e) {}
}

// ============================================================
// ORDER SUMMARY SIDEBAR
// ============================================================

function renderSummarySidebar() {
    const container = $('checkoutSummaryItems');
    if (!container || !checkoutData) return;

    const items = checkoutData.items || [];
    const subtotal = items.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0);

    container.innerHTML = items.map(item => {
        const img = item.image ? getImageUrl(item.image, 200) : 'https://placehold.co/48x60/FAF9F6/C8A35A?text=P';
        const meta = [item.size, item.color].filter(Boolean).join(' / ');
        return `
            <div class="checkout-summary-item">
                <img src="${img}" alt="${escHtml(item.name)}" loading="lazy" />
                <div class="checkout-summary-item-info">
                    <div class="checkout-summary-item-name">${escHtml(item.name)}</div>
                    ${meta ? `<div class="checkout-summary-item-meta">${escHtml(meta)}</div>` : ''}
                    <div class="checkout-summary-item-qty">Qty: ${item.quantity || 1}</div>
                </div>
                <div class="checkout-summary-item-price">Ksh ${((item.price||0)*(item.quantity||1)).toLocaleString()}</div>
            </div>`;
    }).join('');

    updateSummaryTotals();
}

function updateSummaryTotals() {
    const items = checkoutData?.items || [];
    const subtotal = items.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0);

    let delivery = 0;
    let deliveryLabel = 'Ksh 0';
    if (selectedDelivery) {
        delivery = selectedDelivery.fee || 0;
        deliveryLabel = delivery === 0 ? 'Free' : `Ksh ${delivery.toLocaleString()}`;
    }

    const discount = appliedCoupon?.discount || 0;
    const total = subtotal + delivery - discount;

    $('summarySubtotal').textContent = `Ksh ${subtotal.toLocaleString()}`;
    $('summaryDelivery').textContent = deliveryLabel;

    const discountRow = $('summaryDiscountRow');
    if (discount > 0) {
        discountRow.style.display = 'flex';
        $('summaryDiscount').textContent = `- Ksh ${discount.toLocaleString()}`;
    } else {
        discountRow.style.display = 'none';
    }

    $('summaryTotal').textContent = `Ksh ${Math.max(0, total).toLocaleString()}`;
}

// ============================================================
// STEP NAVIGATION
// ============================================================

let currentStep = 1;
const totalSteps = 4;

function goToStep(step) {
    if (step < 1 || step > totalSteps) return;
    currentStep = step;

    // Update steps visibility
    for (let i = 1; i <= totalSteps; i++) {
        const el = $(`step${i}`);
        if (el) el.classList.toggle('active', i === step);
    }

    // Update progress indicators
    document.querySelectorAll('.progress-step').forEach(el => {
        const s = parseInt(el.dataset.step);
        el.classList.toggle('active', s === step);
        el.classList.toggle('completed', s < step);
    });

    // Update progress lines
    document.querySelectorAll('.progress-line').forEach((el, idx) => {
        el.classList.toggle('completed', idx < step - 1);
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================================
// STEP 1: SHIPPING INFORMATION
// ============================================================

async function loadSavedAddresses() {
    if (!isLoggedIn()) return;
    try {
        const res = await authFetch(`${API_URL}/users/addresses`);
        const json = await res.json();
        const addresses = json.data || [];
        const container = $('savedAddressesGrid');
        const section = $('savedAddresses');

        if (addresses.length > 0) {
            section.style.display = 'block';
            container.innerHTML = addresses.map(addr => `
                <div class="saved-address-card" data-id="${addr._id}">
                    <div class="addr-label">
                        <i class="fas fa-map-marker-alt"></i> ${escHtml(addr.label || 'Address')}
                        ${addr.isDefault ? '<span class="default-badge">Default</span>' : ''}
                    </div>
                    <div class="addr-details">
                        ${escHtml(addr.fullName)}<br />
                        ${escHtml(addr.street ? addr.street + ', ' : '')}${escHtml(addr.city)}${addr.county ? ', ' + escHtml(addr.county) : ''}<br />
                        ${addr.phone ? escHtml(addr.phone) : ''}
                    </div>
                </div>
            `).join('');

            // Select default
            const defaultAddr = addresses.find(a => a.isDefault) || addresses[0];
            if (defaultAddr) {
                selectAddress(defaultAddr);
            }

            // Click handler
            container.querySelectorAll('.saved-address-card').forEach(card => {
                card.addEventListener('click', function() {
                    container.querySelectorAll('.saved-address-card').forEach(c => c.classList.remove('selected'));
                    this.classList.add('selected');
                    const addr = addresses.find(a => a._id === this.dataset.id);
                    if (addr) selectAddress(addr);
                });
            });
        }
    } catch(e) {}
}

function selectAddress(addr) {
    $('shipFullName').value = addr.fullName || '';
    $('shipPhone').value = addr.phone || '';
    $('shipCounty').value = addr.county || '';
    $('shipCity').value = addr.city || '';
    $('shipStreet').value = addr.street || '';
    $('shipApartment').value = addr.apartment || '';
    $('shipPostalCode').value = addr.postalCode || '';
    $('shipInstructions').value = addr.deliveryInstructions || '';
}

function autoFillShipping() {
    const user = getUser();
    if (user) {
        if (!$('shipFullName').value) $('shipFullName').value = user.name || '';
        if (user.email && !$('shipEmail').value) $('shipEmail').value = user.email;
    }
}

$('showNewAddressBtn')?.addEventListener('click', function() {
    $('shippingForm').querySelectorAll('input, select, textarea').forEach(el => { el.value = ''; });
    autoFillShipping();
    $('savedAddressesGrid').querySelectorAll('.saved-address-card').forEach(c => c.classList.remove('selected'));
});

// Shipping form validation
$('shippingForm')?.addEventListener('submit', function(e) {
    e.preventDefault();
    if (validateShipping()) {
        goToStep(2);
    }
});

function validateShipping() {
    let valid = true;
    const fields = [
        { id: 'shipFullName', error: 'Full name is required' },
        { id: 'shipPhone', error: 'Phone number is required' },
        { id: 'shipCounty', error: 'Please select a county' },
        { id: 'shipCity', error: 'City is required' },
        { id: 'shipStreet', error: 'Street address is required' }
    ];

    fields.forEach(f => {
        const el = $(f.id);
        const err = $(f.id + 'Error');
        if (!el.value.trim()) {
            el.classList.add('error');
            if (err) { err.textContent = f.error; err.classList.add('visible'); }
            valid = false;
        } else {
            el.classList.remove('error');
            if (err) { err.textContent = ''; err.classList.remove('visible'); }
        }
    });

    if (!valid) {
        showToast('Please fill in all required fields', 'error');
    }
    return valid;
}

$('deliveryBackBtn')?.addEventListener('click', () => goToStep(1));

// ============================================================
// STEP 2: DELIVERY METHODS
// ============================================================

async function loadDeliveryOptions() {
    const container = $('deliveryOptions');
    try {
        const res = await fetch(`${API_URL}/orders/shipping-options`);
        const json = await res.json();
        const options = json.data || [];

        if (options.length === 0) throw new Error('No options');

        const subtotal = checkoutData?.subtotal || 0;
        const freeThreshold = options[0]?.freeThreshold || 15000;

        container.innerHTML = options.map((opt, idx) => {
            let feeDisplay = `Ksh ${opt.fee.toLocaleString()}`;
            let badge = '';
            if (opt.fee === 0) {
                feeDisplay = 'Free';
                badge = '<span class="delivery-option-badge free">Free</span>';
            } else if (subtotal >= freeThreshold && opt.type !== 'pickup') {
                badge = '<span class="delivery-option-badge free">Free</span>';
                feeDisplay = 'Free';
            }

            return `
                <label class="delivery-option ${idx === 0 ? 'selected' : ''}">
                    <input type="radio" name="delivery" value="${opt.type}" ${idx === 0 ? 'checked' : ''} />
                    <div class="delivery-option-content">
                        <div class="delivery-option-title">${escHtml(opt.label)} ${badge}</div>
                        <div class="delivery-option-desc">${escHtml(opt.estimatedDays)}${opt.provider ? ' by ' + escHtml(opt.provider) : ''}</div>
                    </div>
                    <div class="delivery-option-price">${feeDisplay}</div>
                </label>`;
        }).join('');

        // Select first option by default
        if (options.length > 0) {
            selectDeliveryMethod(options[0]);
        }

        // Change handler
        container.querySelectorAll('input[name="delivery"]').forEach(radio => {
            radio.addEventListener('change', function() {
                container.querySelectorAll('.delivery-option').forEach(o => o.classList.remove('selected'));
                this.closest('.delivery-option').classList.add('selected');
                const opt = options.find(o => o.type === this.value);
                if (opt) selectDeliveryMethod(opt);
            });
        });

    } catch(e) {
        container.innerHTML = `
            <label class="delivery-option selected">
                <input type="radio" name="delivery" value="standard" checked />
                <div class="delivery-option-content">
                    <div class="delivery-option-title">Standard Delivery <span class="delivery-option-badge free">Free</span></div>
                    <div class="delivery-option-desc">3-7 business days</div>
                </div>
                <div class="delivery-option-price">Free</div>
            </label>
            <label class="delivery-option">
                <input type="radio" name="delivery" value="express" />
                <div class="delivery-option-content">
                    <div class="delivery-option-title">Express Delivery</div>
                    <div class="delivery-option-desc">1-2 business days by Express Courier</div>
                </div>
                <div class="delivery-option-price">Ksh 1,200</div>
            </label>`;
        selectDeliveryMethod({ type: 'standard', label: 'Standard Delivery', fee: 0, estimatedDays: '3-7 business days', provider: '' });
        container.querySelectorAll('input[name="delivery"]').forEach(radio => {
            radio.addEventListener('change', function() {
                container.querySelectorAll('.delivery-option').forEach(o => o.classList.remove('selected'));
                this.closest('.delivery-option').classList.add('selected');
                const fee = this.value === 'express' ? 1200 : 0;
                selectDeliveryMethod({ type: this.value, label: this.value === 'express' ? 'Express Delivery' : 'Standard Delivery', fee, estimatedDays: this.value === 'express' ? '1-2 business days' : '3-7 business days', provider: this.value === 'express' ? 'Express Courier' : '' });
            });
        });
    }
}

function selectDeliveryMethod(opt) {
    selectedDelivery = opt;
    updateSummaryTotals();
}

$('deliveryNextBtn')?.addEventListener('click', () => {
    if (!selectedDelivery) { showToast('Please select a delivery method', 'error'); return; }
    goToStep(3);
});

$('paymentBackBtn')?.addEventListener('click', () => goToStep(2));

// ============================================================
// STEP 3: PAYMENT METHODS
// ============================================================

async function loadPaymentMethods() {
    const container = $('paymentMethods');
    try {
        const res = await fetch(`${API_URL}/orders/payment-methods`);
        const json = await res.json();
        const methods = json.data || [];
        if (methods.length === 0) throw new Error('No methods');

        const iconMap = {
            'cash-on-delivery': { icon: 'fas fa-money-bill-wave', desc: 'Pay when you receive your order' },
            'm-pesa': { icon: 'fas fa-mobile-alt', desc: 'Pay via M-Pesa mobile money' },
            'card-payment': { icon: 'fas fa-credit-card', desc: 'Visa, Mastercard, or Maestro' },
            'paypal': { icon: 'fab fa-cc-paypal', desc: 'Pay with your PayPal account' },
            'stripe': { icon: 'fab fa-cc-stripe', desc: 'Secure card payment via Stripe' },
            'bank-transfer': { icon: 'fas fa-university', desc: 'Direct bank transfer' }
        };

        container.innerHTML = methods.map((method, idx) => {
            const info = iconMap[method.id] || { icon: 'fas fa-credit-card', desc: 'Pay securely' };
            const isDefault = method.id === 'cash-on-delivery' || method.id === 'm-pesa';
            return `
                <label class="payment-method ${idx === 0 ? 'selected' : ''}">
                    <input type="radio" name="payment" value="${method.id}" ${idx === 0 ? 'checked' : ''} />
                    <div class="payment-method-icon"><i class="${info.icon}"></i></div>
                    <div class="payment-method-info">
                        <div class="payment-method-title">${escHtml(method.label)}</div>
                        <div class="payment-method-desc">${info.desc}</div>
                    </div>
                </label>`;
        }).join('');

        // Select first
        if (methods.length > 0) {
            selectPaymentMethod(methods[0].id, methods[0].label);
        }

        container.querySelectorAll('input[name="payment"]').forEach(radio => {
            radio.addEventListener('change', function() {
                container.querySelectorAll('.payment-method').forEach(o => o.classList.remove('selected'));
                this.closest('.payment-method').classList.add('selected');
                const m = methods.find(m => m.id === this.value);
                if (m) selectPaymentMethod(m.id, m.label);
            });
        });

    } catch(e) {
        // Fallback hardcoded
        const fallback = [
            { id: 'cash-on-delivery', label: 'Cash on Delivery', icon: 'fas fa-money-bill-wave', desc: 'Pay when you receive' },
            { id: 'm-pesa', label: 'M-Pesa', icon: 'fas fa-mobile-alt', desc: 'Pay via M-Pesa' },
            { id: 'card-payment', label: 'Card Payment', icon: 'fas fa-credit-card', desc: 'Visa, Mastercard' },
            { id: 'paypal', label: 'PayPal', icon: 'fab fa-cc-paypal', desc: 'PayPal account' }
        ];
        container.innerHTML = fallback.map((m, idx) => `
            <label class="payment-method ${idx === 0 ? 'selected' : ''}">
                <input type="radio" name="payment" value="${m.id}" ${idx === 0 ? 'checked' : ''} />
                <div class="payment-method-icon"><i class="${m.icon}"></i></div>
                <div class="payment-method-info">
                    <div class="payment-method-title">${m.label}</div>
                    <div class="payment-method-desc">${m.desc}</div>
                </div>
            </label>`).join('');
        selectPaymentMethod('cash-on-delivery', 'Cash on Delivery');
        container.querySelectorAll('input[name="payment"]').forEach(radio => {
            radio.addEventListener('change', function() {
                container.querySelectorAll('.payment-method').forEach(o => o.classList.remove('selected'));
                this.closest('.payment-method').classList.add('selected');
                selectPaymentMethod(this.value, this.closest('.payment-method').querySelector('.payment-method-title').textContent);
            });
        });
    }
}

function selectPaymentMethod(id, label) {
    selectedPayment = { id, label };
}

// Coupon
$('checkoutCouponApplyBtn')?.addEventListener('click', async function() {
    const input = $('checkoutCouponInput');
    const msg = $('checkoutCouponMsg');
    const code = input.value.trim();
    if (!code) { msg.textContent = 'Please enter a coupon code'; msg.className = 'coupon-msg error'; return; }

    this.disabled = true;
    this.textContent = '...';

    try {
        const subtotal = checkoutData?.subtotal || 0;
        const res = await fetch(`${API_URL}/coupons/validate?code=${encodeURIComponent(code)}&subtotal=${subtotal}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Invalid coupon');

        const c = data.data;
        appliedCoupon = { code: c.code, discount: c.discount };
        msg.textContent = `Coupon applied! Discount: Ksh ${c.discount.toLocaleString()}`;
        msg.className = 'coupon-msg success';

        $('checkoutCouponApplied').style.display = 'flex';
        $('couponAppliedCode').textContent = c.code;
        $('couponAppliedDiscount').textContent = `-Ksh ${c.discount.toLocaleString()}`;
        input.disabled = true;
        this.textContent = 'Applied';

        updateSummaryTotals();
    } catch (err) {
        msg.textContent = err.message;
        msg.className = 'coupon-msg error';
        appliedCoupon = null;
    } finally {
        this.disabled = false;
        if (this.textContent === '...') this.textContent = 'Apply';
    }
});

$('checkoutCouponRemoveBtn')?.addEventListener('click', function() {
    appliedCoupon = null;
    $('checkoutCouponInput').value = '';
    $('checkoutCouponInput').disabled = false;
    $('checkoutCouponApplyBtn').textContent = 'Apply';
    $('checkoutCouponApplyBtn').disabled = false;
    $('checkoutCouponMsg').className = 'coupon-msg';
    $('checkoutCouponMsg').textContent = '';
    $('checkoutCouponApplied').style.display = 'none';
    updateSummaryTotals();
});

$('paymentNextBtn')?.addEventListener('click', () => {
    if (!selectedPayment) { showToast('Please select a payment method', 'error'); return; }
    renderReview();
    goToStep(4);
});

$('reviewBackBtn')?.addEventListener('click', () => goToStep(3));

// ============================================================
// STEP 4: ORDER REVIEW
// ============================================================

function renderReview() {
    // Address
    const addrHtml = `
        <strong>${escHtml($('shipFullName').value)}</strong><br />
        ${$('shipPhone').value ? escHtml($('shipPhone').value) + '<br />' : ''}
        ${$('shipEmail').value ? escHtml($('shipEmail').value) + '<br />' : ''}
        ${escHtml($('shipStreet').value)}${$('shipApartment').value ? ', ' + escHtml($('shipApartment').value) : ''}<br />
        ${escHtml($('shipCity').value)}${$('shipCounty').value ? ', ' + escHtml($('shipCounty').value) : ''}
        ${$('shipPostalCode').value ? ' ' + escHtml($('shipPostalCode').value) : ''}
        ${$('shipInstructions').value ? '<br /><em>Instructions: ' + escHtml($('shipInstructions').value) + '</em>' : ''}
    `;
    $('reviewAddress').innerHTML = addrHtml;

    // Delivery
    const del = selectedDelivery || { label: 'Standard Delivery', estimatedDays: '3-7 business days' };
    $('reviewDelivery').innerHTML = `
        <strong>${escHtml(del.label)}</strong><br />
        ${del.estimatedDays ? escHtml(del.estimatedDays) : ''}
        ${del.provider ? ' — ' + escHtml(del.provider) : ''}
        ${del.fee > 0 ? '<br />Fee: Ksh ' + del.fee.toLocaleString() : '<br />Free'}
    `;

    // Payment
    $('reviewPayment').innerHTML = `<strong>${escHtml(selectedPayment?.label || 'Cash on Delivery')}</strong>`;

    // Items
    const items = checkoutData?.items || [];
    $('reviewItems').innerHTML = items.map(item => {
        const img = item.image ? getImageUrl(item.image, 200) : 'https://placehold.co/56x70/FAF9F6/C8A35A?text=P';
        const meta = [item.size, item.color].filter(Boolean).join(' / ');
        return `
            <div class="review-item">
                <img src="${img}" alt="${escHtml(item.name)}" loading="lazy" />
                <div class="review-item-info">
                    <div class="review-item-name">${escHtml(item.name)}</div>
                    ${meta ? `<div class="review-item-meta">${escHtml(meta)}</div>` : ''}
                    <div class="review-item-meta">Qty: ${item.quantity || 1}</div>
                </div>
                <div class="review-item-price">Ksh ${((item.price||0)*(item.quantity||1)).toLocaleString()}</div>
            </div>`;
    }).join('');
}

// Review Edit buttons
document.querySelectorAll('.review-edit-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        const step = parseInt(this.dataset.step);
        if (step >= 1 && step <= 4) goToStep(step);
    });
});

// ============================================================
// PLACE ORDER
// ============================================================

$('placeOrderBtn')?.addEventListener('click', async function() {
    if (this.disabled) return;
    if (!isLoggedIn()) { showToast('Please sign in', 'error'); return; }

    // Double-check stock before placing
    this.disabled = true;
    this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Placing Order...';

    try {
        // Validate stock via API
        const stockRes = await authFetch(`${API_URL}/cart/validate-stock`, { method: 'POST' });
        const stockJson = await stockRes.json();
        const validation = stockJson.data;
        if (validation && !validation.valid && validation.issues?.length > 0) {
            const msgs = validation.issues.map(i => `${i.name}: ${i.issue}`).join('\n');
            showToast('Stock issues found. Please review your cart.', 'error');
            this.disabled = false;
            this.innerHTML = 'Place Order <i class="fas fa-lock"></i>';
            return;
        }
    } catch(e) {}

    try {
        const items = cartItems.map(i => ({
            productId: i.id,
            name: i.name,
            quantity: i.quantity || 1,
            price: i.price || 0,
            size: i.size || undefined,
            color: i.color || undefined
        }));

        const deliveryFee = selectedDelivery?.fee || 0;
        const subtotal = checkoutData?.subtotal || 0;
        const discount = appliedCoupon?.discount || 0;
        const total = Math.max(0, subtotal + deliveryFee - discount);

        const orderData = {
            items,
            shippingAddress: {
                fullName: $('shipFullName').value.trim(),
                phone: $('shipPhone').value.trim(),
                email: $('shipEmail').value.trim() || '',
                county: $('shipCounty').value,
                city: $('shipCity').value.trim(),
                street: $('shipStreet').value.trim(),
                apartment: $('shipApartment').value.trim(),
                postalCode: $('shipPostalCode').value.trim(),
                deliveryInstructions: $('shipInstructions').value.trim()
            },
            deliveryMethod: {
                type: selectedDelivery?.type || 'standard',
                label: selectedDelivery?.label || 'Standard Delivery',
                fee: deliveryFee,
                estimatedDays: selectedDelivery?.estimatedDays || '3-7 business days',
                provider: selectedDelivery?.provider || ''
            },
            paymentMethod: selectedPayment?.id || 'cash-on-delivery',
            couponCode: appliedCoupon?.code || undefined,
            couponDiscount: discount || undefined,
            subtotal,
            deliveryFee,
            total,
            notes: $('shipInstructions').value.trim() || undefined
        };

        const res = await authFetch(`${API_URL}/orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderData)
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Order failed');

        // Clear local cart
        setLocalCart([]);
        localStorage.removeItem('cart');

        // Redirect to confirmation page
        const orderId = data.data?._id || data.order?._id;
        const orderNumber = data.data?.orderNumber || data.order?.orderNumber;
        window.location.href = `/order-confirmation.html?id=${orderId}&number=${orderNumber}`;

    } catch (err) {
        showToast(err.message || 'Failed to place order', 'error');
        this.disabled = false;
        this.innerHTML = 'Place Order <i class="fas fa-lock"></i>';
    }
});

// ============================================================
// HEADER & NAV
// ============================================================

let lastScrollY = window.scrollY;
const stickyHeader = $('stickyHeader');
let orderSearchDebounce;

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

// Hamburger
$('hamburgerBtnDesktop')?.addEventListener('click', () => {
    $('drawer').classList.toggle('open');
    $('drawerOverlay').classList.toggle('open');
    document.body.classList.toggle('no-scroll');
});
$('hamburgerBtn')?.addEventListener('click', function() {
    $('drawer').classList.toggle('open');
    $('drawerOverlay').classList.toggle('open');
    document.body.classList.toggle('no-scroll');
    this.setAttribute('aria-expanded', $('drawer').classList.contains('open'));
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

document.querySelectorAll('.auth-tabs button').forEach(tab => {
    tab.addEventListener('click', function() {
        document.querySelectorAll('.auth-tabs button').forEach(t => t.classList.remove('active'));
        this.classList.add('active');
        $('loginForm').style.display = this.dataset.tab === 'login' ? 'flex' : 'none';
        $('registerForm').style.display = this.dataset.tab === 'register' ? 'flex' : 'none';
    });
});

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
        initCheckout();
    } catch (err) { showToast('Connection error', 'error'); }
});

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
        initCheckout();
    } catch (err) { showToast('Connection error', 'error'); }
});

$('logoutBtn')?.addEventListener('click', function() {
    clearAuth();
    closeAuthModal();
    showToast('Logged out', 'info');
    window.location.href = '/';
});

$('checkoutLoginBtn')?.addEventListener('click', openAuthModal);

// ==== KEYBOARD ====
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if ($('authOverlay')?.style.display === 'flex') closeAuthModal();
    }
});

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    loadSocialLinks();
    updateUI();
    initCheckout();
});
