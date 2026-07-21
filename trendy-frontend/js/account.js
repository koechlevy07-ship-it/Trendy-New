// ============================================================
// ACCOUNT PAGE — Trendy Wardrobe
// ============================================================

const API_URL = 'https://trendy-backend-jq27.onrender.com/api';

// ---- Helpers ----
const $ = id => document.getElementById(id);
function escHtml(s) { return s == null ? '' : String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function getToken() { return localStorage.getItem('token'); }
function getUser() { try { return JSON.parse(localStorage.getItem('user')); } catch(e) { return null; } }
function isLoggedIn() { return !!getToken(); }
function clearAuth() { localStorage.removeItem('token'); localStorage.removeItem('user'); location.reload(); }

function authFetch(url, opts = {}) {
    const token = getToken();
    if (!token) return Promise.reject(new Error('Not logged in'));
    const headers = { ...(opts.headers || {}), 'Authorization': `Bearer ${token}` };
    return fetch(url, { ...opts, headers }).then(res => {
        if (res.status === 401 || res.status === 403) { clearAuth(); throw new Error('Session expired'); }
        return res;
    });
}

function showToast(msg, type) {
    const t = $('toast'), m = $('toastMessage');
    if (!t || !m) return;
    m.textContent = msg; t.className = 'toast show';
    t.style.borderLeftColor = type === 'success' ? '#059669' : type === 'error' ? '#DC2626' : '#C8A35A';
    clearTimeout(t._hide); t._hide = setTimeout(() => t.classList.remove('show'), 3000);
}
document.addEventListener('DOMContentLoaded', () => $('toastClose')?.addEventListener('click', () => $('toast')?.classList.remove('show')));

// ---- State ----
let profileData = null;
let addresses = [];
let orders = [];
let wishlistItems = [];
let reviews = [];
let notifications = [];
let tickets = [];
let cartItems = [];
let paymentMethods = [];
let loyaltyData = null;
let coupons = [];
let loginHistory = [];
let activeDevices = [];
let displayPrefs = { theme: 'system', currency: 'KES', language: 'en' };
let privacyPrefs = { analytics: true, marketing: true, personalization: true };

// ---- Goto Section ----
function showSection(id) {
    document.querySelectorAll('.acc-section').forEach(s => s.classList.remove('active'));
    const section = $(`section-${id}`);
    if (section) section.classList.add('active');
    document.querySelectorAll('.acc-nav-item[data-section]').forEach(b => b.classList.toggle('active', b.dataset.section === id));
    const sidebar = $('accSidebar');
    if (sidebar && window.innerWidth <= 900) sidebar.classList.add('collapsed');
    
    // Load section-specific data
    if (id === 'orders') loadOrders();
    if (id === 'reviews') loadReviews();
    if (id === 'cart') loadCart();
    if (id === 'payment') loadPaymentMethods();
    if (id === 'loyalty') loadLoyalty();
    if (id === 'coupons') loadCoupons('available');
    if (id === 'settings') loadSettings();
}

// ---- Init ----
async function init() {
    if (!isLoggedIn()) {
        $('accLoading').style.display = 'none';
        $('accGuest').style.display = 'flex';
        return;
    }
    $('accLoading').style.display = 'flex';
    $('accContent').style.display = 'none';
    try {
        await loadProfile();
        setupNavigation();
        setupForms();
        $('accLoading').style.display = 'none';
        $('accContent').style.display = 'block';
        showSection('dashboard');
    } catch (e) {
        $('accLoading').style.display = 'none';
        showToast('Could not load account data', 'error');
    }
}

// ---- Load Profile ----
async function loadProfile() {
    const res = await authFetch(`${API_URL}/users/profile`);
    if (!res.ok) throw new Error('Failed');
    const d = await res.json();
    profileData = d.data || d;
    localStorage.setItem('user', JSON.stringify(profileData));
    renderProfile();
    await Promise.all([
        loadAddresses(),
        loadOrders(),
        loadWishlist(),
        loadReviews(),
        loadNotifications(),
        loadTickets(),
        loadCart(),
        loadPaymentMethods(),
        loadLoyalty(),
        loadCoupons('available'),
        loadSettings()
    ]);
}

// ---- Render Profile Header + Dashboard ----
function renderProfile() {
    const u = profileData;
    const avatarLetter = (u.name || 'U').charAt(0).toUpperCase();

    // Sidebar
    $('accAvatar').textContent = avatarLetter;
    $('accUserName').textContent = u.name || 'User';
    $('accUserEmail').textContent = u.email || '';

    // Welcome
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    $('accWelcome').textContent = `${greeting}, ${u.name || 'there'}!`;

    // Stats
    const s = u.stats || {};
    $('asOrderCount').textContent = s.orderCount || 0;
    $('asPendingOrders').textContent = s.pendingOrders || 0;
    $('asDeliveredOrders').textContent = s.deliveredOrders || 0;
    $('asTotalSpent').textContent = 'Ksh ' + (s.totalSpent || 0).toLocaleString();
    $('asWishlistCount').textContent = s.wishlistCount || 0;
    $('asReviewCount').textContent = s.reviewCount || 0;
    $('asRewardPoints').textContent = s.rewardPoints || 0;
    $('asActiveCoupons').textContent = s.activeCoupons || 0;
    $('asCartItems').textContent = s.cartItems || 0;
    $('asAccountStatus').textContent = u.status || 'Active';

    // Badge
    const nb = s.unreadNotifications;
    const badge = $('accNotifBadge');
    if (badge) {
        badge.textContent = nb || 0;
        badge.style.display = nb > 0 ? 'inline' : 'none';
    }

    // Profile form
    $('apName').value = u.name || '';
    $('apEmail').value = u.email || '';
    $('apPhone').value = u.phone || '';
    $('apDob').value = u.dateOfBirth ? u.dateOfBirth.split('T')[0] : '';
    $('apGender').value = u.gender || '';
    const photo = $('accProfilePhoto');
    if (photo) photo.src = u.profilePhoto || `https://placehold.co/80x80/FAF9F6/C8A35A?text=${avatarLetter}`;
}

// ---- Addresses ----
async function loadAddresses() {
    try {
        const res = await authFetch(`${API_URL}/users/addresses`);
        if (!res.ok) return;
        const d = await res.json();
        addresses = d.data || [];
        renderAddresses();
    } catch(e) { /* ignore */ }
}

function renderAddresses() {
    const container = $('aaList');
    if (!container) return;
    if (!addresses.length) {
        container.innerHTML = '<p class="acc-text-muted">No addresses saved yet. Add your first address above.</p>';
        return;
    }
    container.innerHTML = addresses.map((a, i) => `
        <div class="acc-address-card ${a.isDefault ? 'default' : ''}">
            ${a.isDefault ? '<span class="acc-address-badge">Default</span>' : ''}
            <div class="acc-address-label">${escHtml(a.label || 'Address ' + (i+1))}</div>
            <div class="acc-address-detail">
                <strong>${escHtml(a.fullName || '')}</strong>${a.phone ? '<br/>' + escHtml(a.phone) : ''}
                <br/>${[a.street, a.apartment].filter(Boolean).join(', ')}
                <br/>${[a.city, a.county].filter(Boolean).join(', ')}${a.postalCode ? ' ' + a.postalCode : ''}
                ${a.deliveryInstructions ? '<br/><em>' + escHtml(a.deliveryInstructions) + '</em>' : ''}
            </div>
            <div class="acc-address-actions">
                <button onclick="editAddress('${a._id}')"><i class="fas fa-edit"></i> Edit</button>
                ${!a.isDefault ? `<button class="danger" onclick="deleteAddress('${a._id}')"><i class="fas fa-trash-alt"></i> Delete</button>` : ''}
                ${!a.isDefault ? `<button onclick="setDefaultAddress('${a._id}')"><i class="fas fa-check-circle"></i> Set Default</button>` : ''}
            </div>
        </div>
    `).join('');
}

function openAddressForm(data) {
    $('aaOverlay').style.display = 'flex';
    $('aaFormTitle').textContent = data ? 'Edit Address' : 'Add Address';
    $('aaId').value = data ? data._id : '';
    $('aaLabel').value = (data && data.label) || 'Home';
    $('aaFullName').value = (data && data.fullName) || '';
    $('aaPhone').value = (data && data.phone) || '';
    $('aaCounty').value = (data && data.county) || '';
    $('aaCity').value = (data && data.city) || '';
    $('aaStreet').value = (data && data.street) || '';
    $('aaApartment').value = (data && data.apartment) || '';
    $('aaPostalCode').value = (data && data.postalCode) || '';
    $('aaInstructions').value = (data && data.deliveryInstructions) || '';
    $('aaDefault').checked = (data && data.isDefault) || false;
    $('aaMsg').style.display = 'none';
}

$('aaAddBtn')?.addEventListener('click', () => openAddressForm(null));
$('aaClose')?.addEventListener('click', () => $('aaOverlay').style.display = 'none');
$('aaCancel')?.addEventListener('click', () => $('aaOverlay').style.display = 'none');
$('aaOverlay')?.addEventListener('click', (e) => { if (e.target === e.currentTarget) e.target.style.display = 'none'; });

$('aaForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = $('aaId').value;
    const body = {
        label: $('aaLabel').value,
        fullName: $('aaFullName').value.trim(),
        phone: $('aaPhone').value.trim(),
        county: $('aaCounty').value.trim(),
        city: $('aaCity').value.trim(),
        street: $('aaStreet').value.trim(),
        apartment: $('aaApartment').value.trim(),
        postalCode: $('aaPostalCode').value.trim(),
        deliveryInstructions: $('aaInstructions').value.trim(),
        isDefault: $('aaDefault').checked
    };
    if (!body.fullName || !body.city) { showToast('Full name and city are required', 'error'); return; }
    try {
        const res = id
            ? await authFetch(`${API_URL}/users/addresses/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
            : await authFetch(`${API_URL}/users/addresses`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Failed'); }
        $('aaOverlay').style.display = 'none';
        showToast(id ? 'Address updated' : 'Address added', 'success');
        await loadAddresses();
    } catch (err) {
        showToast(err.message, 'error');
    }
});

window.editAddress = function(id) {
    const addr = addresses.find(a => a._id === id);
    if (addr) openAddressForm(addr);
};

window.deleteAddress = async function(id) {
    if (!confirm('Delete this address?')) return;
    try {
        await authFetch(`${API_URL}/users/addresses/${id}`, { method: 'DELETE' });
        showToast('Address deleted', 'info');
        await loadAddresses();
    } catch(e) { showToast('Could not delete address', 'error'); }
};

window.setDefaultAddress = async function(id) {
    try {
        await authFetch(`${API_URL}/users/addresses/${id}/default`, { method: 'PUT' });
        showToast('Default address updated', 'success');
        await loadAddresses();
    } catch(e) { showToast('Could not update address', 'error'); }
};

// ---- Orders ----
async function loadOrders() {
    try {
        const res = await authFetch(`${API_URL}/orders/my-orders`);
        if (!res.ok) return;
        orders = await res.json();
        renderOrders();
        renderRecentOrders();
    } catch(e) { /* ignore */ }
}

function statusBadge(status) {
    const cls = (status || 'pending').toLowerCase().replace(/\s+/g, '-');
    return `<span class="acc-order-status ${cls}">${escHtml(status || 'Pending')}</span>`;
}

function renderOrders() {
    const container = $('aoList');
    if (!container) return;
    if (!orders.length) { container.innerHTML = '<p class="acc-text-muted">No orders yet. Start shopping!</p>'; return; }
    container.innerHTML = orders.map(o => `
        <div class="acc-order-card">
            <div class="acc-order-header">
                <span class="acc-order-number">#${o.orderNumber || o._id?.slice(-8) || 'N/A'}</span>
                ${statusBadge(o.status)}
            </div>
            <div class="acc-order-meta">
                <span><i class="far fa-calendar"></i> ${o.createdAt ? new Date(o.createdAt).toLocaleDateString() : 'N/A'}</span>
                <span><i class="fas fa-shopping-bag"></i> ${(o.items || []).length} item${(o.items||[]).length !== 1 ? 's' : ''}</span>
                <span><strong>Ksh ${(o.total || 0).toLocaleString()}</strong></span>
            </div>
            <div class="acc-order-actions">
                <button onclick="viewOrder('${o._id}')"><i class="fas fa-eye"></i> View</button>
                <button onclick="window.location.href='/order-confirmation.html?id=${o._id}'"><i class="fas fa-receipt"></i> Details</button>
                ${['pending', 'confirmed'].includes(o.status || '') ? `<button class="danger" onclick="cancelOrder('${o._id}')"><i class="fas fa-times"></i> Cancel</button>` : ''}
            </div>
        </div>
    `).join('');
}

function renderRecentOrders() {
    const container = $('accRecentOrders');
    if (!container) return;
    const recent = orders.slice(0, 3);
    if (!recent.length) { container.innerHTML = '<p class="acc-text-muted">No orders yet.</p>'; return; }
    container.innerHTML = recent.map(o => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border-light);font-size:0.82rem;">
            <div>
                <div style="font-weight:600;font-size:0.78rem;">#${o.orderNumber || o._id?.slice(-8) || 'N/A'}</div>
                <div style="font-size:0.7rem;color:var(--text-secondary);">${o.createdAt ? new Date(o.createdAt).toLocaleDateString() : ''}</div>
            </div>
            <div style="text-align:right;">
                <div style="font-weight:600;font-size:0.78rem;">Ksh ${(o.total || 0).toLocaleString()}</div>
                ${statusBadge(o.status)}
            </div>
        </div>
    `).join('');
}

window.viewOrder = function(id) { window.location.href = `/order-confirmation.html?id=${id}`; };
window.cancelOrder = async function(id) {
    if (!confirm('Cancel this order?')) return;
    try {
        const res = await authFetch(`${API_URL}/orders/${id}/cancel`, { method: 'PUT' });
        if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Cannot cancel'); }
        showToast('Order cancelled', 'info');
        await loadOrders();
    } catch(e) { showToast(e.message, 'error'); }
};

// ---- Wishlist ----
async function loadWishlist() {
    try {
        const res = await authFetch(`${API_URL}/wishlist`);
        if (!res.ok) return;
        const d = await res.json();
        wishlistItems = d.items || [];
        renderWishlist();
    } catch(e) { /* ignore */ }
}

function renderWishlist() {
    const container = $('awList');
    if (!container) return;
    const items = wishlistItems.slice(0, 4);
    if (!items.length) { container.innerHTML = '<p class="acc-text-muted">Your wishlist is empty.</p>'; return; }
    container.innerHTML = `<div class="acc-wishlist-grid">${items.map(item => {
        const p = item.productId;
        if (!p) return '';
        const img = (p.images && p.images[0]) ? p.images[0] : 'https://placehold.co/200x240/FAF9F6/C8A35A?text=P';
        return `<div class="acc-wishlist-item">
            <img src="${img}" alt="${escHtml(p.name)}" loading="lazy" />
            <div class="acc-wishlist-item-info">
                <div class="acc-wishlist-item-name">${escHtml(p.name)}</div>
                <div class="acc-wishlist-item-price">Ksh ${(p.price || 0).toLocaleString()}</div>
            </div>
        </div>`;
    }).join('')}</div>`;
}

// ---- Reviews ----
async function loadReviews() {
    try {
        const res = await authFetch(`${API_URL}/users/reviews`);
        if (!res.ok) return;
        const d = await res.json();
        reviews = d.data || [];
        renderReviews();
    } catch(e) { /* ignore */ }
}

function renderReviews() {
    const container = $('arList');
    if (!container) return;
    if (!reviews.length) { container.innerHTML = '<p class="acc-text-muted">You haven\'t written any reviews yet.</p>'; return; }
    container.innerHTML = reviews.map(r => {
        const p = r.product || {};
        const stars = Array.from({length: 5}, (_, i) => i < (r.rating || 0) ? '&#9733;' : '&#9734;').join('');
        return `<div class="acc-review-card">
            <div class="acc-review-header">
                <span class="acc-review-product">${escHtml(p.name || 'Product')}</span>
                <span class="acc-review-stars">${stars}</span>
            </div>
            ${r.comment ? `<div class="acc-review-text">${escHtml(r.comment)}</div>` : ''}
            <div class="acc-review-actions">
                <button class="danger" onclick="deleteReview('${r._id}')"><i class="fas fa-trash-alt"></i> Delete</button>
            </div>
        </div>`;
    }).join('');
}

window.deleteReview = async function(id) {
    if (!confirm('Delete this review?')) return;
    try {
        const res = await authFetch(`${API_URL}/reviews/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed');
        showToast('Review deleted', 'info');
        await loadReviews();
    } catch(e) { showToast('Could not delete review', 'error'); }
};

// ---- Tickets ----
async function loadTickets() {
    try {
        const res = await authFetch(`${API_URL}/contact/my-tickets`);
        if (!res.ok) return;
        tickets = await res.json();
        renderTickets();
    } catch(e) { /* ignore */ }
}

function renderTickets() {
    const container = $('atList');
    if (!container) return;
    if (!tickets.length) {
        container.innerHTML = '<p class="acc-text-muted">No support tickets yet. <a href="/contact.html" style="color:var(--color-gold);">Create one</a> if you need help.</p>';
        return;
    }
    const statusColors = { new:'var(--warning)', open:'var(--info)', read:'#3b82f6', in_progress:'var(--gold)', pending:'#8b5cf6', waiting_for_customer:'#ec4899', resolved:'var(--success)', closed:'#6b7280', spam:'var(--error)' };
    container.innerHTML = tickets.map(t => `
        <div class="acc-ticket-card">
            <div class="acc-ticket-header">
                <span class="acc-ticket-id">${escHtml(t.ticketId)}</span>
                <span class="acc-ticket-status" style="background:${statusColors[t.status] || '#6b7280'};">${(t.status||'new').replace(/_/g,' ')}</span>
            </div>
            <div class="acc-ticket-meta">
                <span><i class="far fa-calendar"></i> ${t.createdAt ? new Date(t.createdAt).toLocaleDateString() : 'N/A'}</span>
                <span><i class="fas fa-tag"></i> ${escHtml(t.category || 'general')}</span>
                <span><i class="fas fa-exclamation-triangle"></i> ${escHtml(t.priority || 'medium')}</span>
            </div>
            <div class="acc-ticket-subject">${escHtml(t.subject || 'No subject')}</div>
            ${t.replies && t.replies.length ? `
                <div class="acc-ticket-last-reply">
                    <small>Last reply: ${new Date(t.replies[t.replies.length-1].createdAt).toLocaleString()}</small>
                    ${t.replies[t.replies.length-1].isInternal ? '' : '<span style="color:var(--success);margin-left:8px;">✓ Admin replied</span>'}
                </div>` : '<div class="acc-ticket-last-reply"><small>No replies yet</small></div>'}
            <div class="acc-ticket-actions">
                <button onclick="viewTicket('${t._id}')"><i class="fas fa-eye"></i> View</button>
                ${['new','open','read','in_progress','pending','waiting_for_customer'].includes(t.status) ? `<button onclick="replyToTicket('${t._id}')"><i class="fas fa-reply"></i> Reply</button>` : ''}
            </div>
        </div>
    `).join('');
}

window.viewTicket = function(id) {
    // Could open a modal or navigate to a detail page
    window.location.href = `/contact.html?ticket=${id}`;
};

window.replyToTicket = function(id) {
    // Could open a modal to reply
    window.location.href = `/contact.html?reply=${id}`;
};

// ---- Notifications ----
async function loadNotifications() {
    try {
        const [notifRes, prefRes] = await Promise.all([
            authFetch(`${API_URL}/users/notifications`),
            authFetch(`${API_URL}/users/notification-preferences`)
        ]);
        if (notifRes.ok) { const nd = await notifRes.json(); notifications = nd.data || []; }
        if (prefRes.ok) { const pd = await prefRes.json(); renderNotifPrefs(pd.data || pd); }
        renderNotifications();
    } catch(e) { /* ignore */ }
}

function renderNotifications() {
    const container = $('anList');
    if (!container) return;
    if (!notifications.length) { container.innerHTML = '<p class="acc-text-muted">No notifications yet.</p>'; return; }
    container.innerHTML = notifications.map(n => {
        const iconMap = { order: 'fa-box', promotion: 'fa-tag', wishlist: 'fa-heart', stock: 'fa-cubes', price_drop: 'fa-arrow-down', review: 'fa-star', system: 'fa-cog', contact: 'fa-envelope' };
        const icon = iconMap[n.type] || 'fa-bell';
        return `<div class="acc-notif-item ${n.read ? '' : 'unread'}">
            <div class="acc-notif-icon"><i class="fas ${icon}"></i></div>
            <div class="acc-notif-body">
                ${n.title ? `<div class="acc-notif-title">${escHtml(n.title)}</div>` : ''}
                <div class="acc-notif-message">${escHtml(n.message)}</div>
                <div class="acc-notif-time">${n.createdAt ? new Date(n.createdAt).toLocaleString() : ''}</div>
            </div>
            <div class="acc-notif-actions">
                ${!n.read ? `<button onclick="markNotifRead('${n._id}')" title="Mark read"><i class="fas fa-check"></i></button>` : ''}
                <button class="danger" onclick="deleteNotif('${n._id}')" title="Delete"><i class="fas fa-trash-alt"></i></button>
            </div>
        </div>`;
    }).join('');
}

function renderNotifPrefs(prefs) {
    const container = $('anPrefs');
    if (!container || !prefs) return;
    const items = [
        { key: 'orderUpdates', label: 'Order updates & delivery status' },
        { key: 'promotions', label: 'Promotions & offers' },
        { key: 'wishlistStock', label: 'Wishlist stock alerts' },
        { key: 'priceDrops', label: 'Price drop notifications' },
        { key: 'newsletter', label: 'Newsletter' }
    ];
    container.innerHTML = items.map(i => `
        <label><input type="checkbox" ${prefs[i.key] ? 'checked' : ''} data-key="${i.key}" onchange="updateNotifPref(this)" /> ${i.label}</label>
    `).join('');
}

window.markNotifRead = async function(id) {
    try {
        await authFetch(`${API_URL}/users/notifications/${id}/read`, { method: 'PUT' });
        const n = notifications.find(x => x._id === id);
        if (n) n.read = true;
        renderNotifications();
        updateNotifBadge();
    } catch(e) { /* ignore */ }
};

window.deleteNotif = async function(id) {
    try {
        await authFetch(`${API_URL}/users/notifications/${id}`, { method: 'DELETE' });
        notifications = notifications.filter(x => x._id !== id);
        renderNotifications();
        updateNotifBadge();
    } catch(e) { /* ignore */ }
};

window.updateNotifPref = async function(el) {
    const key = el.dataset.key;
    const val = el.checked;
    try {
        await authFetch(`${API_URL}/users/notification-preferences`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ [key]: val })
        });
    } catch(e) { el.checked = !val; }
};

function updateNotifBadge() {
    const unread = notifications.filter(n => !n.read).length;
    const badge = $('accNotifBadge');
    if (badge) { badge.textContent = unread; badge.style.display = unread > 0 ? 'inline' : 'none'; }
}

$('anMarkAllBtn')?.addEventListener('click', async () => {
    try {
        await authFetch(`${API_URL}/users/notifications/read-all`, { method: 'PUT' });
        notifications.forEach(n => n.read = true);
        renderNotifications();
        updateNotifBadge();
        showToast('All marked as read', 'success');
    } catch(e) { showToast('Could not update', 'error'); }
});

// ---- Profile Form ----
$('accProfileForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('apMsg');
    msg.style.display = 'none';
    const body = {
        name: $('apName').value.trim(),
        email: $('apEmail').value.trim(),
        phone: $('apPhone').value.trim(),
        dateOfBirth: $('apDob').value || null,
        gender: $('apGender').value
    };
    if (!body.name || !body.email) { msg.className = 'acc-form-msg error'; msg.textContent = 'Name and email are required.'; msg.style.display = 'block'; return; }
    try {
        const res = await authFetch(`${API_URL}/users/profile`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Update failed'); }
        const d = await res.json();
        profileData = d.data || d;
        localStorage.setItem('user', JSON.stringify(profileData));
        renderProfile();
        msg.className = 'acc-form-msg success'; msg.textContent = 'Profile updated successfully!'; msg.style.display = 'block';
        showToast('Profile updated', 'success');
        setTimeout(() => msg.style.display = 'none', 3000);
    } catch (err) { msg.className = 'acc-form-msg error'; msg.textContent = err.message; msg.style.display = 'block'; }
});

$('apCancelBtn')?.addEventListener('click', () => renderProfile());

// ---- Photo Upload ----
$('accPhotoUploadBtn')?.addEventListener('click', () => $('accPhotoInput')?.click());
$('accPhotoInput')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    // Upload to Cloudinary or save as data URL
    const reader = new FileReader();
    reader.onload = async (ev) => {
        const dataUrl = ev.target.result;
        try {
            const res = await authFetch(`${API_URL}/users/profile`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ profilePhoto: dataUrl })
            });
            if (!res.ok) throw new Error('Failed');
            const d = await res.json();
            profileData = d.data || d;
            renderProfile();
            showToast('Photo updated', 'success');
        } catch(err) { showToast('Could not update photo', 'error'); }
    };
    reader.readAsDataURL(file);
});

// ---- Password Change ----
$('asPasswordForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('asPwdMsg');
    msg.style.display = 'none';
    const current = $('asCurrentPwd').value;
    const newPwd = $('asNewPwd').value;
    const confirm = $('asConfirmPwd').value;
    if (!current || !newPwd) { msg.className = 'acc-form-msg error'; msg.textContent = 'All fields required.'; msg.style.display = 'block'; return; }
    if (newPwd.length < 6) { msg.className = 'acc-form-msg error'; msg.textContent = 'Password must be at least 6 characters.'; msg.style.display = 'block'; return; }
    if (newPwd !== confirm) { msg.className = 'acc-form-msg error'; msg.textContent = 'Passwords do not match.'; msg.style.display = 'block'; return; }
    try {
        const res = await authFetch(`${API_URL}/users/password`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currentPassword: current, newPassword: newPwd })
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Failed'); }
        msg.className = 'acc-form-msg success'; msg.textContent = 'Password changed successfully!'; msg.style.display = 'block';
        $('asPasswordForm').reset();
        $('asPwdStrength').style.display = 'none';
        showToast('Password changed', 'success');
        setTimeout(() => msg.style.display = 'none', 3000);
    } catch(err) { msg.className = 'acc-form-msg error'; msg.textContent = err.message; msg.style.display = 'block'; }
});

// Password strength indicator
$('asNewPwd')?.addEventListener('input', function() {
    const val = this.value;
    const strength = $('asPwdStrength');
    const fill = $('asPwdFill');
    const label = $('asPwdLabel');
    if (!val) { strength.style.display = 'none'; return; }
    strength.style.display = 'flex';
    let score = 0;
    if (val.length >= 6) score += 25;
    if (val.length >= 10) score += 15;
    if (/[A-Z]/.test(val)) score += 15;
    if (/[a-z]/.test(val)) score += 15;
    if (/[0-9]/.test(val)) score += 15;
    if (/[^A-Za-z0-9]/.test(val)) score += 15;
    fill.style.width = Math.min(score, 100) + '%';
    if (score < 30) { fill.style.background = '#DC2626'; label.textContent = 'Weak'; }
    else if (score < 60) { fill.style.background = '#F59E0B'; label.textContent = 'Fair'; }
    else if (score < 80) { fill.style.background = '#059669'; label.textContent = 'Good'; }
    else { fill.style.background = '#059669'; label.textContent = 'Strong'; }
});

// ---- Delete Account ----
$('asDeleteBtn')?.addEventListener('click', () => $('asDelOverlay').style.display = 'flex');
$('asDelClose')?.addEventListener('click', () => $('asDelOverlay').style.display = 'none');
$('asDelCancel')?.addEventListener('click', () => $('asDelOverlay').style.display = 'none');
$('asDelOverlay')?.addEventListener('click', (e) => { if (e.target === e.currentTarget) e.target.style.display = 'none'; });

$('asDelForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('asDelFormMsg');
    msg.style.display = 'none';
    const password = $('asDelPassword').value;
    if (!password) { msg.className = 'acc-form-msg error'; msg.textContent = 'Password required.'; msg.style.display = 'block'; return; }
    try {
        const res = await authFetch(`${API_URL}/users/account`, {
            method: 'DELETE', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Failed'); }
        clearAuth();
        showToast('Account deleted', 'info');
        window.location.href = '/';
    } catch(err) { msg.className = 'acc-form-msg error'; msg.textContent = err.message; msg.style.display = 'block'; }
});

// ---- Recently Viewed from localStorage ----
function loadRecentlyViewed() {
    const container = $('accRecentlyViewed');
    if (!container) return;
    let viewed = [];
    try { viewed = JSON.parse(localStorage.getItem('tw_recently')) || []; } catch(e) {}
    if (!viewed.length) { container.innerHTML = '<p class="acc-text-muted">No recently viewed items.</p>'; return; }
    const recent = viewed.slice(0, 4);
    container.innerHTML = `<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;">${recent.map(p => {
        const img = (p.images && p.images[0]) ? p.images[0] : 'https://placehold.co/200x240/FAF9F6/C8A35A?text=P';
        return `<div style="text-align:center;cursor:pointer;" onclick="window.location.href='/product-details.html?id=${p._id}'">
            <img src="${img}" alt="" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px;" loading="lazy" />
            <div style="font-size:0.72rem;font-weight:500;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(p.name)}</div>
            <div style="font-size:0.72rem;color:var(--color-gold);font-weight:600;">Ksh ${(p.price || 0).toLocaleString()}</div>
        </div>`;
    }).join('')}</div>`;
}

// ---- Navigation Setup ----
function setupNavigation() {
    document.querySelectorAll('.acc-nav-item[data-section]').forEach(btn => {
        btn.addEventListener('click', () => {
            const section = btn.dataset.section;
            if (section === 'wishlist') { window.location.href = '/wishlist.html'; return; }
            showSection(section);
        });
    });

    $('accSidebarToggle')?.addEventListener('click', () => {
        $('accSidebar').classList.toggle('collapsed');
    });

    // Logout
    $('accLogoutBtn')?.addEventListener('click', () => {
        if (confirm('Log out of your account?')) {
            clearAuth();
        }
    });

    // Guest buttons
    $('accGuestLoginBtn')?.addEventListener('click', () => {
        window.location.href = '/';
    });
    $('accGuestRegisterBtn')?.addEventListener('click', () => {
        window.location.href = '/';
    });

    // Coupon tabs
    document.querySelectorAll('.acc-coupon-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.acc-coupon-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            loadCoupons(tab.dataset.couponTab);
        });
    });
}

// ---- Setup Forms ----
function setupForms() {
    loadRecentlyViewed();
}

// ============================================================
// SHOPPING CART
// ============================================================
async function loadCart() {
    try {
        const res = await authFetch(`${API_URL}/cart`);
        if (!res.ok) return;
        const d = await res.json();
        cartItems = d.items || d.data?.items || [];
        renderCart();
    } catch(e) { /* ignore */ }
}

function renderCart() {
    const container = $('acList');
    if (!container) return;
    if (!cartItems.length) {
        container.innerHTML = '<p class="acc-text-muted">Your cart is empty. <a href="/" style="color:var(--color-gold);">Continue shopping</a></p>';
        return;
    }
    container.innerHTML = cartItems.map(item => {
        const p = item.productId;
        if (!p) return '';
        const img = (p.images && p.images[0]) ? p.images[0] : 'https://placehold.co/200x240/FAF9F6/C8A35A?text=P';
        const price = p.price || 0;
        const originalPrice = p.originalPrice || price;
        const discount = originalPrice > price ? Math.round((1 - price/originalPrice) * 100) : 0;
        return `<div class="acc-cart-item" style="display:flex;gap:16px;padding:16px;background:#fff;border:1px solid var(--border-light);border-radius:12px;margin-bottom:12px;align-items:center;">
            <img src="${img}" alt="${escHtml(p.name)}" style="width:80px;height:100px;object-fit:cover;border-radius:8px;" loading="lazy" />
            <div style="flex:1;">
                <div style="font-weight:600;font-size:0.9rem;">${escHtml(p.name)}</div>
                <div style="font-size:0.8rem;color:var(--text-secondary);margin-top:4px;">Color: ${escHtml(item.color || 'N/A')} | Size: ${escHtml(item.size || 'N/A')}</div>
                <div style="margin-top:8px;display:flex;align-items:center;gap:12px;">
                    <span style="font-weight:700;color:var(--color-gold);">Ksh ${price.toLocaleString()}</span>
                    ${discount ? `<span style="font-size:0.75rem;background:var(--error);color:#fff;padding:2px 6px;border-radius:4px;">${discount}% OFF</span>` : ''}
                    ${originalPrice > price ? `<span style="font-size:0.8rem;color:var(--text-muted);text-decoration:line-through;">Ksh ${originalPrice.toLocaleString()}</span>` : ''}
                </div>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end;">
                <div style="display:flex;align-items:center;gap:8px;">
                    <button onclick="updateCartQty('${item._id}', ${item.quantity - 1})" style="width:32px;height:32px;border:1px solid var(--border-light);border-radius:4px;background:#fff;cursor:pointer;"><i class="fas fa-minus"></i></button>
                    <span style="min-width:30px;text-align:center;font-weight:600;">${item.quantity}</span>
                    <button onclick="updateCartQty('${item._id}', ${item.quantity + 1})" style="width:32px;height:32px;border:1px solid var(--border-light);border-radius:4px;background:#fff;cursor:pointer;"><i class="fas fa-plus"></i></button>
                </div>
                <div style="display:flex;flex-direction:column;gap:4px;">
                    <button onclick="moveToWishlist('${item._id}')" style="padding:6px 12px;border:1px solid var(--border-light);border-radius:4px;background:#fff;font-size:0.75rem;cursor:pointer;"><i class="far fa-heart"></i> Save for Later</button>
                    <button onclick="removeFromCart('${item._id}')" style="padding:6px 12px;border:1px solid var(--error);border-radius:4px;background:#fff;color:var(--error);font-size:0.75rem;cursor:pointer;"><i class="fas fa-trash-alt"></i> Remove</button>
                </div>
            </div>
        </div>`;
    }).join('');
}

window.updateCartQty = async function(itemId, qty) {
    if (qty < 1) { if (!confirm('Remove this item?')) return; await removeFromCart(itemId); return; }
    try {
        const res = await authFetch(`${API_URL}/cart/${itemId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quantity: qty }) });
        if (!res.ok) throw new Error('Failed');
        showToast('Cart updated', 'success');
        await loadCart();
    } catch(e) { showToast('Could not update quantity', 'error'); }
};

