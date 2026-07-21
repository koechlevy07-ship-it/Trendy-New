// ============================================================
// ORDER CONFIRMATION PAGE — Trendy Wardrobe
// ============================================================

const API_URL = 'https://trendy-backend-jq27.onrender.com/api';

function $(id) { return document.getElementById(id); }

function escHtml(str) {
    if (str == null) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

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

function getToken() { return localStorage.getItem('token'); }
function getUser() { const u = localStorage.getItem('user'); return u ? JSON.parse(u) : null; }
function isLoggedIn() { return !!getToken(); }

function authFetch(url, opts = {}) {
    const token = getToken();
    if (!token) return Promise.reject(new Error('Not logged in'));
    const headers = { ...(opts.headers || {}), 'Authorization': `Bearer ${token}` };
    return fetch(url, { ...opts, headers }).then(res => {
        if (res.status === 401 || res.status === 403) throw new Error('Session expired');
        return res;
    });
}

function showToast(msg, type) {
    const toast = $('toast');
    const msgEl = $('toastMessage');
    if (!toast || !msgEl) return;
    msgEl.textContent = msg;
    toast.className = 'toast';
    if (type) toast.classList.add(type);
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), 4000);
}
$('toastClose')?.addEventListener('click', () => $('toast')?.classList.remove('show'));

// ============================================================
// LOAD ORDER
// ============================================================

async function loadOrder() {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('id');
    const orderNumber = params.get('number');

    if (!orderId && !orderNumber) {
        showError('No order reference provided.');
        return;
    }

    if (!isLoggedIn()) {
        showError('Please sign in to view your order.');
        return;
    }

    try {
        let order;

        if (orderId) {
            const res = await authFetch(`${API_URL}/orders/${orderId}`);
            if (!res.ok) throw new Error('Order not found');
            const data = await res.json();
            order = data.data || data;
        } else if (orderNumber) {
            const res = await authFetch(`${API_URL}/orders/number/${encodeURIComponent(orderNumber)}`);
            if (!res.ok) throw new Error('Order not found');
            const data = await res.json();
            order = data.data || data;
        }

        if (!order) throw new Error('Order not found');

        renderOrder(order);

    } catch (err) {
        showError(err.message || 'Could not load order details.');
    }
}

function showError(msg) {
    $('confLoading').style.display = 'none';
    $('confErrorMessage').textContent = msg;
    $('confError').style.display = 'flex';
}