window.removeFromCart = async function(itemId) {
    try {
        await authFetch(`${API_URL}/cart/${itemId}`, { method: 'DELETE' });
        showToast('Item removed', 'info');
        await loadCart();
    } catch(e) { showToast('Could not remove item', 'error'); }
};

window.moveToWishlist = async function(itemId) {
    try {
        const item = cartItems.find(i => i._id === itemId);
        if (!item) return;
        await authFetch(`${API_URL}/wishlist`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId: item.productId }) });
        await removeFromCart(itemId);
        showToast('Moved to wishlist', 'success');
    } catch(e) { showToast('Could not move to wishlist', 'error'); }
};

// ============================================================
// PAYMENT METHODS
// ============================================================
async function loadPaymentMethods() {
    try {
        const res = await authFetch(`${API_URL}/users/payment-methods`);
        if (!res.ok) return;
        const d = await res.json();
        paymentMethods = d.data || d || [];
        renderPaymentMethods();
    } catch(e) { /* ignore */ }
}

function renderPaymentMethods() {
    const container = $('apmList');
    if (!container) return;
    if (!paymentMethods.length) {
        container.innerHTML = '<p class="acc-text-muted">No payment methods saved yet.</p>';
        return;
    }
    const typeIcons = { mpesa: 'fa-mobile-alt', visa: 'fa-cc-visa', mastercard: 'fa-cc-mastercard', paypal: 'fa-cc-paypal', bank_transfer: 'fa-university' };
    container.innerHTML = paymentMethods.map(pm => `
        <div class="acc-payment-card ${pm.isDefault ? 'default' : ''}" style="display:flex;align-items:center;gap:16px;padding:16px;background:#fff;border:1px solid var(--border-light);border-radius:12px;margin-bottom:12px;${pm.isDefault ? 'border-color:var(--color-gold);' : ''}">
            <div class="acc-payment-icon" style="width:50px;height:50px;border-radius:10px;background:var(--bg-primary);border:1px solid var(--border-light);display:flex;align-items:center;justify-content:center;color:var(--color-gold);font-size:1.3rem;"><i class="fas ${typeIcons[pm.type] || 'fa-credit-card'}"></i></div>
            <div style="flex:1;">
                <div style="font-weight:600;text-transform:capitalize;">${pm.type.replace('_', ' ')}</div>
                <div style="font-size:0.85rem;color:var(--text-secondary);">${escHtml(pm.nickname || pm.details)}</div>
                ${pm.isDefault ? '<span style="font-size:0.7rem;background:var(--color-gold);color:#000;padding:2px 8px;border-radius:4px;margin-top:4px;display:inline-block;">Default</span>' : ''}
            </div>
            <div style="display:flex;gap:8px;">
                ${!pm.isDefault ? `<button onclick="setDefaultPayment('${pm._id}')" style="padding:6px 12px;border:1px solid var(--border-light);border-radius:4px;background:#fff;font-size:0.75rem;cursor:pointer;">Set Default</button>` : ''}
                <button onclick="deletePayment('${pm._id}')" style="padding:6px 12px;border:1px solid var(--error);border-radius:4px;background:#fff;color:var(--error);font-size:0.75rem;cursor:pointer;">Remove</button>
            </div>
        </div>
    `).join('');
}

$('apmAddBtn')?.addEventListener('click', () => { $('apmFormTitle').textContent = 'Add Payment Method'; $('apmId').value = ''; $('apmForm').reset(); $('apmOverlay').style.display = 'flex'; });
$('apmClose')?.addEventListener('click', () => $('apmOverlay').style.display = 'none');
$('apmCancel')?.addEventListener('click', () => $('apmOverlay').style.display = 'none');
$('apmOverlay')?.addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.style.display = 'none'; });

$('apmForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = $('apmId').value;
    const body = {
        type: $('apmType').value,
        nickname: $('apmNickname').value.trim(),
        details: $('apmDetails').value.trim(),
        isDefault: $('apmDefault').checked
    };
    if (!body.type || !body.details) { showToast('Type and details are required', 'error'); return; }
    try {
        const res = id
            ? await authFetch(`${API_URL}/users/payment-methods/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
            : await authFetch(`${API_URL}/users/payment-methods`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Failed'); }
        $('apmOverlay').style.display = 'none';
        showToast(id ? 'Payment method updated' : 'Payment method added', 'success');
        await loadPaymentMethods();
    } catch (err) { showToast(err.message, 'error'); }
});

window.setDefaultPayment = async function(id) {
    try {
        await authFetch(`${API_URL}/users/payment-methods/${id}/default`, { method: 'PUT' });
        showToast('Default payment method updated', 'success');
        await loadPaymentMethods();
    } catch(e) { showToast('Could not update default', 'error'); }
};

window.deletePayment = async function(id) {
    if (!confirm('Remove this payment method?')) return;
    try {
        await authFetch(`${API_URL}/users/payment-methods/${id}`, { method: 'DELETE' });
        showToast('Payment method removed', 'info');
        await loadPaymentMethods();
    } catch(e) { showToast('Could not remove payment method', 'error'); }
};

// ============================================================
// LOYALTY & REWARDS
// ============================================================
async function loadLoyalty() {
    try {
        const res = await authFetch(`${API_URL}/loyalty/profile`);
        if (!res.ok) return;
        loyaltyData = await res.json();
        renderLoyalty();
    } catch(e) { console.error('Failed to load loyalty:', e); }
}

function renderLoyalty() {
    if (!loyaltyData || !loyaltyData.data) return;
    const data = loyaltyData.data;
    
    // Tier info
    $('accTierIcon').innerHTML = `<i class="fas ${data.tierIcon || 'fa-crown'}" style="font-size:2rem;"></i>`;
    $('accTierName').textContent = data.tierName || data.currentTier || 'Bronze';
    if (data.nextTier) {
        $('accTierPoints').textContent = `${data.currentPoints?.toLocaleString() || 0} / ${data.nextTier.minPoints?.toLocaleString() || 0} points to ${data.nextTier.name || 'next tier'}`;
        const pct = data.tierProgress !== undefined ? data.tierProgress : 
            (data.nextTier && data.currentPoints && data.currentPoints > 0) 
                ? Math.min(100, Math.round(((data.currentPoints - (data.currentTierObj?.minPoints || 0)) / (data.nextTier.minPoints - (data.currentTierObj?.minPoints || 0))) * 100))
                : 0;
        $('accProgressFill').style.width = Math.min(100, Math.max(0, pct)) + '%';
    } else {
        $('accTierPoints').textContent = 'Maximum tier reached!';
        $('accProgressFill').style.width = '100%';
    }
    $('accTotalPoints').textContent = (data.currentPoints || 0).toLocaleString();
    $('asLifetimePoints').textContent = (data.lifetimePoints || 0).toLocaleString();
    $('asRedeemedPoints').textContent = (data.redeemedPoints || 0).toLocaleString();
    $('asReferralRewards').textContent = (data.referralRewardsEarned || 0).toLocaleString();
    $('asCouponsEarned').textContent = (data.couponsEarned || 0).toLocaleString();

    // Points history
    const history = data.transactions || [];
    const container = $('accPointsHistory');
    if (!history.length) {
        container.innerHTML = '<p class="acc-text-muted">No points activity yet.</p>';
        return;
    }
    container.innerHTML = history.slice(0, 20).map(h => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid var(--border-light);">
            <div>
                <div style="font-weight:500;">${escHtml(h.description || 'Points activity')}</div>
                <div style="font-size:0.8rem;color:var(--text-muted);">${new Date(h.createdAt).toLocaleDateString()}</div>
            </div>
            <div style="font-weight:600;color:${h.points > 0 ? 'var(--success)' : h.points < 0 ? 'var(--error)' : 'var(--text-primary)'};">${h.points > 0 ? '+' : ''}${h.points} pts</div>
        </div>
    `).join('');

    // Available rewards
    renderAvailableRewards(data.availableRewards || []);
    
    // Referrals
    renderReferrals(data.referrals || []);
    
    // Achievements
    renderAchievements(data.achievements || []);
}

function renderAvailableRewards(rewards) {
    const container = document.getElementById('accAvailableRewards');
    if (!container) return;
    
    if (!rewards || !rewards.length) {
        container.innerHTML = '<p class="acc-text-muted">No rewards available for your tier.</p>';
        return;
    }
    
    container.innerHTML = rewards.map(r => `
        <div class="acc-reward-card" style="display:flex;gap:16px;padding:16px;background:#fff;border:1px solid var(--border-light);border-radius:12px;margin-bottom:12px;position:relative;">
            ${r.image ? `<img src="${r.image}" alt="" style="width:80px;height:80px;object-fit:cover;border-radius:8px;" loading="lazy" />` : ''}
            <div style="flex:1;">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
                    <div>
                        <div style="font-weight:600;font-size:1rem;">${escHtml(r.name)}</div>
                        <div style="font-size:0.85rem;color:var(--text-secondary);margin-top:4px;">${escHtml(r.description)}</div>
                    </div>
                    <div style="text-align:right;font-weight:700;color:var(--color-gold);font-size:1.2rem;">${r.pointsCost.toLocaleString()} pts</div>
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:8px;font-size:0.8rem;color:var(--text-secondary);margin-top:8px;">
                    <span><i class="fas fa-tag"></i> ${r.type.replace('_', ' ')}</span>
                    ${r.tierRestriction !== 'all' ? `<span><i class="fas fa-crown"></i> ${r.tierRestriction}+</span>` : ''}
                </div>
                <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end;margin-top:12px;">
                    <button onclick="redeemReward('${r._id}')" class="acc-btn-primary" style="padding:8px 16px;">
                        <i class="fas fa-gift"></i> Redeem
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

function renderReferrals(referrals) {
    const container = document.getElementById('accReferrals');
    if (!container) return;
    
    const stats = {
        total: referrals.length,
        pending: referrals.filter(r => r.status === 'pending').length,
        completed: referrals.filter(r => r.status === 'completed').length,
        earned: referrals.reduce((sum, r) => sum + (r.referrerReward || 0), 0)
    };
    
    const referralCode = loyaltyData?.data?.referralCode || 'LOADING...';
    const referralHtml = referrals.length ? `
        <div style="display:flex;flex-direction:column;gap:8px;">
            ${referrals.map(r => `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:#fff;border:1px solid var(--border-light);border-radius:8px;">
                    <div>
                        <div style="font-weight:500;">${escHtml(r.referee?.name || 'New User')}</div>
                        <div style="font-size:0.8rem;color:var(--text-muted);">${r.referee?.email || ''} &middot; ${new Date(r.createdAt).toLocaleDateString()}</div>
                    </div>
                    <div style="display:flex;align-items:center;gap:12px;">
                        <span class="acc-referral-status ${r.status}" style="padding:4px 10px;border-radius:12px;font-size:0.7rem;font-weight:600;text-transform:capitalize;${r.status === 'completed' ? 'background:var(--success);color:#fff' : r.status === 'pending' ? 'background:var(--warning);color:#fff' : 'background:var(--text-muted);color:#fff'}">${r.status}</span>
                        ${r.status === 'completed' ? `<span style="font-weight:600;color:var(--success);">+${r.referrerReward} pts</span>` : ''}
                    </div>
                </div>
            `).join('')}
        </div>
    ` : '<p class="acc-text-muted">No referrals yet. Share your code to start earning!</p>';
    
    container.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:20px;">
            <div class="acc-stat-card"><div class="acc-stat-value">${stats.total}</div><div class="acc-stat-label">Total Referrals</div></div>
            <div class="acc-stat-card"><div class="acc-stat-value">${stats.pending}</div><div class="acc-stat-label">Pending</div></div>
            <div class="acc-stat-card"><div class="acc-stat-value">${stats.completed}</div><div class="acc-stat-label">Completed</div></div>
            <div class="acc-stat-card"><div class="acc-stat-value">${stats.earned.toLocaleString()}</div><div class="acc-stat-label">Points Earned</div></div>
        </div>
        <div style="margin-bottom:16px;padding:16px;background:var(--bg-primary);border-radius:8px;border:1px solid var(--border-light);">
            <div style="font-weight:600;margin-bottom:8px;">Your Referral Code</div>
            <div style="display:flex;gap:8px;align-items:center;">
                <code style="flex:1;padding:12px;background:#fff;border:1px solid var(--border-light);border-radius:6px;font-size:1.1rem;text-align:center;">${referralCode}</code>
                <button onclick="copyReferralCode()" class="acc-btn-secondary" style="padding:8px 16px;"><i class="fas fa-copy"></i> Copy</button>
                <button onclick="shareReferral()" class="acc-btn-primary" style="padding:8px 16px;"><i class="fas fa-share-alt"></i> Share</button>
            </div>
            <p style="font-size:0.8rem;color:var(--text-secondary);margin-top:8px;">Share your code. Friends get a welcome bonus, you earn points when they make their first purchase!</p>
        </div>
        <h3 style="margin-bottom:12px;">Referral History</h3>
        ${referralHtml}
    `;
}

function renderAchievements(achievements) {
    const container = document.getElementById('accAchievements');
    if (!container) return;
    
    if (!achievements || !achievements.length) {
        container.innerHTML = '<p class="acc-text-muted">No achievements yet. Complete actions to unlock badges!</p>';
        return;
    }
    
    container.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:16px;">
            ${achievements.map(a => `
                <div class="acc-achievement-card ${a.earned ? 'earned' : 'locked'}" style="text-align:center;padding:16px;background:#fff;border:1px solid ${a.earned ? 'var(--color-gold)' : 'var(--border-light)'};border-radius:12px;transition:0.3s;" ${a.earned ? `title="${a.name} - Unlocked ${a.unlockedAt ? new Date(a.unlockedAt).toLocaleDateString() : ''}"` : `title="${a.name} - ${a.description}"`}>
                    <div style="font-size:2.5rem;margin-bottom:8px;color:${a.earned ? 'var(--color-gold)' : 'var(--text-muted)'};">
                        <i class="fas ${a.icon || 'fa-trophy'}"></i>
                    </div>
                    <div style="font-weight:600;font-size:0.8rem;margin-bottom:4px;">${escHtml(a.name)}</div>
                    <div style="font-size:0.7rem;color:var(--text-muted);">${escHtml(a.description)}</div>
                    ${a.earned && a.pointsReward ? `<div style="font-size:0.7rem;color:var(--success);margin-top:4px;">+${a.pointsReward} pts</div>` : ''}
                </div>
            `).join('')}
        </div>
    `;
}

async function redeemReward(rewardId) {
    try {
        const res = await authFetch(`${API_URL}/loyalty/redeem`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rewardId })
        });
        if (!res.ok) {
            const d = await res.json();
            throw new Error(d.message || 'Failed to redeem');
        }
        const data = await res.json();
        showToast(data.message || 'Reward redeemed successfully!', 'success');
        
        // Show coupon code if applicable
        if (data.data?.couponCode) {
            alert(`Your coupon code: ${data.data.couponCode}\n\nIt has been saved to your coupons.`);
        }
        
        await loadLoyalty();
    } catch(err) {
        showToast(err.message, 'error');
    }
}

function copyReferralCode() {
    const code = loyaltyData?.data?.referralCode;
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => showToast('Referral code copied!', 'success'));
}

function shareReferral() {
    const code = loyaltyData?.data?.referralCode;
    const url = `${window.location.origin}/?ref=${code}`;
    if (navigator.share) {
        navigator.share({
            title: 'Join Trendy Wardrobe!',
            text: 'Get exclusive rewards and points when you join Trendy Wardrobe using my referral link.',
            url: url
        });
    } else {
        navigator.clipboard.writeText(url).then(() => showToast('Referral link copied!', 'success'));
    }
}

function updateLoyaltyUI() {
    // Update loyalty stats in dashboard if on dashboard
    if (loyaltyData?.data) {
        $('asRewardPoints').textContent = (loyaltyData.data.currentPoints || 0).toLocaleString();
    }
}

// ============================================================
// COUPONS & VOUCHERS
// ============================================================
async function loadCoupons(tab = 'available') {
    try {
        const res = await authFetch(`${API_URL}/users/coupons?status=${tab}`);
        if (!res.ok) return;
        coupons = await res.json();
        renderCoupons(tab);
    } catch(e) { /* ignore */ }
}

function renderCoupons(tab) {
    const container = $('acList');
    if (!container) return;
    const filtered = coupons.filter(c => {
        const now = new Date();
        const expiry = c.expiryDate ? new Date(c.expiryDate) : null;
        const isExpired = expiry && expiry < now;
        const isUsed = c.isUsed || false;
        if (tab === 'available') return !isExpired && !isUsed;
        if (tab === 'used') return isUsed;
        if (tab === 'expired') return isExpired && !isUsed;
        return true;
    });

    if (!filtered.length) {
        const messages = { available: 'No available coupons.', used: 'No used coupons.', expired: 'No expired coupons.' };
        container.innerHTML = `<p class="acc-text-muted">${messages[tab]}</p>`;
        return;
    }

    container.innerHTML = filtered.map(c => {
        const expiry = c.expiryDate ? new Date(c.expiryDate) : null;
        const isExpired = expiry && expiry < new Date();
        const isUsed = c.isUsed || false;
        return `
        <div class="acc-coupon-card ${isUsed ? 'used' : ''} ${isExpired ? 'expired' : ''}" style="display:flex;gap:16px;padding:20px;background:${isUsed || isExpired ? 'var(--bg-secondary)' : '#fff'};border:1px solid ${isUsed || isExpired ? 'var(--border-light)' : 'var(--color-gold)'};border-radius:12px;margin-bottom:16px;position:relative;overflow:hidden;">
            <div style="flex:1;">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
                    <div>
                        <div style="font-size:1.5rem;font-weight:700;color:var(--color-gold);font-family:'Bebas Neue',sans-serif;letter-spacing:2px;">${escHtml(c.code)}</div>
                        <div style="font-size:0.85rem;color:var(--text-secondary);margin-top:4px;">${escHtml(c.description || c.name)}</div>
                    </div>
                    <div style="text-align:right;">
                        ${isUsed ? '<span style="background:var(--text-muted);color:#fff;padding:4px 10px;border-radius:4px;font-size:0.7rem;">USED</span>' : ''}
                        ${isExpired && !isUsed ? '<span style="background:var(--error);color:#fff;padding:4px 10px;border-radius:4px;font-size:0.7rem;">EXPIRED</span>' : ''}
                        ${!isUsed && !isExpired ? '<span style="background:var(--success);color:#fff;padding:4px 10px;border-radius:4px;font-size:0.7rem;">ACTIVE</span>' : ''}
                    </div>
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:16px;font-size:0.85rem;color:var(--text-secondary);">
                    <span><i class="fas fa-percentage"></i> ${c.discountType === 'percentage' ? c.discountValue + '%' : 'Ksh ' + c.discountValue} off</span>
                    ${c.minOrder ? `<span><i class="fas fa-shopping-cart"></i> Min order: Ksh ${c.minOrder.toLocaleString()}</span>` : ''}
                    ${expiry ? `<span><i class="fas fa-calendar"></i> Expires: ${expiry.toLocaleDateString()}</span>` : '<span><i class="fas fa-infinity"></i> No expiry</span>'}
                    ${c.usageLimit ? `<span><i class="fas fa-sync"></i> ${c.usedCount || 0}/${c.usageLimit} uses</span>` : ''}
                </div>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end;">
                ${!isUsed && !isExpired ? `<button onclick="applyCoupon('${c.code}')" class="acc-btn-primary" style="padding:8px 16px;"><i class="fas fa-tag"></i> Apply</button>` : ''}
                <button onclick="copyCoupon('${c.code}')" style="padding:8px 16px;border:1px solid var(--border-light);border-radius:4px;background:#fff;font-size:0.8rem;cursor:pointer;"><i class="fas fa-copy"></i> Copy</button>
            </div>
        </div>`;
    }).join('');
}

window.applyCoupon = function(code) {
    // Store coupon for checkout
    localStorage.setItem('tw_applied_coupon', code);
    showToast(`Coupon ${code} applied! It will be used at checkout.`, 'success');
};

window.copyCoupon = function(code) {
    navigator.clipboard.writeText(code).then(() => showToast('Copied!', 'success'));
};

// ============================================================
// SETTINGS
// ============================================================
async function loadSettings() {
    try {
        // Load display preferences from localStorage
        const stored = localStorage.getItem('tw_display_prefs');
        if (stored) displayPrefs = { ...displayPrefs, ...JSON.parse(stored) };
        $('settingTheme').value = displayPrefs.theme || 'system';
        $('settingCurrency').value = displayPrefs.currency || 'KES';
        $('settingLanguage').value = displayPrefs.language || 'en';

        // Load privacy prefs
        const privacyStored = localStorage.getItem('tw_privacy_prefs');
        if (privacyStored) privacyPrefs = { ...privacyPrefs, ...JSON.parse(privacyStored) };
        $('privacyAnalytics').checked = privacyPrefs.analytics;
        $('privacyMarketing').checked = privacyPrefs.marketing;
        $('privacyPersonalization').checked = privacyPrefs.personalization;

        // Load notification prefs from server
        const prefRes = await authFetch(`${API_URL}/users/notification-preferences`);
        if (prefRes.ok) {
            const pd = await prefRes.json();
            renderNotifPrefs(pd.data || pd);
        }

        // Load login history
        const histRes = await authFetch(`${API_URL}/users/login-history`);
        if (histRes.ok) {
            loginHistory = (await histRes.json()).data || [];
            renderLoginHistory();
        }

        // Load active devices
        const devRes = await authFetch(`${API_URL}/users/active-devices`);
        if (devRes.ok) {
            activeDevices = (await devRes.json()).data || [];
            renderActiveDevices();
        }

        // Load 2FA status
        const twofaRes = await authFetch(`${API_URL}/users/2fa-status`);
        if (twofaRes.ok) {
            const tf = await twofaRes.json();
            update2FAUI(tf.data || tf);
        }
    } catch(e) { /* ignore */ }
}

function renderLoginHistory() {
    const container = $('accLoginHistory');
    if (!container) return;
    if (!loginHistory.length) {
        container.innerHTML = '<p class="acc-text-muted">No login history available.</p>';
        return;
    }
    container.innerHTML = loginHistory.slice(0, 20).map(h => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border-light);">
            <div>
                <div style="font-weight:500;">${h.ip || 'Unknown IP'}</div>
                <div style="font-size:0.8rem;color:var(--text-secondary);">${h.location || 'Unknown location'} · ${h.device || 'Unknown device'}</div>
            </div>
            <div style="font-size:0.8rem;color:var(--text-muted);">${new Date(h.createdAt).toLocaleString()}</div>
        </div>
    `).join('');
}

function renderActiveDevices() {
    const container = $('accActiveDevices');
    if (!container) return;
    if (!activeDevices.length) {
        container.innerHTML = '<p class="acc-text-muted">No active devices.</p>';
        return;
    }
    container.innerHTML = activeDevices.map(d => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid var(--border-light);">
            <div>
                <div style="font-weight:500;">${d.deviceName || d.browser || 'Unknown Device'}</div>
                <div style="font-size:0.8rem;color:var(--text-secondary);">${d.os || ''} · ${d.browser || ''} · ${d.ip || ''}</div>
                ${d.current ? '<span style="font-size:0.7rem;background:var(--color-gold);color:#000;padding:2px 6px;border-radius:4px;margin-left:8px;">Current</span>' : ''}
            </div>
            <div style="font-size:0.8rem;color:var(--text-muted);">${new Date(d.lastActive).toLocaleString()}</div>
        </div>
    `).join('');
}

function update2FAUI(data) {
    const enabled = data.enabled || false;
    const method = data.method || 'none';
    $('acc2faEnabled').checked = enabled;
    $('acc2faMethod').textContent = enabled ? method.toUpperCase() : 'Not configured';
    $('accSetup2faBtn').style.display = enabled ? 'none' : 'inline-flex';
    $('accDisable2faBtn').style.display = enabled ? 'inline-flex' : 'none';
}

$('accSetup2faBtn')?.addEventListener('click', async () => {
    const method = prompt('Choose 2FA method: "totp" (Authenticator app) or "sms":');
    if (!method) return;
    try {
        const res = await authFetch(`${API_URL}/users/2fa/setup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method }) });
        if (!res.ok) throw new Error('Failed');
        const d = await res.json();
        if (d.qrCode) {
            // Show QR code modal
            showQRModal(d.qrCode, d.secret);
        } else if (d.codeSent) {
            showToast('Verification code sent via SMS', 'success');
            verify2FACode();
        }
    } catch(e) { showToast(e.message, 'error'); }
});