function renderOrder(order) {
    $('confLoading').style.display = 'none';
    $('confContent').style.display = 'block';

    // Order ID
    $('confOrderNumber').textContent = `#${order.orderNumber || order._id.toString().slice(-8).toUpperCase()}`;

    // Date
    const created = order.createdAt ? new Date(order.createdAt) : new Date();
    $('confOrderDate').textContent = created.toLocaleDateString('en-KE', {
        year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    // Status
    const status = order.status || 'pending';
    const statusBadge = $('confStatusDetail').querySelector('.conf-status-badge');
    statusBadge.className = `conf-status-badge ${status}`;
    statusBadge.textContent = status.replace(/-/g, ' ');

    const statusMsg = {
        'pending': 'Your order has been placed and is awaiting confirmation.',
        'confirmed': 'Your order has been confirmed and is being prepared.',
        'processing': 'Your order is being processed.',
        'packed': 'Your order has been packed and ready for shipping.',
        'shipped': 'Your order has been shipped.',
        'out-for-delivery': 'Your order is out for delivery.',
        'delivered': 'Your order has been delivered.',
        'cancelled': 'This order has been cancelled.',
        'refunded': 'This order has been refunded.'
    };
    const detailSpan = $('confStatusDetail').querySelector('span:last-child');
    if (detailSpan) detailSpan.textContent = statusMsg[status] || '';

    // Status timeline bar
    const steps = ['placed', 'confirmed', 'processing', 'shipped', 'delivered'];
    const statusMap = {
        'pending': 0, 'confirmed': 1, 'processing': 2, 'packed': 2,
        'shipped': 3, 'out-for-delivery': 3, 'delivered': 4,
        'cancelled': -1, 'refunded': -1
    };
    const currentStep = statusMap[status] !== undefined ? statusMap[status] : 0;

    document.querySelectorAll('.conf-status-step').forEach((el, idx) => {
        el.classList.toggle('active', idx === currentStep);
        el.classList.toggle('completed', idx < currentStep);
    });
    document.querySelectorAll('.conf-status-line').forEach((el, idx) => {
        el.classList.toggle('active', idx < currentStep);
        el.classList.toggle('completed', idx < currentStep);
    });

    // Items
    const items = order.items || [];
    $('confItems').innerHTML = items.map(item => {
        const img = item.image ? getImageUrl(item.image, 200) : 'https://placehold.co/60x75/FAF9F6/C8A35A?text=P';
        const meta = [item.size, item.color].filter(Boolean).join(' / ');
        return `
            <div class="conf-item">
                <img src="${img}" alt="${escHtml(item.name)}" loading="lazy" />
                <div class="conf-item-info">
                    <div class="conf-item-name">${escHtml(item.name)}</div>
                    ${meta ? `<div class="conf-item-meta">${escHtml(meta)}</div>` : ''}
                    <div class="conf-item-qty">Qty: ${item.quantity || 1}</div>
                </div>
                <div class="conf-item-price">Ksh ${((item.price||0)*(item.quantity||1)).toLocaleString()}</div>
            </div>`;
    }).join('');

    // Address
    const addr = order.shippingAddress || {};
    const addrHtml = `
        <strong>${escHtml(addr.fullName || '')}</strong><br />
        ${addr.phone ? escHtml(addr.phone) + '<br />' : ''}
        ${addr.street ? escHtml(addr.street) + (addr.apartment ? ', ' + escHtml(addr.apartment) : '') + '<br />' : ''}
        ${addr.city ? escHtml(addr.city) : ''}${addr.county ? ', ' + escHtml(addr.county) : ''}
        ${addr.postalCode ? ' ' + escHtml(addr.postalCode) : ''}<br />
        ${addr.deliveryInstructions ? '<em>Note: ' + escHtml(addr.deliveryInstructions) + '</em>' : ''}
    `;
    $('confAddress').innerHTML = addrHtml;

    // Delivery
    const del = order.deliveryMethod || {};
    $('confDelivery').innerHTML = `
        <strong>${escHtml(del.label || 'Standard Delivery')}</strong><br />
        ${del.estimatedDays ? escHtml(del.estimatedDays) + '<br />' : ''}
        ${del.provider ? escHtml(del.provider) + '<br />' : ''}
        Fee: ${del.fee > 0 ? 'Ksh ' + del.fee.toLocaleString() : 'Free'}
    `;

    // Payment
    const paymentLabels = {
        'cash-on-delivery': 'Cash on Delivery', 'm-pesa': 'M-Pesa',
        'card-payment': 'Card Payment', 'paypal': 'PayPal', 'stripe': 'Stripe',
        'bank-transfer': 'Bank Transfer'
    };
    $('confPayment').innerHTML = `<strong>${paymentLabels[order.paymentMethod] || order.paymentMethod || 'Cash on Delivery'}</strong>`;

    // Timeline
    const timeline = order.timeline || [];
    if (timeline.length > 0) {
        $('confTimeline').innerHTML = timeline.map(ev => `
            <div class="conf-timeline-item">
                <div class="conf-timeline-status">${escHtml(ev.status || '')}</div>
                ${ev.note ? `<div class="conf-timeline-note">${escHtml(ev.note)}</div>` : ''}
                <div class="conf-timeline-date">${ev.timestamp ? new Date(ev.timestamp).toLocaleString() : ''}</div>
            </div>
        `).join('');
    } else {
        $('confTimeline').innerHTML = '<div style="color:var(--text-secondary);font-size:0.85rem;">No timeline events.</div>';
    }

    // Sidebar summary
    const subtotal = order.subtotal || 0;
    const delivery = order.deliveryFee || 0;
    const discount = order.couponDiscount || order.discount || 0;
    const total = order.total || 0;

    $('confSummarySubtotal').textContent = `Ksh ${subtotal.toLocaleString()}`;
    $('confSummaryDelivery').textContent = delivery > 0 ? `Ksh ${delivery.toLocaleString()}` : 'Free';

    const discRow = $('confSummaryDiscountRow');
    if (discount > 0) {
        discRow.style.display = 'flex';
        $('confSummaryDiscount').textContent = `- Ksh ${discount.toLocaleString()}`;
    } else {
        discRow.style.display = 'none';
    }

    $('confSummaryTotal').textContent = `Ksh ${total.toLocaleString()}`;

    // Payment status
    const payStatus = $('confPaymentStatus')?.querySelector('.conf-status-badge');
    if (payStatus) {
        const ps = order.paymentDetails?.paymentStatus || 'pending';
        payStatus.className = `conf-status-badge ${ps}`;
        payStatus.textContent = ps;
    }
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', loadOrder);