function showQRModal(qrCode, secret) {
    const modal = document.createElement('div');
    modal.className = 'acc-overlay';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="acc-modal" style="max-width:400px;text-align:center;">
            <button class="acc-modal-close" onclick="this.closest('.acc-overlay').remove()"><i class="fas fa-times"></i></button>
            <h3>Set Up Authenticator App</h3>
            <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:16px;">Scan this QR code with Google Authenticator, Authy, or similar app.</p>
            <img src="${qrCode}" alt="QR Code" style="max-width:200px;margin:0 auto 16px;" />
            <p style="font-size:0.75rem;color:var(--text-muted);font-family:monospace;background:var(--bg-primary);padding:8px;border-radius:4px;">${secret}</p>
            <button class="acc-btn-primary" onclick="verify2FACode()"><i class="fas fa-check"></i> Verify & Enable</button>
        </div>`;
    document.body.appendChild(modal);
}

window.verify2FACode = async function() {
    const code = prompt('Enter the 6-digit code from your authenticator app:');
    if (!code) return;
    try {
        const res = await authFetch(`${API_URL}/users/2fa/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
        if (!res.ok) throw new Error('Invalid code');
        showToast('2FA enabled successfully!', 'success');
        document.querySelector('.acc-overlay')?.remove();
        await loadSettings();
    } catch(e) { showToast(e.message, 'error'); }
};

$('accDisable2faBtn')?.addEventListener('click', async () => {
    if (!confirm('Disable 2FA? This reduces your account security.')) return;
    try {
        const res = await authFetch(`${API_URL}/users/2fa/disable`, { method: 'POST' });
        if (!res.ok) throw new Error('Failed');
        showToast('2FA disabled', 'info');
        await loadSettings();
    } catch(e) { showToast(e.message, 'error'); }
});

$('#saveDisplayPrefs')?.addEventListener('click', () => {
    displayPrefs = {
        theme: $('settingTheme').value,
        currency: $('settingCurrency').value,
        language: $('settingLanguage').value
    };
    localStorage.setItem('tw_display_prefs', JSON.stringify(displayPrefs));
    showToast('Display preferences saved', 'success');
});

$('#downloadDataBtn')?.addEventListener('click', async () => {
    showToast('Preparing your data...', 'info');
    try {
        const res = await authFetch(`${API_URL}/users/export-data`);
        if (!res.ok) throw new Error('Failed');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tw-data-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Data downloaded', 'success');
    } catch(e) { showToast('Could not download data', 'error'); }
});

$('#deleteAllDataBtn')?.addEventListener('click', async () => {
    if (!confirm('This will permanently delete ALL your data. This cannot be undone. Type "DELETE" to confirm:')) return;
    const confirmText = prompt('Type DELETE to confirm:');
    if (confirmText !== 'DELETE') { showToast('Confirmation failed', 'error'); return; }
    try {
        const res = await authFetch(`${API_URL}/users/account`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: '', confirmDelete: true }) });
        if (!res.ok) throw new Error('Failed');
        clearAuth();
        showToast('Account and all data deleted', 'info');
        window.location.href = '/';
    } catch(e) { showToast(e.message, 'error'); }
});

// Privacy checkboxes
['privacyAnalytics', 'privacyMarketing', 'privacyPersonalization'].forEach(id => {
    $(id)?.addEventListener('change', (e) => {
        privacyPrefs[id.replace('privacy', '').toLowerCase()] = e.target.checked;
        localStorage.setItem('tw_privacy_prefs', JSON.stringify(privacyPrefs));
    });
});

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', init);
