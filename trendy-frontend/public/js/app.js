        // ============================================================
        // CONFIGURATION
        // ============================================================
        const API_URL = 'https://trendy-backend-jq27.onrender.com/api';
        const IMAGE_BASE = API_URL.replace('/api', '');

        // SECURITY: XSS prevention — escape HTML entities
        function escHtml(str) {
            if (str == null) return '';
            return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
        }

        // Centralized API error handler
        async function handleApiError(res) {
            let msg = 'Something went wrong. Please try again.';
            try {
                const data = await res.json();
                msg = data.message || msg;
            } catch(e) { /* non-JSON response */ }
            if (res.status === 401 || res.status === 403) { msg = 'Session expired. Please log in again.'; clearAuth(); }
            else if (res.status === 429) { msg = 'Too many requests. Please wait a moment.'; }
            else if (res.status === 404) { msg = 'Resource not found.'; }
            else if (res.status >= 500) { msg = 'Server error. Please try again later.'; }
            return msg;
        }

        function getImageUrl(path, width) {
            if (!path) return '';
            let url = path.startsWith('http://') || path.startsWith('https://') ? path : IMAGE_BASE + path;
            if (url.includes('res.cloudinary.com') && !url.includes('/upload/')) return url;
            if (url.includes('res.cloudinary.com')) {
                const parts = url.split('/upload/');
                if (parts.length === 2) {
                    const w = width || 800;
                    url = parts[0] + '/upload/f_auto,q_80,w_' + w + '/' + parts[1];
                }
            }
            return url;
        }

        function getOptimizedImage(url, size) {
            const sizes = { thumb: 240, card: 600, hero: 1400, full: 1800 };
            return getImageUrl(url, sizes[size] || 800);
        }

        // ============================================================
        // DOM REFS
        // ============================================================
        const productsGrid = document.getElementById('productsGrid');
        const cartBadge = document.getElementById('cartBadge');
        const toast = document.getElementById('toast');
        const toastMessage = document.getElementById('toastMessage');
        const toastClose = document.getElementById('toastClose');
        const searchInput = document.getElementById('searchInput');
        const searchBtn = document.getElementById('searchBtn');
        const stickyHeader = document.getElementById('stickyHeader');
        const userBtn = document.getElementById('userBtn');
        const wishlistBtn = document.getElementById('wishlistBtn');
        const cartBtn = document.getElementById('cartBtn');
        const miniCartOverlay = document.getElementById('miniCartOverlay');
        const closeCart = document.getElementById('closeCart');
        const cartItemsContainer = document.getElementById('cartItemsContainer');
        const cartTotalContainer = document.getElementById('cartTotalContainer');
        const cartTotalPrice = document.getElementById('cartTotalPrice');
        const emptyCartMsg = document.getElementById('emptyCartMsg');
        const continueShoppingBtn = document.getElementById('continueShoppingBtn');
        const checkoutBtn = document.getElementById('checkoutBtn');
        const quickViewOverlay = document.getElementById('quickViewOverlay');
        const closeQV = document.getElementById('closeQV');
        const qvContent = document.getElementById('qvContent');
        const qvImage = document.getElementById('qvImage');
        const qvName = document.getElementById('qvName');
        const qvPrice = document.getElementById('qvPrice');
        const qvDesc = document.getElementById('qvDesc');
        const qvCategory = document.getElementById('qvCategory');
        const qvGender = document.getElementById('qvGender');
        const qvSizes = document.getElementById('qvSizes');
        const qvColors = document.getElementById('qvColors');
        const qvStock = document.getElementById('qvStock');
        const qvAddToCart = document.getElementById('qvAddToCart');
        const wishlistIcon = document.getElementById('wishlistIcon');
        const userIcon = document.getElementById('userIcon');
        const searchIconMobile = document.getElementById('searchIconMobile');
        const searchOverlay = document.getElementById('searchOverlay');
        const searchClose = document.getElementById('searchClose');
        const searchOverlayInput = document.getElementById('searchOverlayInput');
        const searchOverlaySubmit = document.getElementById('searchOverlaySubmit');
        const hamburgerBtn = document.getElementById('hamburgerBtn');
        const drawerOverlay = document.getElementById('drawerOverlay');
        const drawer = document.getElementById('drawer');
        const closeDrawer = document.getElementById('closeDrawer');
        const drawerHome = document.getElementById('drawerHome');
        const drawerContact = document.getElementById('drawerContact');

        // Auth modal
        const authOverlay = document.getElementById('authOverlay');
        const authCloseBtn = document.getElementById('authCloseBtn');
        const authForms = document.getElementById('authForms');
        const authLoggedIn = document.getElementById('authLoggedIn');
        const authModalTitle = document.getElementById('authModalTitle');
        const userAvatar = document.getElementById('userAvatar');
        const userDisplayName = document.getElementById('userDisplayName');
        const userDisplayEmail = document.getElementById('userDisplayEmail');
        const loginForm = document.getElementById('loginForm');
        const loginEmail = document.getElementById('loginEmail');
        const loginPassword = document.getElementById('loginPassword');
        const loginError = document.getElementById('loginError');
        const registerForm = document.getElementById('registerForm');
        const registerName = document.getElementById('registerName');
        const registerEmail = document.getElementById('registerEmail');
        const registerPassword = document.getElementById('registerPassword');
        const registerConfirm = document.getElementById('registerConfirm');
        const registerError = document.getElementById('registerError');
        const authTabs = document.querySelectorAll('.auth-tabs button');
        const logoutBtn = document.getElementById('logoutBtn');
        const profileName = document.getElementById('profileName');
        const profileEmail = document.getElementById('profileEmail');
        const profilePassword = document.getElementById('profilePassword');
        const profileConfirm = document.getElementById('profileConfirm');
        const profileUpdateMsg = document.getElementById('profileUpdateMsg');
        const profileUpdateForm = document.getElementById('profileUpdateForm');

        // Dashboard tabs
        const dashboardTabs = document.querySelectorAll('.dashboard-tabs button[data-tab]');
        const tabPanes = {
            dashboard: document.getElementById('tab-dashboard'),
            orders: document.getElementById('tab-orders'),
            wishlist: document.getElementById('tab-wishlist'),
            addresses: document.getElementById('tab-addresses'),
            profile: document.getElementById('tab-profile'),
        };
        const ordersListContainer = document.getElementById('ordersListContainer');
        const wishlistDashboardContainer = document.getElementById('wishlistDashboardContainer');

        // Checkout
        const checkoutOverlay = document.getElementById('checkoutOverlay');
        const checkoutCloseBtn = document.getElementById('checkoutCloseBtn');
        const checkoutForm = document.getElementById('checkoutForm');
        const checkoutName = document.getElementById('checkoutName');
        const checkoutPhone = document.getElementById('checkoutPhone');
        const checkoutAddress = document.getElementById('checkoutAddress');
        const checkoutCity = document.getElementById('checkoutCity');
        const checkoutPayment = document.getElementById('checkoutPayment');
        const checkoutSubtotal = document.getElementById('checkoutSubtotal');
        const checkoutDelivery = document.getElementById('checkoutDelivery');
        const checkoutTotal = document.getElementById('checkoutTotal');
        const placeOrderBtn = document.getElementById('placeOrderBtn');

        // Order success
        const orderSuccessOverlay = document.getElementById('orderSuccessOverlay');
        const orderNumberDisplay = document.getElementById('orderNumberDisplay');
        const orderSuccessDashboard = document.getElementById('orderSuccessDashboard');

        // Contact (now separate page - /contact.html)

        // SECTION: Home (fixed null checks)
        const homeSection = document.getElementById('mainContent');
        const homeNav = document.getElementById('homeNav');
        const contactNav = document.getElementById('contactNav');

        // ============================================================
        // SECTION SWITCHING (safe)
        // ============================================================
        function showHomeSection() {
            if (homeSection) homeSection.style.display = 'block';
            if (homeNav) homeNav.classList.add('active');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        // Event listeners (safe)
        if (homeNav) homeNav.addEventListener('click', (e) => { e.preventDefault(); showHomeSection(); });

        // ============================================================
        // CONTACT US DROPDOWN PANEL
        // ============================================================
        const contactPanel = document.getElementById('contactPanel');
        const contactPanelOverlay = document.getElementById('contactPanelOverlay');
        const contactPanelClose = document.getElementById('contactPanelClose');

        function openContactPanel() {
            contactPanel.classList.add('open');
            contactPanelOverlay.classList.add('open');
            document.body.classList.add('no-scroll');
        }
        function closeContactPanel() {
            contactPanel.classList.remove('open');
            contactPanelOverlay.classList.remove('open');
            document.body.classList.remove('no-scroll');
        }
        if (contactNav) {
            contactNav.addEventListener('click', function(e) {
                e.preventDefault();
                if (contactPanel.classList.contains('open')) {
                    closeContactPanel();
                } else {
                    openContactPanel();
                }
            });
        }
        if (contactPanelClose) contactPanelClose.addEventListener('click', closeContactPanel);
        if (contactPanelOverlay) contactPanelOverlay.addEventListener('click', closeContactPanel);
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && contactPanel.classList.contains('open')) closeContactPanel();
        });

        // Contact panel form
        const cpContactForm = document.getElementById('cpContactForm');
        if (cpContactForm) {
            cpContactForm.addEventListener('submit', async function(e) {
                e.preventDefault();
                const name = document.getElementById('cpName').value.trim();
                const email = document.getElementById('cpEmail').value.trim();
                const phone = document.getElementById('cpPhone').value.trim();
                const message = document.getElementById('cpMessage').value.trim();
                if (!name || !email || !message) { showToast('⚠️ Please fill all required fields', 'error'); return; }
                try {
                    const res = await fetch(`${API_URL}/contact`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name, email, phone, message, subject: 'Quick Message from Website' })
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.message || 'Failed');
                    showToast('✅ Message sent successfully!', 'success');
                    cpContactForm.reset();
                } catch (err) {
                    showToast('⚠️ ' + err.message, 'error');
                }
            });
        }

        // Load social links into contact panel
        async function loadCpSocialLinks() {
            try {
                const res = await fetch(`${API_URL}/social-links`);
                if (!res.ok) return;
                const json = await res.json();
                const data = json.data || json || {};
                const platforms = Object.keys(data).filter(k => k !== '_id' && k !== 'createdAt' && k !== 'updatedAt' && k !== '__v' && k !== 'website' && data[k] && typeof data[k] === 'object' && data[k].enabled && data[k].url);
                if (!platforms.length) return;
                const html = platforms.map(k => {
                    const link = data[k]; const icon = socialIconMap[k] || 'fas fa-link';
                    const target = link.openInNewTab !== false ? ' target="_blank"' : '';
                    return `<a href="${link.url}"${target} class="cp-social-link" aria-label="${k}"><i class="${icon}"></i></a>`;
                }).join('');
                const container = document.getElementById('cpSocialLinks');
                if (container) container.innerHTML = html;
            } catch (e) { /* silent */ }
        }
        loadCpSocialLinks();

        // ============================================================
        // TOAST
        // ============================================================
        function showToast(msg, type = 'info') {
            toastMessage.textContent = msg;
            toast.className = 'toast';
            if (type) toast.classList.add(type);
            toast.classList.add('show');
            clearTimeout(toast._timer);
            toast._timer = setTimeout(() => toast.classList.remove('show'), 4000);
        }
        toastClose.addEventListener('click', () => toast.classList.remove('show'));

        // ============================================================
        // AUTH HELPERS
        // ============================================================
        function getToken() { return localStorage.getItem('token'); }
        function getUser() {
            const u = localStorage.getItem('user');
            return u ? JSON.parse(u) : null;
        }
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
                userIcon.className = 'fas fa-user-check';
                // Update desktop profile dropdown
                updateProfileDropdown(user);
                if (authOverlay.style.display === 'flex') showDashboard(user);
            } else {
                userIcon.className = 'far fa-user';
                // Update desktop profile dropdown
                updateProfileDropdown(null);
                if (authOverlay.style.display === 'flex') showAuthForms();
            }
            updateWishlistIcon();
            updateCartBadge();
            fetchBadgeCounts();
        }

        // Profile dropdown for desktop and mobile
        function updateProfileDropdown(user) {
            const dropdownHeader = document.getElementById('dropdownHeader');
            if (dropdownHeader) {
                if (user) {
                    dropdownHeader.innerHTML = `
                        <div class="avatar-placeholder">${user.name.charAt(0).toUpperCase()}</div>
                        <div class="user-name">${user.name}</div>
                        <div class="user-email">${user.email}</div>
                    `;
                } else {
                    dropdownHeader.innerHTML = `
                        <div class="avatar-placeholder">?</div>
                        <div class="user-name">Welcome, Guest</div>
                        <div class="user-email">Sign in for personalized experience</div>
                    `;
                }
            }
            // Update dropdown items visibility
            const logoutBtn = document.getElementById('ddLogout');
            if (logoutBtn) logoutBtn.style.display = user ? 'flex' : 'none';
            const profileLink = document.getElementById('ddProfile');
            if (profileLink) profileLink.style.display = user ? 'flex' : 'none';
            const ordersLink = document.getElementById('ddOrders');
            if (ordersLink) ordersLink.style.display = user ? 'flex' : 'none';
            const wishlistLink = document.getElementById('ddWishlist');
            if (wishlistLink) wishlistLink.style.display = user ? 'flex' : 'none';
            const addressesLink = document.getElementById('ddAddresses');
            if (addressesLink) addressesLink.style.display = user ? 'flex' : 'none';
            const settingsLink = document.getElementById('ddSettings');
            if (settingsLink) settingsLink.style.display = user ? 'flex' : 'none';
        }

        // Profile dropdown toggle
        const profileBtn = document.getElementById('profileBtn');
        const profileDropdown = document.getElementById('profileDropdown');
        if (profileBtn && profileDropdown) {
            profileBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                profileDropdown.classList.toggle('open');
                profileBtn.setAttribute('aria-expanded', profileDropdown.classList.contains('open'));
            });
            document.addEventListener('click', (e) => {
                if (!profileBtnWrapper.contains(e.target)) {
                    profileDropdown.classList.remove('open');
                    profileBtn.setAttribute('aria-expanded', 'false');
                }
            });
        }
        const profileBtnWrapper = document.getElementById('profileBtnWrapper');

        // Profile dropdown items
        const ddProfile = document.getElementById('ddProfile');
        const ddOrders = document.getElementById('ddOrders');
        const ddWishlist = document.getElementById('ddWishlist');
        const ddAddresses = document.getElementById('ddAddresses');
        const ddSettings = document.getElementById('ddSettings');
        const ddLogout = document.getElementById('ddLogout');
        if (ddProfile) ddProfile.addEventListener('click', (e) => { e.preventDefault(); profileDropdown?.classList.remove('open'); toggleAuthRequiredAction('profile'); });
        if (ddOrders) ddOrders.addEventListener('click', (e) => { e.preventDefault(); profileDropdown?.classList.remove('open'); toggleAuthRequiredAction('orders'); });
        if (ddWishlist) ddWishlist.addEventListener('click', (e) => { e.preventDefault(); profileDropdown?.classList.remove('open'); toggleAuthRequiredAction('wishlist'); });
        if (ddAddresses) ddAddresses.addEventListener('click', (e) => { e.preventDefault(); profileDropdown?.classList.remove('open'); toggleAuthRequiredAction('profile'); });
        if (ddSettings) ddSettings.addEventListener('click', (e) => { e.preventDefault(); profileDropdown?.classList.remove('open'); toggleAuthRequiredAction('settings'); });
        if (ddLogout) ddLogout.addEventListener('click', (e) => { e.preventDefault(); profileDropdown?.classList.remove('open'); clearAuth(); showToast('Logged out', 'info'); loadProducts(); });

        // ============================================================
        // FETCH BADGE COUNTS FROM BACKEND
        // ============================================================
        async function fetchBadgeCounts() {
            if (!isLoggedIn()) return;
            try {
                const [wishlistRes, cartRes] = await Promise.all([
                    authFetch(`${API_URL}/wishlist/count`),
                    authFetch(`${API_URL}/cart/count`)
                ]);
                const wishlistData = await wishlistRes.json();
                const cartData = await cartRes.json();
                const wishlistCount = wishlistData.count || wishlistData.data?.count || 0;
                const cartCount = cartData.count || cartData.data?.count || 0;
                // Update mobile badges
                updateBadge('wishlistBadge', wishlistCount);
                updateBadge('wishlistBadgeDesktop', wishlistCount);
                updateBadge('cartBadge', cartCount);
                updateBadge('cartBadgeDesktop', cartCount);
                // Update aria-labels
                const wishlistBtn = document.getElementById('wishlistBtn');
                const wishlistBtnDesktop = document.getElementById('wishlistBtnDesktop');
                const cartBtn = document.getElementById('cartBtn');
                const cartBtnDesktop = document.getElementById('cartBtnDesktop');
                if (wishlistBtn) wishlistBtn.setAttribute('aria-label', `Wishlist (${wishlistCount} items)`);
                if (wishlistBtnDesktop) wishlistBtnDesktop.setAttribute('aria-label', `Wishlist (${wishlistCount} items)`);
                if (cartBtn) cartBtn.setAttribute('aria-label', `Cart (${cartCount} items)`);
                if (cartBtnDesktop) cartBtnDesktop.setAttribute('aria-label', `Cart (${cartCount} items)`);
            } catch (e) {
                // silent fail
            }
        }

        function updateBadge(id, count) {
            const badge = document.getElementById(id);
            if (badge) {
                badge.textContent = count;
                badge.setAttribute('data-count', count);
                badge.style.display = count > 0 ? 'flex' : 'none';
            }
        }

        // ============================================================
        // AUTH MODAL
        // ============================================================
        function openAuthModal() {
            authOverlay.style.display = 'flex';
            document.body.classList.add('no-scroll');
            if (isLoggedIn()) {
                showDashboard(getUser());
            } else {
                showAuthForms();
            }
        }

        function closeAuthModal() {
            authOverlay.style.display = 'none';
            document.body.classList.remove('no-scroll');
        }

        authCloseBtn.addEventListener('click', closeAuthModal);
        authOverlay.addEventListener('click', function(e) {
            if (e.target === this) closeAuthModal();
        });

        window.openAuthModal = openAuthModal;
        window.loadSharedModule = async function() {
            // Shared functionality loaded
            updateWishlistBadge();
            updateCartBadge();
        };

        function showAuthForms() {
            authForms.style.display = 'block';
            authLoggedIn.style.display = 'none';
            authModalTitle.textContent = 'Account';
            document.querySelectorAll('.auth-tabs button').forEach(b => b.classList.remove('active'));
            document.querySelector('[data-tab="login"]').classList.add('active');
            loginForm.style.display = 'flex';
            registerForm.style.display = 'none';
            loginError.style.display = 'none';
            registerError.style.display = 'none';
        }

        function showDashboard(user) {
            authForms.style.display = 'none';
            authLoggedIn.style.display = 'block';
            authModalTitle.textContent = 'My Account';
            userAvatar.textContent = user.name.charAt(0).toUpperCase();
            userDisplayName.textContent = user.name;
            userDisplayEmail.textContent = user.email;
            profileName.value = user.name || '';
            profileEmail.value = user.email || '';
            profilePassword.value = '';
            profileConfirm.value = '';
            profileUpdateMsg.style.display = 'none';
            loadOrders();
            loadWishlistDashboard();
            switchDashboardTab('dashboard');
        }

        userBtn.addEventListener('click', openAuthModal);

        // Auth tabs
        authTabs.forEach(tab => {
            tab.addEventListener('click', function() {
                authTabs.forEach(t => t.classList.remove('active'));
                this.classList.add('active');
                const tabName = this.dataset.tab;
                if (tabName === 'login') {
                    loginForm.style.display = 'flex';
                    registerForm.style.display = 'none';
                    loginError.style.display = 'none';
                } else {
                    loginForm.style.display = 'none';
                    registerForm.style.display = 'flex';
                    registerError.style.display = 'none';
                }
            });
        });

        // Login
        loginForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            loginError.style.display = 'none';
            const email = loginEmail.value.trim();
            const password = loginPassword.value.trim();
            try {
                const res = await fetch(`${API_URL}/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                const data = await res.json();
                if (!res.ok) {
                    loginError.textContent = data.message || 'Login failed';
                    loginError.style.display = 'block';
                    return;
                }
                setAuth(data.user, data.token);
                showToast(`✅ Welcome back, ${data.user.name}!`, 'success');
                closeAuthModal();
                await loadWishlist();
                await syncGuestWishlist();
                if (window.location.pathname !== '/account.html' && !window.location.pathname.includes('/account')) {
                    window.location.href = '/account.html';
                } else {
                    loadProducts();
                }
            } catch (err) {
                loginError.textContent = 'Connection error';
                loginError.style.display = 'block';
            }
        });

        // Register
        registerForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            registerError.style.display = 'none';
            const name = registerName.value.trim();
            const email = registerEmail.value.trim();
            const password = registerPassword.value.trim();
            const confirm = registerConfirm.value.trim();
            if (password !== confirm) {
                registerError.textContent = 'Passwords do not match';
                registerError.style.display = 'block';
                return;
            }
            try {
                const res = await fetch(`${API_URL}/auth/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, email, password })
                });
                const data = await res.json();
                if (!res.ok) {
                    registerError.textContent = data.message || 'Registration failed';
                    registerError.style.display = 'block';
                    return;
                }
                setAuth(data.user, data.token);
                showToast(`🎉 Welcome, ${data.user.name}!`, 'success');
                closeAuthModal();
                await loadWishlist();
                await syncGuestWishlist();
                if (window.location.pathname !== '/account.html' && !window.location.pathname.includes('/account')) {
                    window.location.href = '/account.html';
                } else {
                    loadProducts();
                }
            } catch (err) {
                registerError.textContent = 'Connection error';
                registerError.style.display = 'block';
            }
        });

        // Logout
        logoutBtn.addEventListener('click', function() {
            clearAuth();
            closeAuthModal();
            showToast('👋 Logged out successfully', 'info');
            loadProducts();
            loadWishlist();
        });

        // Profile Update
        profileUpdateForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            profileUpdateMsg.style.display = 'none';
            const name = profileName.value.trim();
            const email = profileEmail.value.trim();
            const password = profilePassword.value;
            const confirm = profileConfirm.value;
            if (password && password !== confirm) {
                profileUpdateMsg.style.display = 'block';
                profileUpdateMsg.style.color = '#D81B60';
                profileUpdateMsg.textContent = '⚠️ Passwords do not match.';
                return;
            }
            const payload = { name, email };
            if (password) payload.password = password;
            try {
                const res = await fetch(`${API_URL}/users/profile`, {
                    method: 'PUT',
                    headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.message || 'Update failed');
                const updatedUser = data.user || data;
                localStorage.setItem('user', JSON.stringify(updatedUser));
                profileUpdateMsg.style.display = 'block';
                profileUpdateMsg.style.color = '#2E7D32';
                profileUpdateMsg.textContent = '✅ Profile updated successfully!';
                showDashboard(updatedUser);
                showToast('✅ Profile updated', 'success');
            } catch (err) {
                profileUpdateMsg.style.display = 'block';
                profileUpdateMsg.style.color = '#D81B60';
                profileUpdateMsg.textContent = '⚠️ ' + err.message;
            }
        });

        // ============================================================
        // DASHBOARD TABS
        // ============================================================
        function switchDashboardTab(tabId) {
            dashboardTabs.forEach(btn => {
                btn.classList.toggle('active', btn.dataset.tab === tabId);
            });
            Object.keys(tabPanes).forEach(key => {
                tabPanes[key].classList.toggle('active', key === tabId);
            });
            if (tabId === 'orders') loadOrders();
            if (tabId === 'wishlist') loadWishlistDashboard();
        }

        dashboardTabs.forEach(btn => {
            btn.addEventListener('click', function() {
                switchDashboardTab(this.dataset.tab);
            });
        });

        // ============================================================
        // ORDERS (Dashboard)
        // ============================================================
        async function loadOrders() {
            const token = getToken();
            if (!token) {
                ordersListContainer.innerHTML = '<p style="color:var(--text-secondary);">Please log in to see your orders.</p>';
                return;
            }
            try {
                const res = await fetch(`${API_URL}/orders/my-orders`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!res.ok) throw new Error('Failed to fetch orders');
                const orders = await res.json();
                renderOrders(orders, ordersListContainer);
            } catch (err) {
                ordersListContainer.innerHTML =
                    `<p style="color:var(--text-secondary);">⚠️ Could not load orders. ${err.message}</p>`;
            }
        }

        function renderOrders(orders, container) {
            if (!orders || orders.length === 0) {
                container.innerHTML = `<div style="padding:20px 0;color:var(--text-secondary);">You haven't placed any orders yet.</div>`;
                return;
            }
            let html = '';
            orders.forEach(order => {
                const statusClass = order.status || 'pending';
                const itemsList = order.items ? order.items.map(item =>
                    `${item.name} (x${item.quantity})`
                ).join(', ') : '';
                const discountText = order.discount ? ` (Discount: Ksh ${order.discount.toLocaleString()})` : '';
                const canCancel = ['pending', 'confirmed'].includes(order.status);
                const canRefund = order.status === 'delivered' && order.refundStatus === 'none';
                const refundBadge = order.refundStatus !== 'none' ? `<span style="font-size:0.7rem;background:${order.refundStatus==='approved'||order.refundStatus==='completed'?'var(--success)':'var(--gold)'};color:${order.refundStatus==='rejected'?'#fff':'#000'};padding:2px 8px;border-radius:20px;margin-left:6px;">Refund: ${order.refundStatus}</span>` : '';
                html += `
                        <div class="order-item" style="cursor:pointer;" onclick="openOrderDetail('${order._id}')">
                            <div class="order-header">
                                <span class="order-id">#${order.orderNumber || order._id.toString().slice(-8).toUpperCase()}</span>
                                <span class="order-status ${statusClass}">${statusClass}</span>${refundBadge}
                            </div>
                            <div class="order-header" style="margin-bottom:4px;">
                                <span class="order-date">${new Date(order.createdAt).toLocaleDateString()}</span>
                                <span class="order-total">Ksh ${(order.total || 0).toLocaleString()}${discountText}</span>
                            </div>
                            ${order.couponCode ? `<div style="font-size:0.75rem;color:var(--color-gold);">Coupon: ${order.couponCode}</div>` : ''}
                            <div class="order-items">${itemsList || 'No items listed'}</div>
                            <div style="margin-top:8px;display:flex;gap:8px;" onclick="event.stopPropagation()">
                                ${canCancel ? `<button onclick="cancelOrder('${order._id}')" style="background:var(--error);color:#fff;border:none;padding:6px 14px;border-radius:6px;font-size:0.75rem;cursor:pointer;font-weight:600;">Cancel Order</button>` : ''}
                                ${canRefund ? `<button onclick="requestRefund('${order._id}')" style="background:var(--gold);color:#000;border:none;padding:6px 14px;border-radius:6px;font-size:0.75rem;cursor:pointer;font-weight:600;">Request Refund</button>` : ''}
                            </div>
                        </div>
                    `;
            });
            container.innerHTML = html;
        }

        async function cancelOrder(orderId) {
            const reason = prompt('Reason for cancellation (optional):');
            if (reason === null) return;
            const token = getToken();
            try {
                const res = await fetch(`${API_URL}/orders/${orderId}/cancel`, {
                    method: 'PUT',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ reason })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.message || 'Failed');
                showToast('Order cancelled successfully');
                loadOrders();
            } catch (err) { showToast(err.message); }
        }

        async function requestRefund(orderId) {
            const reason = prompt('Reason for refund request:');
            if (!reason) return;
            const token = getToken();
            try {
                const res = await fetch(`${API_URL}/orders/${orderId}/refund-request`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ reason })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.message || 'Failed');
                showToast('Refund request submitted');
                loadOrders();
            } catch (err) { showToast(err.message); }
        }

        async function openOrderDetail(orderId) {
            const token = getToken();
            try {
                const res = await fetch(`${API_URL}/orders/my-orders`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await res.json();
                const order = (data.data || data).find(o => o._id === orderId);
                if (!order) return;
                const modal = document.getElementById('orderDetailModal');
                const content = document.getElementById('orderDetailContent');
                const statusSteps = ['pending', 'confirmed', 'processing', 'packed', 'shipped', 'delivered'];
                const currentIdx = statusSteps.indexOf(order.status);
                const timelineHtml = (order.timeline || []).map(t => `
                    <div style="display:flex;gap:12px;margin-bottom:16px;">
                        <div style="min-width:10px;">
                            <div style="width:10px;height:10px;border-radius:50%;background:var(--gold);margin-top:4px;"></div>
                        </div>
                        <div>
                            <div style="font-size:0.8rem;font-weight:600;text-transform:capitalize;">${t.status}</div>
                            <div style="font-size:0.75rem;color:var(--text-secondary);">${t.note || ''}</div>
                            <div style="font-size:0.7rem;color:var(--text-muted);">${new Date(t.timestamp).toLocaleString()}</div>
                        </div>
                    </div>
                `).join('');
                const itemsHtml = (order.items || []).map(i => `
                    <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border-color);">
                        ${i.image ? `<img src="${i.image}" alt="${escHtml(i.name || 'Order item')}" style="width:40px;height:40px;border-radius:6px;object-fit:cover;" loading="lazy" />` : ''}
                        <div style="flex:1;font-size:0.85rem;">${i.name} x${i.quantity}</div>
                        <div style="font-size:0.85rem;font-weight:600;">Ksh ${(i.price * i.quantity).toLocaleString()}</div>
                    </div>
                `).join('');
                content.innerHTML = `
                    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">
                        ${statusSteps.map((s, i) => `<div style="flex:1;min-width:60px;text-align:center;padding:6px 4px;border-radius:6px;font-size:0.7rem;font-weight:600;background:${i <= currentIdx ? 'var(--gold)' : 'var(--bg-secondary)'};color:${i <= currentIdx ? '#000' : 'var(--text-muted)'};">${s}</div>`).join('<div style="width:12px;display:flex;align-items:center;justify-content:center;color:var(--text-muted);">→</div>')}
                    </div>
                    ${order.trackingNumber ? `<div style="margin-bottom:12px;padding:10px;background:var(--bg-secondary);border-radius:8px;font-size:0.85rem;"><strong>Tracking:</strong> ${order.trackingNumber}</div>` : ''}
                    <div style="margin-bottom:16px;"><h4 style="font-size:0.9rem;margin-bottom:8px;">Items</h4>${itemsHtml}</div>
                    <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:0.85rem;"><span>Subtotal</span><span>Ksh ${(order.subtotal || 0).toLocaleString()}</span></div>
                    <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:0.85rem;"><span>Delivery</span><span>${order.deliveryFee === 0 ? 'Free' : 'Ksh ' + (order.deliveryFee || 0).toLocaleString()}</span></div>
                    ${order.discount ? `<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:0.85rem;color:var(--success);"><span>Discount</span><span>-Ksh ${order.discount.toLocaleString()}</span></div>` : ''}
                    <div style="display:flex;justify-content:space-between;padding:8px 0;font-size:1rem;font-weight:700;border-top:2px solid var(--border-color);margin-top:4px;"><span>Total</span><span>Ksh ${(order.total || 0).toLocaleString()}</span></div>
                    <div style="margin-top:12px;padding:10px;background:var(--bg-secondary);border-radius:8px;font-size:0.8rem;">
                        <div><strong>Payment:</strong> ${order.paymentMethod || 'Cash'}</div>
                        <div><strong>Address:</strong> ${order.shippingAddress?.fullName || ''}, ${order.shippingAddress?.address || ''}, ${order.shippingAddress?.city || ''}</div>
                        <div><strong>Phone:</strong> ${order.shippingAddress?.phone || ''}</div>
                    </div>
                    ${order.cancelReason ? `<div style="margin-top:10px;padding:10px;background:#fff3f3;border-radius:8px;font-size:0.8rem;color:var(--error);"><strong>Cancellation reason:</strong> ${order.cancelReason}</div>` : ''}
                    ${order.refundStatus !== 'none' ? `<div style="margin-top:10px;padding:10px;background:${order.refundStatus==='approved'?'#f0fff0':'#fff8e1'};border-radius:8px;font-size:0.8rem;"><strong>Refund:</strong> ${order.refundStatus} - Ksh ${(order.refundAmount||0).toLocaleString()}</div>` : ''}
                    <h4 style="font-size:0.9rem;margin:16px 0 8px;">Order Timeline</h4>
                    ${timelineHtml || '<p style="font-size:0.8rem;color:var(--text-muted);">No timeline events yet.</p>'}
                `;
                modal.style.display = 'flex';
            } catch (err) { showToast('Failed to load order details'); }
        }

        // ============================================================
        // WISHLIST (Dashboard)
        // ============================================================
        let wishlistSearchQuery = '';
        let wishlistSortBy = 'newest';
        let wishlistFilterCategory = 'all';

        function renderWishlistEmpty(container, isGuest) {
            container.innerHTML = `
                <div style="text-align:center;padding:48px 20px;">
                    <div style="width:80px;height:80px;border-radius:50%;background:var(--bg-secondary);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">
                        <i class="far fa-heart" style="font-size:2rem;color:var(--color-gold);"></i>
                    </div>
                    <h3 style="font-size:1.15rem;font-weight:600;margin-bottom:6px;">Your Wishlist is Empty</h3>
                    <p style="color:var(--text-secondary);font-size:0.85rem;margin-bottom:20px;max-width:300px;margin-left:auto;margin-right:auto;">Save your favorite items for later and never lose track of what you love.</p>
                    <button onclick="closeAuthModal();setTimeout(()=>document.querySelector('.products-section')?.scrollIntoView({behavior:'smooth'}),200)" style="background:var(--text-primary);color:#fff;border:none;padding:10px 28px;border-radius:50px;font-size:0.8rem;font-weight:600;cursor:pointer;">Continue Shopping</button>
                </div>`;
        }

        async function loadWishlistDashboard() {
            const container = wishlistDashboardContainer;
            if (!container) return;
            if (!isLoggedIn()) {
                const guest = getGuestWishlist();
                if (guest.length === 0) { renderWishlistEmpty(container, true); return; }
                container.innerHTML = '<div style="text-align:center;padding:24px;"><i class="fas fa-spinner fa-spin" style="font-size:1.5rem;color:var(--color-gold);"></i></div>';
                const products = await Promise.all(guest.map(async id => {
                    try { const r = await fetch(`${API_URL}/products/${id}`); const d = await r.json(); return d.data || d; } catch(e) { return null; }
                }));
                const valid = products.filter(Boolean);
                if (!valid.length) { renderWishlistEmpty(container, true); return; }
                renderWishlistDashboard(container, valid, true);
                return;
            }
            container.innerHTML = '<div style="text-align:center;padding:24px;"><i class="fas fa-spinner fa-spin" style="font-size:1.5rem;color:var(--color-gold);"></i></div>';
            try {
                const res = await authFetch(`${API_URL}/wishlist`);
                if (!res.ok) throw new Error('Failed');
                const data = await res.json();
                const items = data.items || data || [];
                if (!items.length) { renderWishlistEmpty(container, false); return; }
                const products = items.map(i => i.productId || i).filter(Boolean);
                renderWishlistDashboard(container, products, false);
            } catch (err) {
                container.innerHTML = '<p style="color:var(--text-secondary);text-align:center;padding:20px;">Could not load wishlist. Please try again.</p>';
            }
        }

        function renderWishlistDashboard(container, products, isGuest) {
            const cats = [...new Set(products.map(p => p.category).filter(Boolean))].sort();
            const brands = [...new Set(products.map(p => p.brand).filter(Boolean))].sort();
            let filtered = [...products];
            if (wishlistFilterCategory !== 'all') filtered = filtered.filter(p => p.category === wishlistFilterCategory);
            if (wishlistSearchQuery) {
                const q = wishlistSearchQuery.toLowerCase();
                filtered = filtered.filter(p => (p.name || '').toLowerCase().includes(q) || (p.brand || '').toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q));
            }
            if (wishlistSortBy === 'price-low') filtered.sort((a, b) => a.price - b.price);
            else if (wishlistSortBy === 'price-high') filtered.sort((a, b) => b.price - a.price);
            else if (wishlistSortBy === 'name') filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            else filtered.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));

            let html = `
                <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px;align-items:center;">
                    <div style="flex:1;min-width:140px;position:relative;">
                        <i class="fas fa-search" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);font-size:0.75rem;color:var(--text-secondary);"></i>
                        <input type="text" placeholder="Search by name, brand..." value="${wishlistSearchQuery}" oninput="wishlistSearchQuery=this.value;renderWishlistDashboard(document.getElementById('wishlistDashboardContainer'),${JSON.stringify(products).replace(/"/g, '&quot;')},${isGuest})" style="width:100%;padding:8px 12px 8px 30px;border:1px solid var(--border-light);border-radius:8px;font-size:0.8rem;font-family:inherit;background:var(--bg-primary);" />
                    </div>
                    <select onchange="wishlistSortBy=this.value;renderWishlistDashboard(document.getElementById('wishlistDashboardContainer'),${JSON.stringify(products).replace(/"/g, '&quot;')},${isGuest})" style="padding:8px 12px;border:1px solid var(--border-light);border-radius:8px;font-size:0.8rem;font-family:inherit;background:var(--bg-primary);">
                        <option value="newest" ${wishlistSortBy==='newest'?'selected':''}>Newest</option>
                        <option value="price-low" ${wishlistSortBy==='price-low'?'selected':''}>Price Low-High</option>
                        <option value="price-high" ${wishlistSortBy==='price-high'?'selected':''}>Price High-Low</option>
                        <option value="name" ${wishlistSortBy==='name'?'selected':''}>A-Z</option>
                    </select>
                    <select onchange="wishlistFilterCategory=this.value;renderWishlistDashboard(document.getElementById('wishlistDashboardContainer'),${JSON.stringify(products).replace(/"/g, '&quot;')},${isGuest})" style="padding:8px 12px;border:1px solid var(--border-light);border-radius:8px;font-size:0.8rem;font-family:inherit;background:var(--bg-primary);">
                        <option value="all" ${wishlistFilterCategory==='all'?'selected':''}>All Categories</option>
                        ${cats.map(c => `<option value="${c}" ${wishlistFilterCategory===c?'selected':''}>${escHtml(c)}</option>`).join('')}
                    </select>
                    ${!isGuest ? `<button onclick="shareWishlist()" style="padding:8px 14px;border:1px solid var(--border-light);border-radius:8px;font-size:0.8rem;cursor:pointer;background:var(--bg-primary);display:flex;align-items:center;gap:4px;"><i class="fas fa-share-alt" style="font-size:0.7rem;"></i>Share</button>` : ''}
                    ${!isGuest && products.length > 0 ? `<button onclick="if(confirm('Clear entire wishlist?')){clearWishlist()}" style="padding:8px 14px;border:1px solid #FEE2E2;border-radius:8px;font-size:0.8rem;cursor:pointer;background:#FEF2F2;color:#DC2626;display:flex;align-items:center;gap:4px;"><i class="fas fa-trash-alt" style="font-size:0.7rem;"></i>Clear All</button>` : ''}
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                    <div style="color:var(--text-secondary);font-size:0.8rem;"><strong style="color:var(--text-primary);">${filtered.length}</strong> item${filtered.length!==1?'s':''}</div>
                </div>`;

            if (!filtered.length) {
                html += '<div style="text-align:center;padding:24px;color:var(--text-secondary);font-size:0.85rem;">No items match your search.</div>';
            } else {
                html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">';
                filtered.forEach(p => {
                    const img = (p.images && p.images[0]) ? getImageUrl(p.images[0]) : (p.thumbnail ? getImageUrl(p.thumbnail) : '');
                    const discount = p.originalPrice && p.originalPrice > p.price ? Math.round(((p.originalPrice - p.price) / p.originalPrice) * 100) : 0;
                    const outOfStock = !isProductAvailable(p);
                    const rating = p.rating || 0;
                    const stars = Array.from({length: 5}, (_, i) => i < Math.round(rating) ? '&#9733;' : '&#9734;').join('');
                    html += `
                        <div style="background:var(--bg-primary);border-radius:10px;overflow:hidden;border:1px solid var(--border-light);transition:box-shadow 0.2s;">
                            <div style="position:relative;">
                                <img src="${escHtml(img || 'https://placehold.co/200x240/FAF9F6/C8A35A?text=No+Image')}" alt="${escHtml(p.name || '')}" style="width:100%;aspect-ratio:4/5;object-fit:cover;" loading="lazy" />
                                ${discount ? `<span style="position:absolute;top:8px;left:8px;background:#D81B60;color:#fff;font-size:0.6rem;padding:2px 8px;border-radius:4px;font-weight:600;">-${discount}%</span>` : ''}
                                ${outOfStock ? '<span style="position:absolute;top:8px;right:8px;background:#EF4444;color:#fff;font-size:0.6rem;padding:2px 8px;border-radius:4px;font-weight:600;">Out of Stock</span>' : ''}
                            </div>
                            <div style="padding:10px 12px 12px;">
                                <div style="font-size:0.65rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;">${escHtml(p.brand || p.category || '')}</div>
                                <div style="font-weight:600;font-size:0.82rem;margin:3px 0;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(p.name || '')}</div>
                                ${rating > 0 ? `<div style="font-size:0.65rem;color:#F59E0B;margin-bottom:3px;">${stars} <span style="color:var(--text-secondary);">(${p.totalReviews || 0})</span></div>` : ''}
                                <div style="display:flex;align-items:baseline;gap:6px;">
                                    <span style="font-weight:700;color:var(--color-gold);font-size:0.9rem;">Ksh ${(p.price || 0).toLocaleString()}</span>
                                    ${discount ? `<span style="font-size:0.7rem;color:var(--text-secondary);text-decoration:line-through;">Ksh ${(p.originalPrice || 0).toLocaleString()}</span>` : ''}
                                </div>
                                <div style="display:flex;gap:6px;margin-top:8px;">
                                    <button onclick="moveToCart('${p._id}')" ${outOfStock ? 'disabled style="flex:1;padding:7px;border:none;border-radius:6px;font-size:0.72rem;font-weight:600;cursor:not-allowed;background:#E5E7EB;color:#9CA3AF;"' : 'style="flex:1;padding:7px;border:1px solid var(--text-primary);border-radius:6px;font-size:0.72rem;font-weight:600;cursor:pointer;background:var(--text-primary);color:#fff;"'}><i class="fas fa-cart-plus" style="margin-right:3px;"></i>${outOfStock ? 'Unavailable' : 'Move to Cart'}</button>
                                    <button onclick="removeFromWishlistDashboard('${p._id}')" style="padding:7px 10px;border:1px solid var(--border-light);border-radius:6px;font-size:0.72rem;cursor:pointer;background:var(--bg-primary);color:#DC2626;" title="Remove"><i class="fas fa-trash-alt"></i></button>
                                    <button onclick="openQuickView('${p._id}')" style="padding:7px 10px;border:1px solid var(--border-light);border-radius:6px;font-size:0.72rem;cursor:pointer;background:var(--bg-primary);" title="Quick View"><i class="fas fa-eye"></i></button>
                                </div>
                            </div>
                        </div>`;
                });
                html += '</div>';
            }
            container.innerHTML = html;
        }

        async function moveToCart(productId) {
            if (!isLoggedIn()) { showToast('Please log in to add to cart', 'error'); openAuthModal(); return; }
            try {
                const res = await fetch(`${API_URL}/products/${productId}`);
                const raw = await res.json();
                const product = raw.data || raw;
                if (!isProductAvailable(product)) { showToast('Out of stock', 'error'); return; }
                addToCart(product);
                await removeFromWishlistAPI(productId);
                loadWishlistDashboard();
                renderProducts();
                showToast('Moved to cart', 'success');
            } catch (e) { showToast('Could not move to cart', 'error'); }
        }

        async function removeFromWishlistDashboard(productId) {
            const name = wishlistItems.find(item => {
                const id = item.productId ? item.productId._id || item.productId : item._id;
                return id === productId;
            })?.productId?.name || 'Item';
            if (!isLoggedIn()) {
                const guest = getGuestWishlist().filter(id => id !== productId);
                saveGuestWishlist(guest);
                wishlistItems = guest.map(id => ({ productId: { _id: id }, _id: id }));
                updateWishlistIcon();
                loadWishlistDashboard();
                renderProducts();
                showToast(`${name} removed from wishlist`, 'info');
                return;
            }
            try {
                await removeFromWishlistAPI(productId);
                loadWishlistDashboard();
                renderProducts();
                showToast(`${name} removed from wishlist`, 'info');
            } catch(e) { showToast('Could not remove item', 'error'); }
        }

        async function clearWishlist() {
            if (!isLoggedIn()) return;
            try {
                await authFetch(`${API_URL}/wishlist/clear`, { method: 'DELETE' });
                wishlistItems = [];
                updateWishlistIcon();
                loadWishlistDashboard();
                renderProducts();
                showToast('Wishlist cleared', 'info');
            } catch(e) { showToast('Could not clear wishlist', 'error'); }
        }

        function shareWishlist() {
            const url = window.location.origin;
            const text = 'Check out my favorite items on Trendy Wardrobe!';
            if (navigator.share) {
                navigator.share({ title: 'My Wishlist - Trendy Wardrobe', text, url }).catch(() => {});
                return;
            }
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;';
            overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
            overlay.innerHTML = `
                <div style="background:var(--bg-primary,#fff);border-radius:12px;padding:24px;max-width:360px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.2);">
                    <h3 style="font-size:1rem;font-weight:700;margin-bottom:4px;">Share Wishlist</h3>
                    <p style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:16px;">Let friends know what you love</p>
                    <div style="display:flex;flex-direction:column;gap:8px;">
                        <a href="https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}" target="_blank" style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:8px;background:#25D366;color:#fff;text-decoration:none;font-size:0.85rem;font-weight:600;"><i class="fab fa-whatsapp" style="font-size:1.1rem;"></i>WhatsApp</a>
                        <a href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}" target="_blank" style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:8px;background:#1877F2;color:#fff;text-decoration:none;font-size:0.85rem;font-weight:600;"><i class="fab fa-facebook-f" style="font-size:1.1rem;"></i>Facebook</a>
                        <a href="https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}" target="_blank" style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:8px;background:#1DA1F2;color:#fff;text-decoration:none;font-size:0.85rem;font-weight:600;"><i class="fab fa-twitter" style="font-size:1.1rem;"></i>Twitter / X</a>
                        <a href="https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}" target="_blank" style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:8px;background:#0088CC;color:#fff;text-decoration:none;font-size:0.85rem;font-weight:600;"><i class="fab fa-telegram-plane" style="font-size:1.1rem;"></i>Telegram</a>
                        <button onclick="navigator.clipboard.writeText('${url}');showToast('Link copied!');this.closest('div[style*=fixed]')?.remove();" style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:8px;background:var(--bg-secondary,#f5f5f5);color:var(--text-primary);border:none;font-size:0.85rem;font-weight:600;cursor:pointer;width:100%;"><i class="fas fa-link" style="font-size:1rem;"></i>Copy Link</button>
                    </div>
                    <button onclick="this.closest('div[style*=fixed]')?.remove();" style="width:100%;margin-top:12px;padding:8px;border:1px solid var(--border-light);border-radius:8px;background:transparent;color:var(--text-secondary);font-size:0.8rem;cursor:pointer;">Cancel</button>
                </div>`;
            document.body.appendChild(overlay);
        }

        // ============================================================
        // WISHLIST (Header & Product cards)
        // ============================================================
        let wishlistItems = [];

        function getGuestWishlist() {
            try { return JSON.parse(localStorage.getItem('guestWishlist') || '[]'); } catch(e) { return []; }
        }
        function saveGuestWishlist(items) {
            localStorage.setItem('guestWishlist', JSON.stringify(items));
        }

        async function loadWishlist() {
            if (!isLoggedIn()) {
                wishlistItems = getGuestWishlist().map(id => ({ productId: { _id: id }, _id: id }));
                updateWishlistIcon();
                return;
            }
            try {
                const res = await authFetch(`${API_URL}/wishlist`);
                if (!res.ok) throw new Error('Failed');
                const data = await res.json();
                wishlistItems = data.items || data || [];
                updateWishlistIcon();
            } catch (err) {
                wishlistItems = [];
                updateWishlistIcon();
            }
        }

        async function syncGuestWishlist() {
            const guest = getGuestWishlist();
            if (!guest.length || !isLoggedIn()) return;
            try {
                const res = await authFetch(`${API_URL}/wishlist/sync`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ items: guest.map(id => ({ productId: id })) })
                });
                if (res.ok) {
                    const data = await res.json();
                    wishlistItems = data.items || [];
                    saveGuestWishlist([]);
                }
            } catch(e) {}
            updateWishlistIcon();
        }

        function updateWishlistIcon() {
            const count = isLoggedIn() ? wishlistItems.length : getGuestWishlist().length;
            const mobileIcon = document.getElementById('wishlistIcon');
            if (mobileIcon) mobileIcon.classList.toggle('liked', count > 0);
            const desktopIcon = document.getElementById('wishlistIconDesktop');
            if (desktopIcon) desktopIcon.classList.toggle('liked', count > 0);
            updateBadge('wishlistBadge', count);
            updateBadge('wishlistBadgeDesktop', count);
            const mobileBadge = document.getElementById('mobileWishlistBadge');
            if (mobileBadge) { mobileBadge.textContent = count; mobileBadge.style.display = count > 0 ? 'flex' : 'none'; }
        }

        // Wishlist header buttons — open auth modal / dashboard
        if (wishlistBtn) wishlistBtn.addEventListener('click', () => toggleAuthRequiredAction('wishlist'));
        if (document.getElementById('wishlistBtnDesktop')) document.getElementById('wishlistBtnDesktop').addEventListener('click', () => toggleAuthRequiredAction('wishlist'));

        function isInWishlist(productId) {
            return wishlistItems.some(item => {
                const id = item.productId ? item.productId._id || item.productId : item._id;
                return id === productId;
            });
        }

        async function toggleWishlist(product) {
            if (!isLoggedIn()) {
                const guest = getGuestWishlist();
                const idx = guest.indexOf(product._id);
                if (idx > -1) {
                    guest.splice(idx, 1);
                    showToast(`${product.name} removed from wishlist`, 'info');
                } else {
                    guest.push(product._id);
                    showToast(`${product.name} added to wishlist`, 'success');
                }
                saveGuestWishlist(guest);
                wishlistItems = guest.map(id => ({ productId: { _id: id }, _id: id }));
                updateWishlistIcon();
                renderProducts();
                updateQVWishlistBtn(product._id);
                return;
            }
            const inWish = isInWishlist(product._id);
            try {
                if (inWish) {
                    await removeFromWishlistAPI(product._id);
                    showToast(`${product.name} removed from wishlist`, 'info');
                } else {
                    const res = await authFetch(`${API_URL}/wishlist`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ productId: product._id })
                    });
                    if (!res.ok) {
                        const errData = await res.json().catch(() => ({}));
                        if (errData.message === 'Product already in wishlist') {
                            showToast('Already in wishlist', 'info');
                        } else throw new Error(errData.message || 'Failed');
                    } else {
                        const data = await res.json().catch(() => ({}));
                        if (data.count !== undefined) {
                            wishlistItems.push({ productId: product._id, _id: product._id });
                        }
                        showToast(`${product.name} added to wishlist`, 'success');
                    }
                }
                updateWishlistIcon();
                renderProducts();
                updateQVWishlistBtn(product._id);
                loadWishlist();
            } catch (err) {
                showToast('Could not update wishlist', 'error');
            }
        }

        async function removeFromWishlistAPI(productId) {
            try {
                await authFetch(`${API_URL}/wishlist/${productId}`, { method: 'DELETE' });
            } catch(e) {}
            wishlistItems = wishlistItems.filter(item => {
                const itemId = item.productId ? item.productId._id || item.productId : item._id;
                return itemId !== productId;
            });
            updateWishlistIcon();
        }

        function updateQVWishlistBtn(productId) {
            const inWish = isInWishlist(productId);
            document.querySelectorAll('.qv-btn.wishlist').forEach(btn => {
                if (btn.dataset.id === productId) {
                    btn.classList.toggle('liked', inWish);
                    const icon = btn.querySelector('i');
                    if (icon) icon.className = `fa${inWish ? 's' : 'r'} fa-heart`;
                }
            });
        }

        // ============================================================
        // CART
        // ============================================================
        let cartItems = [];

        function loadCart() {
            const saved = localStorage.getItem('tw_cart') || localStorage.getItem('cart');
            if (saved) { try { cartItems = JSON.parse(saved); localStorage.setItem('tw_cart', saved); } catch (e) { cartItems = []; } }
            updateCartBadge();
            if (isLoggedIn()) loadServerCart();
        }

        function saveCart() { localStorage.setItem('tw_cart', JSON.stringify(cartItems));
            updateCartBadge();
            if (isLoggedIn()) syncCartToServer(); }

        async function syncCartToServer() {
            const token = getToken();
            if (!token) return;
            try {
                await fetch(`${API_URL}/cart/sync`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ items: cartItems.map(i => ({ product: i.id, quantity: i.quantity })) })
                });
            } catch (e) { console.warn('Cart sync failed', e); }
        }

        async function loadServerCart() {
            if (!isLoggedIn()) return;
            try {
                const res = await authFetch(`${API_URL}/cart`);
                if (!res.ok) return;
                const data = await res.json();
                if (data.items && data.items.length > 0) {
                    cartItems = data.items.map(i => ({
                        id: i.product?._id || i.product,
                        name: i.product?.name || 'Unknown',
                        price: i.product?.price || 0,
                        quantity: i.quantity,
                        image: i.product?.images?.[0] || ''
                    }));
                    saveCart();
                }
            } catch (e) { console.warn('Load server cart failed', e); }
        }

        function updateCartBadge() {
            const total = cartItems.reduce((sum, i) => sum + i.quantity, 0);
            if (cartBadge) { cartBadge.textContent = total; cartBadge.style.display = total > 0 ? 'flex' : 'none'; }
            const desktopBadge = document.getElementById('cartBadgeDesktop');
            if (desktopBadge) { desktopBadge.textContent = total; desktopBadge.style.display = total > 0 ? 'flex' : 'none'; }
        }

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

        function addToCart(product) {
            const qty = product.quantity || 1;
            const size = product.size || null;
            const color = product.color || null;
            const effectiveStock = getEffectiveStock(product);
            const existing = cartItems.find(i => i.id === product._id && i.size === size && i.color === color);
            if (existing) {
                if (existing.quantity + qty > effectiveStock) {
                    showToast(`Only ${effectiveStock} available`, 'error');
                    return;
                }
                existing.quantity += qty;
            } else {
                if (effectiveStock < 1) {
                    showToast('Out of stock', 'error');
                    return;
                }
                cartItems.push({ id: product._id, name: product.name, price: product.price, quantity: qty, image: product.images?.[0] || '', size, color, stock: effectiveStock });
            }
            saveCart();
            renderMiniCart();
            showToast(`${product.name} added to cart`, 'success');
        }

        function removeFromCart(index) {
            cartItems.splice(index, 1);
            saveCart();
            renderMiniCart();
        }

        function changeQty(index, delta) {
            const item = cartItems[index];
            const maxStock = item.stock || 99;
            if (delta > 0 && item.quantity + 1 > maxStock) {
                showToast(`Only ${maxStock} available`, 'error');
                return;
            }
            if (item.quantity + delta <= 0) { removeFromCart(index); return; }
            item.quantity += delta;
            saveCart();
            renderMiniCart();
        }

        function setQty(index, val) {
            const qty = parseInt(val);
            if (!qty || qty < 1) { removeFromCart(index); return; }
            const item = cartItems[index];
            const maxStock = item.stock || 99;
            item.quantity = Math.min(qty, maxStock);
            if (qty > maxStock) showToast(`Only ${maxStock} available`, 'error');
            saveCart();
            renderMiniCart();
        }

        function renderMiniCart() {
            if (cartItems.length === 0) {
                cartItemsContainer.innerHTML = '';
                cartTotalContainer.style.display = 'none';
                emptyCartMsg.style.display = 'block';
                return;
            }
            emptyCartMsg.style.display = 'none';
            cartTotalContainer.style.display = 'block';
            let html = '',
                total = 0;
            cartItems.forEach((item, idx) => {
                total += item.price * item.quantity;
                const imgSrc = getImageUrl(item.image);
                const opts = [];
                if (item.size) opts.push(item.size);
                if (item.color) opts.push(item.color);
                const optText = opts.length ? `<div style="font-size:0.75rem;color:var(--text-secondary);">${opts.join(' / ')}</div>` : '';
                const stock = item.stock || 99;
                html += `
                        <div class="mini-cart-item">
                            <img src="${imgSrc || 'https://placehold.co/60x60/FAF9F6/C8A35A?text=?'}" alt="${escHtml(item.name)}" loading="lazy" />
                            <div class="item-details">
                                <div class="name">${escHtml(item.name)}</div>
                                ${optText}
                                <div class="price">Ksh ${item.price.toLocaleString()}</div>
                                <div class="item-qty">
                                    <button onclick="changeQty(${idx}, -1)" aria-label="Decrease quantity">−</button>
                                    <input type="number" value="${item.quantity}" min="1" max="${stock}" onchange="setQty(${idx}, this.value)" aria-label="Quantity for ${escHtml(item.name)}" style="width:40px;text-align:center;border:1px solid var(--border-light);border-radius:4px;padding:2px;font-size:0.85rem;font-family:inherit;" />
                                    <button onclick="changeQty(${idx}, 1)" ${item.quantity >= stock ? 'disabled' : ''} aria-label="Increase quantity">+</button>
                                </div>
                            </div>
                            <button class="remove-item" onclick="removeFromCart(${idx})" aria-label="Remove ${escHtml(item.name)} from cart"><i class="fas fa-times"></i></button>
                        </div>
                    `;
            });
            const freeDeliveryThreshold = 15000;
            const remaining = Math.max(0, freeDeliveryThreshold - total);
            if (remaining > 0) {
                html += `<div style="padding:10px;background:#f8f6f0;border-radius:6px;margin-top:8px;font-size:0.75rem;color:var(--text-secondary);text-align:center;">
                    <i class="fas fa-truck" style="color:var(--color-gold);margin-right:4px;"></i>
                    Add <strong>Ksh ${remaining.toLocaleString()}</strong> more for FREE delivery
                    <div style="margin-top:6px;height:3px;background:#eee;border-radius:2px;overflow:hidden;">
                        <div style="height:100%;width:${Math.min(100, (total / freeDeliveryThreshold) * 100)}%;background:var(--color-gold);border-radius:2px;"></div>
                    </div>
                </div>`;
            } else {
                html += `<div style="padding:10px;background:#e8f5e9;border-radius:6px;margin-top:8px;font-size:0.75rem;color:#2e7d32;text-align:center;">
                    <i class="fas fa-check-circle" style="margin-right:4px;"></i> You qualify for FREE delivery!
                </div>`;
            }
            cartItemsContainer.innerHTML = html;
            cartTotalPrice.textContent = `Ksh ${total.toLocaleString()}`;
        }

        function openCart() { renderMiniCart();
            miniCartOverlay.classList.add('show');
            document.body.classList.add('no-scroll'); }

        function closeCartFn() { miniCartOverlay.classList.remove('show');
            document.body.classList.remove('no-scroll'); }
        cartBtn.addEventListener('click', openCart);
        const cartBtnDesktop = document.getElementById('cartBtnDesktop');
        if (cartBtnDesktop) cartBtnDesktop.addEventListener('click', openCart);
        closeCart.addEventListener('click', closeCartFn);
        miniCartOverlay.addEventListener('click', e => { if (e.target === miniCartOverlay) closeCartFn(); });
        continueShoppingBtn.addEventListener('click', closeCartFn);

        // ============================================================
        // CHECKOUT
        // ============================================================
        checkoutBtn.addEventListener('click', function() {
            if (!isLoggedIn()) {
                showToast('⚠️ Please log in to checkout', 'error');
                openAuthModal();
                return;
            }
            if (cartItems.length === 0) {
                showToast('⚠️ Your cart is empty', 'error');
                return;
            }
            openCheckout();
        });

        function openCheckout() {
            updateCheckoutTotals();
            const user = getUser();
            if (user) {
                checkoutName.value = user.name || '';
            }
            checkoutOverlay.classList.add('show');
            document.body.classList.add('no-scroll');
        }

        checkoutCloseBtn.addEventListener('click', closeCheckout);
        checkoutOverlay.addEventListener('click', function(e) {
            if (e.target === this) closeCheckout();
        });

        function closeCheckout() {
            checkoutOverlay.classList.remove('show');
            document.body.classList.remove('no-scroll');
        }

        checkoutForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const name = checkoutName.value.trim();
            const phone = checkoutPhone.value.trim();
            const address = checkoutAddress.value.trim();
            const city = checkoutCity.value.trim();
            const postcode = document.getElementById('checkoutPostcode')?.value.trim() || '';
            if (!name || !phone || !address || !city) {
                showToast('⚠️ Please fill all required fields', 'error');
                return;
            }
            try {
                for (const item of cartItems) {
                    const res = await fetch(`${API_URL}/products/${item.id}`);
                    const product = await res.json();
                    const prod = product.data || product;
                    if (prod.stock < item.quantity) {
                        showToast(`Not enough stock for ${prod.name}`, 'error');
                        return;
                    }
                }
            } catch (err) {
                showToast('⚠️ Could not validate stock', 'error');
                return;
            }

            placeOrderBtn.disabled = true;
            placeOrderBtn.textContent = 'Placing Order...';

            const orderData = {
                items: cartItems.map(item => ({
                    productId: item.id,
                    name: item.name,
                    quantity: item.quantity,
                    price: item.price,
                    size: item.size || undefined,
                    color: item.color || undefined
                })),
                shippingAddress: { fullName: name, phone, address, city, postcode },
                total: parseFloat(checkoutTotal.textContent.replace('Ksh ', '').replace(/,/g, '')),
                paymentMethod: checkoutPayment.value,
                coupon: appliedCoupon ? appliedCoupon.code : undefined,
            };

            try {
                const res = await fetch(`${API_URL}/orders`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(orderData)
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.message || 'Order failed');
                cartItems = [];
                appliedCoupon = null;
                if (couponInput) couponInput.value = '';
                if (couponMessage) couponMessage.style.display = 'none';
                saveCart();
                renderMiniCart();
                updateCartBadge();
                closeCheckout();
                orderNumberDisplay.textContent = `#${data.order.orderNumber || data.order._id.toString().slice(-8).toUpperCase()}`;
                orderSuccessOverlay.classList.add('show');
                document.body.classList.add('no-scroll');
                showToast('Order placed successfully!', 'success');
            } catch (err) {
                showToast(`⚠️ ${err.message}`, 'error');
            } finally {
                placeOrderBtn.disabled = false;
                placeOrderBtn.textContent = 'Place Order';
            }
        });

        orderSuccessDashboard.addEventListener('click', function() {
            orderSuccessOverlay.classList.remove('show');
            document.body.classList.remove('no-scroll');
            openAuthModal();
            setTimeout(() => switchDashboardTab('orders'), 300);
        });

        // ============================================================
        // HERO BACKGROUND
        // ============================================================
        let heroSlides = [],
            heroIndex = 0,
            heroInterval = null;

        async function loadHeroImages() {
            try {
                const res = await fetch(`${API_URL}/homepage/hero`);
                if (res.ok) {
                    const json = await res.json();
                    heroSlides = (json.data || json || []).filter(s => s.desktopImage || s.mobileImage);
                }
            } catch (e) { /* fall through */ }
            if (!heroSlides.length) {
                try {
                    const res = await fetch(`${API_URL}/settings/heroImages`);
                    const data = await res.json();
                    const legacy = Array.isArray(data) ? data : [];
                    heroSlides = legacy.map(url => ({ desktopImage: url, mobileImage: '', heading: '', subheading: '', buttonText: '', buttonLink: '' }));
                } catch (e) { console.error('Hero fallback error', e); }
            }
            if (heroSlides.length) {
                setHeroSlide(heroSlides[0]);
                if (heroInterval) clearInterval(heroInterval);
                heroInterval = setInterval(() => {
                    heroIndex = (heroIndex + 1) % heroSlides.length;
                    setHeroSlide(heroSlides[heroIndex]);
                }, 5000);
            }
        }

        function setHeroSlide(slide) {
            const hero = document.getElementById('heroSection');
            const heroBg = document.getElementById('heroBg');
            const heroVideo = document.getElementById('heroVideo');
            const isMobile = window.innerWidth <= 768;

            if (slide.videoUrl) {
                heroBg.style.backgroundImage = '';
                heroVideo.classList.remove('hidden-video');
                if (heroVideo.src !== slide.videoUrl) {
                    heroVideo.src = slide.videoUrl;
                    heroVideo.load();
                    heroVideo.play().catch(() => {});
                }
                if (isMobile) {
                    const imgUrl = slide.mobileImage || slide.desktopImage || '';
                    if (imgUrl) {
                        heroVideo.style.display = 'none';
                        heroBg.style.backgroundImage = `url(${getImageUrl(imgUrl)})`;
                    } else {
                        heroVideo.style.display = '';
                    }
                }
            } else {
                const imgUrl = isMobile ? (slide.mobileImage || slide.desktopImage || '') : (slide.desktopImage || slide.mobileImage || '');
                heroVideo.classList.add('hidden-video');
                heroVideo.src = '';
                if (imgUrl) {
                    heroBg.style.backgroundImage = `url(${getImageUrl(imgUrl)})`;
                }
            }
            const heading = document.getElementById('heroHeading');
            const highlight = heading ? heading.querySelector('.highlight') : null;
            const subheading = document.getElementById('heroSubheading');
            const shopBtn = document.getElementById('shopNowBtn');
            if (slide.heading) {
                if (highlight) {
                    highlight.textContent = slide.heading;
                } else {
                    heading.textContent = slide.heading;
                }
            }
            if (slide.subheading) {
                subheading.textContent = slide.subheading;
            }
            if (slide.buttonText) {
                shopBtn.textContent = slide.buttonText;
            }
            if (slide.buttonLink) {
                shopBtn.onclick = () => {
                    if (slide.buttonLink.startsWith('http')) {
                        window.open(slide.buttonLink, '_blank');
                    } else if (slide.buttonLink.startsWith('#')) {
                        document.querySelector(slide.buttonLink)?.scrollIntoView({ behavior: 'smooth' });
                    } else {
                        const url = new URL(slide.buttonLink, window.location.origin);
                        const gender = url.searchParams.get('gender');
                        const cat = url.searchParams.get('category');
                        if (gender) {
                            document.querySelector(`.gender-btn[data-gender="${gender}"]`)?.click();
                        }
                        if (cat) {
                            document.querySelector(`.filter-btn[data-filter="${cat}"]`)?.click();
                        }
                        if (!gender && !cat) loadProducts();
                        showHomeSection();
                        document.getElementById('productsSection').scrollIntoView({ behavior: 'smooth' });
                    }
                };
            }
        }

        // ============================================================
        // CATEGORY IMAGES
        // ============================================================
        async function loadCategoryImages() {
            let catalogues = [];
            try {
                const res = await fetch(`${API_URL}/homepage/catalogues`);
                if (res.ok) {
                    const json = await res.json();
                    catalogues = (json.data || json || []).filter(c => c.visible !== false);
                }
            } catch (e) { /* fall through */ }

            if (catalogues.length) {
                const cardMap = { men: { img: 'catalogMenImg', title: 'catalogMenTitle', sub: 'catalogMenSubtitle', btn: 'catalogMenBtn' },
                    women: { img: 'catalogWomenImg', title: 'catalogWomenTitle', sub: 'catalogWomenSubtitle', btn: 'catalogWomenBtn' },
                    kids: { img: 'catalogKidsImg', title: 'catalogKidsTitle', sub: 'catalogKidsSubtitle', btn: 'catalogKidsBtn' } };
                for (const cat of catalogues) {
                    const t = (cat.title || '').toLowerCase();
                    const key = t.includes('kid') ? 'kids' : t.includes('women') ? 'women' : t.includes('men') ? 'men' : null;
                    if (!key || !cardMap[key]) continue;
                    const ids = cardMap[key];
                    if (cat.image) { const img = document.getElementById(ids.img); if (img) img.src = getImageUrl(cat.image); }
                    if (cat.title) { const el = document.getElementById(ids.title); if (el) el.textContent = cat.title.toUpperCase(); }
                    if (cat.subtitle) { const el = document.getElementById(ids.sub); if (el) el.textContent = cat.subtitle; }
                    if (cat.buttonText) { const el = document.getElementById(ids.btn); if (el) el.textContent = cat.buttonText; }
                    if (cat.buttonLink) {
                        const el = document.getElementById(ids.btn);
                        if (el) {
                            el.style.cursor = 'pointer';
                            el.addEventListener('click', (e) => {
                                e.stopPropagation();
                                if (cat.buttonLink.startsWith('http')) {
                                    window.open(cat.buttonLink, '_blank');
                                } else {
                                    loadProducts('all', key);
                                    showHomeSection();
                                    document.getElementById('productsSection').scrollIntoView({ behavior: 'smooth' });
                                }
                            });
                        }
                    }
                }
            } else {
                try {
                    const keys = ['menImage', 'womenImage', 'kidsImage'];
                    const ids = { menImage: 'catalogMenImg', womenImage: 'catalogWomenImg', kidsImage: 'catalogKidsImg' };
                    for (const key of keys) {
                        const res = await fetch(`${API_URL}/settings/${key}`);
                        const url = await res.json();
                        const img = document.getElementById(ids[key]);
                        if (img && url) img.src = getImageUrl(url);
                    }
                } catch (e) { console.error('Category images error', e); }
            }
        }

        // ============================================================
        // SETTINGS — load all store settings from API
        // ============================================================
        async function loadSettings() {
            try {
                const res = await fetch(`${API_URL}/settings`);
                if (!res.ok) return;
                const json = await res.json();
                const s = json.data || json;
                if (!s) return;

                // Meta tags
                if (s.metaTitle) document.title = s.metaTitle;
                if (s.metaDescription) {
                    const el = document.querySelector('meta[name="description"]');
                    if (el) el.content = s.metaDescription;
                    const og = document.querySelector('meta[property="og:description"]');
                    if (og) og.content = s.metaDescription;
                }
                if (s.metaKeywords) {
                    const el = document.querySelector('meta[name="keywords"]');
                    if (el) el.content = s.metaKeywords;
                }

                // Logo — replace inline SVG with image if URL exists
                if (s.logo) {
                    document.querySelectorAll('.logo-link svg').forEach(svg => {
                        const img = document.createElement('img');
                        img.src = s.logo;
                        img.alt = s.storeName || 'Trendy Wardrobe';
                        img.style.cssText = 'height:48px;width:auto;max-height:56px;';
                        svg.replaceWith(img);
                    });
                    document.querySelectorAll('.drawer-logo svg').forEach(svg => {
                        const img = document.createElement('img');
                        img.src = s.logo;
                        img.alt = s.storeName || 'Trendy Wardrobe';
                        img.style.cssText = 'height:40px;width:auto;';
                        svg.replaceWith(img);
                    });
                }

                // Favicon
                if (s.favicon) {
                    const el = document.querySelector('link[rel="icon"]');
                    if (el) el.href = s.favicon;
                }

                // Footer contact info
                if (s.email) {
                    document.querySelectorAll('.footer-contact-line').forEach(el => {
                        if (el.querySelector('.fa-envelope')) {
                            el.innerHTML = `<i class="fas fa-envelope"></i> ${s.email}`;
                        }
                    });
                }
                if (s.phone) {
                    document.querySelectorAll('.footer-contact-line').forEach(el => {
                        if (el.querySelector('.fa-phone')) {
                            el.innerHTML = `<i class="fas fa-phone"></i> ${s.phone}`;
                        }
                    });
                }

                // WhatsApp links
                if (s.whatsapp || s.phone) {
                    const wa = s.whatsapp || `https://wa.me/${s.phone.replace(/[^0-9]/g, '')}`;
                    document.querySelectorAll('a[href*="wa.me"]').forEach(el => {
                        el.href = wa;
                    });
                    document.querySelectorAll('.floating-whatsapp').forEach(el => {
                        el.href = wa;
                    });
                }

                // Contact panel details
                if (s.address) {
                    const el = document.querySelector('.cp-info-item .fa-store');
                    if (el) {
                        const span = el.closest('.cp-info-item')?.querySelector('.cp-text span');
                        if (span) span.textContent = s.address;
                    }
                }
                if (s.phone) {
                    const el = document.querySelector('.cp-info-item .fa-phone');
                    if (el) {
                        const span = el.closest('.cp-info-item')?.querySelector('.cp-text span');
                        if (span) span.textContent = s.phone;
                    }
                }
                if (s.email) {
                    const el = document.querySelector('.cp-info-item .fa-envelope');
                    if (el) {
                        const span = el.closest('.cp-info-item')?.querySelector('.cp-text span');
                        if (span) span.textContent = s.email;
                    }
                }
                if (s.businessHours) {
                    const el = document.querySelector('.cp-hours-grid');
                    if (el && !el.hasAttribute('data-api-set')) {
                        el.setAttribute('data-api-set', '1');
                        el.innerHTML = `<span class="day">Hours</span><span class="time">${s.businessHours}</span>`;
                    }
                }

                // Copyright
                if (s.copyright) {
                    document.querySelectorAll('.footer-bottom').forEach(el => {
                        el.textContent = s.copyright;
                    });
                    document.querySelectorAll('.drawer-footer p').forEach(el => {
                        el.textContent = s.copyright;
                    });
                }

                // Delivery fee
                if (s.deliveryFee !== undefined) {
                    window.DELIVERY_FEE = s.deliveryFee;
                }
                if (s.freeDeliveryThreshold !== undefined) {
                    window.FREE_DELIVERY_THRESHOLD = s.freeDeliveryThreshold;
                }
                if (s.currencySymbol) {
                    window.CURRENCY_SYMBOL = s.currencySymbol;
                }

            } catch (e) { console.error('Settings load error', e); }
        }

        // ============================================================
        // CATEGORIES — build nav, filters, footer links from API
        // ============================================================
        async function loadCategories() {
            try {
                const res = await fetch(`${API_URL}/categories`);
                if (!res.ok) return;
                const json = await res.json();
                const categories = json.data || json || [];
                if (!categories.length) return;

                const published = categories.filter(c => c.status === 'published');

                // --- Build desktop navigation ---
                const navBar = document.getElementById('mainNav');
                if (navBar) {
                    const homeLink = navBar.querySelector('a[data-page="home"]');
                    const aboutLink = navBar.querySelector('a[href="/about.html"]');
                    const contactLink = document.getElementById('contactNav');

                    // Remove old dynamic dropdowns
                    navBar.querySelectorAll('.dropdown[data-category]').forEach(el => el.remove());

                    // Insert new ones
                    published.forEach(cat => {
                        const div = document.createElement('div');
                        div.className = 'dropdown';
                        div.dataset.category = cat.slug;
                        const name = cat.name.toUpperCase();
                        const imgSrc = cat.image || `https://placehold.co/400x180/FAF9F6/C8A35A?text=${encodeURIComponent(cat.name)}`;
                        div.innerHTML =
                            `<a href="#" class="dropdown-toggle">${name} <span class="plus-icon">+</span></a>` +
                            `<div class="dropdown-content">` +
                            `<div class="dropdown-col"><h4>${cat.name}</h4><a href="#" data-filter="${cat.slug}" class="nav-filter-link">All ${cat.name}</a></div>` +
                            `<div class="dropdown-banner"><img src="${imgSrc}" alt="${cat.name}" loading="lazy" /><div class="banner-text">${cat.name}</div><div class="banner-sub">${cat.description || 'Shop now'}</div></div>` +
                            `</div>`;
                        if (contactLink) navBar.insertBefore(div, contactLink);
                        else navBar.appendChild(div);
                    });
                }

                // --- Build drawer navigation ---
                const drawerNav = document.querySelector('.drawer-nav');
                if (drawerNav) {
                    const drawerHome = document.getElementById('drawerHome');
                    const drawerContact = document.getElementById('drawerContact');

                    // Remove old category dropdowns
                    drawerNav.querySelectorAll('.drawer-dropdown').forEach(el => el.remove());

                    // Insert new ones
                    published.forEach(cat => {
                        const div = document.createElement('div');
                        div.className = 'drawer-dropdown';
                        const id = 'drawerCat_' + cat.slug.replace(/[^a-zA-Z0-9]/g, '_');
                        div.innerHTML =
                            `<span class="drawer-toggle" data-target="${id}">${cat.name} <span class="arrow"><i class="fas fa-chevron-down"></i></span></span>` +
                            `<div class="drawer-sub" id="${id}">` +
                            `<a href="#" data-filter="${cat.slug}" class="drawer-filter-link">All ${cat.name}</a>` +
                            `</div>`;
                        if (drawerContact) drawerNav.insertBefore(div, drawerContact);
                        else drawerNav.appendChild(div);
                    });

                    // Re-bind drawer dropdown toggles
                    document.querySelectorAll('.drawer-toggle').forEach(toggle => {
                        toggle.addEventListener('click', function () {
                            const targetId = this.dataset.target;
                            const sub = document.getElementById(targetId);
                            if (sub) {
                                sub.classList.toggle('open');
                                this.querySelector('.arrow')?.classList.toggle('open');
                            }
                        });
                    });
                }

                // --- Build filter buttons ---
                const filterBar = document.querySelector('.filter-bar .filter-group:first-child');
                if (filterBar) {
                    // Keep "All" button, remove hardcoded category buttons
                    filterBar.querySelectorAll('.filter-btn:not([data-filter="all"])').forEach(el => el.remove());
                    const allBtn = filterBar.querySelector('.filter-btn[data-filter="all"]');

                    published.forEach(cat => {
                        const btn = document.createElement('button');
                        btn.className = 'filter-btn';
                        btn.dataset.filter = cat.slug;
                        btn.dataset.gender = '';
                        btn.textContent = cat.name;
                        if (allBtn) filterBar.appendChild(btn);
                    });

                    // Re-bind filter button clicks
                    document.querySelectorAll('.filter-btn[data-filter]').forEach(btn => {
                        btn.addEventListener('click', function () {
                            document.querySelectorAll('.filter-btn[data-filter]').forEach(b => b.classList.remove('active'));
                            this.classList.add('active');
                            currentFilter = this.dataset.filter;
                            loadProducts(currentFilter, currentGender);
                        });
                    });

                    // --- Nav dropdown sub-links: filter products ---
                    document.querySelectorAll('.nav-filter-link[data-filter]').forEach(link => {
                        link.addEventListener('click', function(e) {
                            e.preventDefault();
                            const filter = this.dataset.filter;
                            currentFilter = filter;
                            document.querySelectorAll('.filter-btn[data-filter]').forEach(b => b.classList.toggle('active', b.dataset.filter === filter));
                            loadProducts(currentFilter, currentGender);
                            document.querySelector('.products-section')?.scrollIntoView({ behavior: 'smooth' });
                        });
                    });

                    // --- Drawer sub-links: filter products ---
                    document.querySelectorAll('.drawer-filter-link[data-filter]').forEach(link => {
                        link.addEventListener('click', function(e) {
                            e.preventDefault();
                            const filter = this.dataset.filter;
                            currentFilter = filter;
                            document.querySelectorAll('.filter-btn[data-filter]').forEach(b => b.classList.toggle('active', b.dataset.filter === filter));
                            loadProducts(currentFilter, currentGender);
                            closeDrawerFn();
                            setTimeout(() => document.querySelector('.products-section')?.scrollIntoView({ behavior: 'smooth' }), 300);
                        });
                    });
                }

                // --- Build footer "Shop" links ---
                const footerShop = document.querySelector('.footer-grid div:nth-child(2) ul');
                if (footerShop) {
                    // Remove old shop links (keep Home)
                    const homeLi = footerShop.querySelector('li:first-child');
                    footerShop.innerHTML = '';
                    if (homeLi) footerShop.appendChild(homeLi);

                    published.forEach(cat => {
                        const li = document.createElement('li');
                        li.innerHTML = `<a href="#" data-category="${cat.slug}" class="footer-link">${cat.name}</a>`;
                        footerShop.appendChild(li);
                    });

                    // Re-bind footer category clicks
                    document.querySelectorAll('.footer-link[data-category]').forEach(link => {
                        link.addEventListener('click', function (e) {
                            e.preventDefault();
                            const cat = this.dataset.category;
                            document.getElementById('productsSection')?.scrollIntoView({ behavior: 'smooth' });
                            document.querySelectorAll('.filter-btn[data-filter]').forEach(b => {
                                b.classList.toggle('active', b.dataset.filter === cat);
                            });
                            currentFilter = cat;
                            currentGender = null;
                            applyFilterAndSort();
                            showToast(`🛍️ ${cat.replace(/-/g, ' ').toUpperCase()}`, 'info');
                        });
                    });
                }

            } catch (e) { console.error('Categories load error', e); }
        }

        // ============================================================
        // POPULAR SEARCH TAGS — populate from categories
        // ============================================================
        async function loadSearchTags() {
            const container = document.getElementById('popularSearchTags');
            if (!container) return;
            try {
                const res = await fetch(`${API_URL}/categories`);
                if (!res.ok) return;
                const json = await res.json();
                const categories = json.data || json || [];
                const published = categories.filter(c => c.status === 'published');
                if (!published.length) {
                    container.innerHTML = '<span class="search-tag" data-search="Dresses">Dresses</span><span class="search-tag" data-search="Sneakers">Sneakers</span>';
                    bindSearchTags();
                    return;
                }
                container.innerHTML = published.map(c =>
                    `<span class="search-tag" data-search="${c.name}">${c.name}</span>`
                ).join('');
                bindSearchTags();
            } catch (e) {
                container.innerHTML = '<span class="search-tag" data-search="Dresses">Dresses</span><span class="search-tag" data-search="Sneakers">Sneakers</span>';
                bindSearchTags();
            }
        }

        function bindSearchTags() {
            document.querySelectorAll('.search-tag').forEach(tag => {
                tag.addEventListener('click', () => {
                    const q = tag.dataset.search;
                    if (searchOverlayInput) searchOverlayInput.value = q;
                    performLiveSearch(q);
                    addRecentSearch(q);
                });
            });
        }

        // ============================================================
        // PRODUCTS
        // ============================================================
        let currentPage = 1;
        let totalPages = 1;
        let isLoadingMore = false;
        let lastFetchFilter = 'all';
        let lastFetchGender = null;
        let lastFetchSearch = '';
        let currentProducts = [];

        async function fetchProducts(filter = 'all', gender = null, search = '', page = 1, limit = 20, sortBy = 'newest') {
            try {
                const params = new URLSearchParams();
                if (filter !== 'all') params.append('category', filter);
                if (gender) params.append('gender', gender);
                if (search) params.append('search', search);
                const apiSortMap = { 'newest': 'newest', 'price-low': 'price_asc', 'price-high': 'price_desc', 'popular': 'popular', 'name-az': 'name' };
                params.append('sortBy', apiSortMap[sortBy] || 'newest');
                params.append('page', page);
                params.append('limit', limit);
                const url = `${API_URL}/products?${params}`;
                const res = await fetch(url);
                if (!res.ok) throw new Error('Failed');
                const json = await res.json();
                const products = Array.isArray(json) ? json : (json.data || []);
                const pag = json.pagination || { page: 1, pages: 1, total: products.length };
                return { products, pagination: pag };
            } catch (e) {
                showToast('Could not load products', 'error');
                return { products: [], pagination: { page: 1, pages: 1, total: 0 } };
            }
        }

        function getImageHtml(p) {
            if (!p.images || !p.images.length) {
                return `<img src="https://placehold.co/400x533/FAF9F6/C8A35A?text=Product" alt="${p.name}" loading="lazy" decoding="async" />`;
            }
            if (p.images.length === 1) {
                const img = getOptimizedImage(p.images[0], 'card');
                const thumb = getOptimizedImage(p.images[0], 'thumb');
                return `<img src="${img || 'https://placehold.co/400x533/FAF9F6/C8A35A?text=Product'}" alt="${p.name}" loading="lazy" decoding="async" ${thumb ? `style="background-image:url(${thumb});background-size:cover;"` : ''} />`;
            }
            // Multiple images - carousel
            let slides = p.images.map((img, i) => {
                const src = getOptimizedImage(img, 'card');
                return `<div class="carousel-slide ${i === 0 ? 'active' : ''}"><img src="${src || 'https://placehold.co/400x533/FAF9F6/C8A35A?text=Product'}" alt="${p.name} ${i + 1}" loading="lazy" decoding="async" /></div>`;
            }).join('');
            let dots = p.images.map((_, i) => `<span class="${i === 0 ? 'active' : ''}"></span>`).join('');
            return `
                <div class="carousel-container">
                    ${slides}
                    ${p.images.length > 1 ? `<button class="carousel-arrow left" aria-label="Previous"><i class="fas fa-chevron-left"></i></button><button class="carousel-arrow right" aria-label="Next"><i class="fas fa-chevron-right"></i></button>` : ''}
                    ${p.images.length > 1 ? `<div class="carousel-dots">${p.images.map((_, i) => `<span class="${i === 0 ? 'active' : ''}"></span>`).join('')}</div>` : ''}
            `;
        }

        function renderSkeletonCards(count = 10) {
            if (!productsGrid) return;
            productsGrid.innerHTML = Array.from({length: count}, () => `
                <div class="skeleton-card">
                    <div class="skeleton-image"></div>
                    <div class="skeleton-info">
                        <div class="skeleton-line short"></div>
                        <div class="skeleton-line medium"></div>
                        <div class="skeleton-line short"></div>
                        <div class="skeleton-line"></div>
                        <div class="skeleton-line price"></div>
                    </div>
                </div>
            `).join('');
        }

        function buildProductCard(p) {
            const inWish = isInWishlist(p._id);
            const inStock = isProductAvailable(p);
            const effectiveStock = getEffectiveStock(p);
            const original = p.originalPrice ? `<span class="original">Ksh ${p.originalPrice.toLocaleString()}</span>` : '';
            const discount = p.originalPrice && p.originalPrice > p.price
                ? Math.round(((p.originalPrice - p.price) / p.originalPrice) * 100)
                : 0;
            const discountBadge = discount ? `<span class="discount">${discount}%</span>` : '';
            const badges = [];
            if (p.flashSale && p.flashSaleEnd && new Date(p.flashSaleEnd) > new Date()) badges.push('<span class="mini-badge flash-sale">Flash Sale</span>');
            if (p.sponsored) badges.push('<span class="mini-badge sponsored">Sponsored</span>');
            if (p.isNewArrival) badges.push('<span class="mini-badge new">New</span>');
            if (p.isBestSeller) badges.push('<span class="mini-badge hot">Best Seller</span>');
            if (p.featured) badges.push('<span class="mini-badge featured">Featured</span>');
            if (p.limitedAvailable && p.limitedPieces > 0 && p.limitedPieces <= 10) badges.push(`<span class="mini-badge limited">Only ${p.limitedPieces} left</span>`);
            if (p.installmentEligible) badges.push('<span class="mini-badge installment">Lipa Mdogo Mdogo</span>');
            if (p.preOrder) badges.push('<span class="mini-badge pre-order">Pre-Order</span>');
            const rating = p.rating || 0;
            const fullStars = Math.floor(rating);
            const hasHalf = rating % 1 >= 0.5;
            const stars = Array.from({length: 5}, (_, i) =>
                `<i class="fas fa-star ${i < fullStars ? '' : (i === fullStars && hasHalf ? 'half' : 'empty')}"></i>`
            ).join('');
            const reviewCount = p.totalReviews || p.reviewCount || 0;
            const imageHtml = p.images && p.images.length > 1
                ? `<div class="carousel-container">${p.images.map((img, i) => `<div class="carousel-slide ${i === 0 ? 'active' : ''}"><img src="${getOptimizedImage(img, 'card') || 'https://placehold.co/400x533/FAF9F6/C8A35A?text=Product'}" alt="${p.name} ${i + 1}" loading="lazy" decoding="async" /></div>`).join('')}<button class="carousel-arrow left" aria-label="Previous"><i class="fas fa-chevron-left"></i></button><button class="carousel-arrow right" aria-label="Next"><i class="fas fa-chevron-right"></i></button><div class="carousel-dots">${p.images.map((_, i) => `<span class="${i === 0 ? 'active' : ''}"></span>`).join('')}</div></div>`
                : `<img src="${p.images?.[0] ? getOptimizedImage(p.images[0], 'card') : 'https://placehold.co/400x533/FAF9F6/C8A35A?text=Product'}" alt="${p.name}" loading="lazy" decoding="async" />`;
            const deliveryEstimate = p.deliveryEstimate || 'Delivery in 2-5 days';
            return `
                <div class="product-card" data-id="${p._id}" tabindex="0" role="article" aria-label="${p.name}">
                    <div class="product-image">
                        ${imageHtml}
                        <div class="quick-actions">
                            <button class="compare-btn" data-id="${p._id}" aria-label="Add to compare" title="Compare"><i class="fas fa-exchange-alt"></i></button>
                            <button class="share-btn" data-id="${p._id}" aria-label="Share product" title="Share"><i class="fas fa-share-alt"></i></button>
                        </div>
                        <button class="wishlist-btn ${inWish ? 'liked' : ''}" data-id="${p._id}" aria-label="${inWish ? 'Remove from wishlist' : 'Add to wishlist'}"><i class="fa${inWish ? 's' : 'r'} fa-heart"></i></button>
                        ${p.flashSale && p.flashSaleEnd && new Date(p.flashSaleEnd) > new Date() ? '<span class="badge flash-sale">FLASH SALE</span>' : ''}
                        ${p.featured ? '<span class="badge featured-badge">Featured</span>' : ''}
                        ${p.sponsored ? '<span class="badge sponsored">Sponsored</span>' : ''}
                        ${p.isNewArrival ? '<span class="badge new">New</span>' : ''}
                        ${p.isBestSeller ? '<span class="badge hot">Best Seller</span>' : ''}
                        ${p.limitedAvailable && p.limitedPieces > 0 && p.limitedPieces <= 10 ? `<span class="badge limited">Only ${p.limitedPieces} left!</span>` : ''}
                        ${p.preOrder ? '<span class="badge pre-order">Pre-Order</span>' : ''}
                        ${!inStock ? '<span class="badge out">OUT OF STOCK</span>' : ''}
                        <button class="quick-view" data-id="${p._id}" aria-label="Quick view ${p.name}">Quick View</button>
                    </div>
                    <div class="product-info">
                        ${p.brand ? `<div class="brand">${p.brand}</div>` : ''}
                        <div class="product-name">${escHtml(p.name)}</div>
                        <div class="rating" aria-label="Rating ${rating.toFixed(1)} out of 5">
                            <div class="stars">${stars}</div>
                            ${rating > 0 ? `<span class="score">${rating.toFixed(1)}</span><span class="count">(${reviewCount})</span>` : ''}
                        </div>
                        <div class="badges-row">${badges.join('')}</div>
                        <div class="stock-status ${inStock ? (effectiveStock <= 5 && effectiveStock > 0 ? 'low' : 'in-stock') : 'out'}">${inStock ? (effectiveStock <= 5 && effectiveStock > 0 ? 'Only ' + effectiveStock + ' left' : 'In Stock') : 'Out of Stock'}</div>
                        <div class="delivery-estimate"><i class="fas fa-truck"></i>${deliveryEstimate}</div>
                        <div class="product-price">
                            <span class="current">Ksh ${(p.flashSale && p.flashSalePrice ? p.flashSalePrice : p.price).toLocaleString()}</span>
                            ${original}
                            ${discountBadge}
                        </div>
                        ${p.installmentEligible && p.installmentPrice ? `<div class="installment-info">or ${Math.ceil(p.price / (p.installmentPrice || 1))}x Ksh ${(p.installmentPrice || p.price).toLocaleString()}/mo</div>` : ''}
                        <div class="card-actions">
                            <button class="add-to-cart" data-id="${p._id}" ${!inStock ? 'disabled' : ''} aria-label="Add ${p.name} to cart"><i class="fas fa-shopping-bag"></i> <span>${inStock ? 'Add' : 'Out of Stock'}</span></button>
                            <button class="buy-now" data-id="${p._id}" ${!inStock ? 'disabled' : ''} aria-label="Buy ${p.name} now"><i class="fas fa-bolt"></i></button>
                        </div>
                    </div>
                </div>`;
        }

        function bindProductCardEvents(container) {
            container.querySelectorAll('.product-card').forEach(card => {
                initCarousel(card);
                card.addEventListener('click', e => {
                    if (e.target.closest('button')) return;
                    openQuickView(card.dataset.id);
                });
                card.addEventListener('keydown', e => {
                    if (e.key === 'Enter' && !e.target.closest('button')) openQuickView(card.dataset.id);
                });
            });
            container.querySelectorAll('.add-to-cart').forEach(btn => {
                btn.addEventListener('click', async e => {
                    e.stopPropagation();
                    if (btn.disabled) return;
                    const cached = currentProducts.find(p => p._id === btn.dataset.id);
                    if (cached) { addToCart(cached); }
                    else {
                        try { const res = await fetch(`${API_URL}/products/${btn.dataset.id}`); const raw = await res.json(); addToCart(raw.data || raw); } catch (err) { showToast('Error adding to cart', 'error'); }
                    }
                });
            });
            container.querySelectorAll('.buy-now').forEach(btn => {
                btn.addEventListener('click', async e => {
                    e.stopPropagation();
                    if (btn.disabled) return;
                    const cached = currentProducts.find(p => p._id === btn.dataset.id);
                    const product = cached || await (async () => { try { const res = await fetch(`${API_URL}/products/${btn.dataset.id}`); const raw = await res.json(); return raw.data || raw; } catch (err) { showToast('Error adding to cart', 'error'); return null; } })();
                    if (product) { addToCart(product); openCheckout(); }
                });
            });
            container.querySelectorAll('.wishlist-btn').forEach(btn => {
                btn.addEventListener('click', async e => {
                    e.stopPropagation();
                    try {
                        const res = await fetch(`${API_URL}/products/${btn.dataset.id}`);
                        const raw = await res.json();
                        await toggleWishlist(raw.data || raw);
                    } catch (err) { showToast('Error updating wishlist', 'error'); }
                });
            });
            container.querySelectorAll('.quick-view').forEach(btn => {
                btn.addEventListener('click', e => {
                    e.stopPropagation();
                    openQuickView(btn.dataset.id);
                });
            });
            container.querySelectorAll('.compare-btn').forEach(btn => {
                btn.addEventListener('click', e => {
                    e.stopPropagation();
                    showToast('Compare feature coming soon!', 'info');
                });
            });
            container.querySelectorAll('.share-btn').forEach(btn => {
                btn.addEventListener('click', e => {
                    e.stopPropagation();
                    const url = `${window.location.origin}/#product-${btn.dataset.id}`;
                    if (navigator.share) {
                        navigator.share({ title: 'Check this out!', url });
                    } else {
                        navigator.clipboard.writeText(url).then(() => showToast('Link copied!', 'success'));
                    }
                });
            });
        }

        function renderProducts(products, append = false) {
            if (!products) products = currentProducts;
            else if (!append) currentProducts = products;
            else currentProducts = currentProducts.concat(products);
            if (!currentProducts.length && !append) {
                productsGrid.innerHTML =
                    `<div style="grid-column:1/-1;text-align:center;padding:40px 0;color:var(--text-secondary);">No products found.</div>`;
                document.getElementById('loadMoreWrap').style.display = 'none';
                return;
            }
            if (append) {
                const fragment = document.createRange().createContextualFragment(products.map(p => buildProductCard(p)).join(''));
                while (fragment.firstChild) productsGrid.appendChild(fragment.firstChild);
            } else {
                productsGrid.innerHTML = currentProducts.map(p => buildProductCard(p)).join('');
            }
            document.getElementById('loadMoreWrap').style.display = (currentPage < totalPages) ? 'block' : 'none';
            document.getElementById('loadMoreBtn').style.display = (currentPage < totalPages) ? '' : 'none';

            bindProductCardEvents(productsGrid);
        }

        // Carousel initialization - GLOBAL function for all product cards
        function initCarousel(card) {
            const container = card.querySelector('.carousel-container');
            if (!container) return;
            const slides = container.querySelectorAll('.carousel-slide');
            const dots = container.querySelectorAll('.carousel-dots span');
            const arrows = container.querySelectorAll('.carousel-arrow');
            if (!slides.length) return;
            let current = 0;
            function goTo(index) {
                slides.forEach((s, i) => s.classList.toggle('active', i === index));
                dots.forEach((d, i) => d.classList.toggle('active', i === index));
                current = index;
            }
            arrows.forEach(btn => {
                btn.addEventListener('click', e => {
                    e.stopPropagation();
                    let next = current + (btn.classList.contains('right') ? 1 : -1);
                    if (next >= slides.length) next = 0;
                    if (next < 0) next = slides.length - 1;
                    goTo(next);
                });
            });
            dots.forEach((dot, i) => {
                dot.addEventListener('click', e => {
                    e.stopPropagation();
                    goTo(i);
                });
            });
            // Touch swipe
            let startX = 0;
            container.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
            container.addEventListener('touchend', e => {
                const diff = startX - e.changedTouches[0].clientX;
                if (Math.abs(diff) > 50) {
                    let next = current + (diff > 0 ? 1 : -1);
                    if (next >= slides.length) next = 0;
                    if (next < 0) next = slides.length - 1;
                    goTo(next);
                }
            }, { passive: true });
        }

        async function loadProducts(filter = 'all', gender = null, search = '') {
            currentPage = 1;
            lastFetchFilter = filter;
            lastFetchGender = gender;
            lastFetchSearch = search;
            renderSkeletonCards();
            const { products, pagination } = await fetchProducts(filter, gender, search, 1, 20, currentSort);
            currentPage = pagination.page;
            totalPages = pagination.pages;
            renderProducts(products);
        }

        async function loadMore() {
            if (isLoadingMore || currentPage >= totalPages) return;
            isLoadingMore = true;
            const btn = document.getElementById('loadMoreBtn');
            const spinner = document.getElementById('loadMoreSpinner');
            btn.style.display = 'none';
            spinner.style.display = 'block';
            const nextPage = currentPage + 1;
            const { products, pagination } = await fetchProducts(lastFetchFilter, lastFetchGender, lastFetchSearch, nextPage, 20, currentSort);
            currentPage = pagination.page;
            totalPages = pagination.pages;
            renderProducts(products, true);
            isLoadingMore = false;
            spinner.style.display = 'none';
        }

        document.getElementById('loadMoreBtn').addEventListener('click', loadMore);

        // ============================================================
        // QUICK VIEW
        // ============================================================
        let currentQVProduct = null;

        async function openQuickView(id) {
            try {
                const res = await fetch(`${API_URL}/products/${id}`);
                if (!res.ok) throw new Error('Product not found');
                const raw = await res.json();
                const p = raw.data || raw;
                currentQVProduct = p;
                const inStock = isProductAvailable(p);
                const effectiveStock = getEffectiveStock(p);
                const original = p.originalPrice ? `<span class="original">Ksh ${p.originalPrice.toLocaleString()}</span>` : '';
                const discount = p.originalPrice && p.originalPrice > p.price
                    ? Math.round(((p.originalPrice - p.price) / p.originalPrice) * 100)
                    : 0;
                const discountBadge = discount ? `<span class="discount">${discount}%</span>` : '';
                const inStockHtml = inStock
                    ? (effectiveStock <= 5 && effectiveStock > 0
                        ? `<span class="stock-status low">Only ${effectiveStock} left</span>`
                        : '<span class="stock-status in-stock">In Stock</span>')
                    : '<span class="stock-status out">Out of Stock</span>';
                const rating = p.rating || 0;
                const fullStars = Math.floor(rating);
                const hasHalf = rating % 1 >= 0.5;
                const stars = Array.from({length: 5}, (_, i) =>
                    `<i class="fas fa-star ${i < fullStars ? '' : (i === fullStars && hasHalf ? 'half' : 'empty')}"></i>`
                ).join('');
                const reviewCount = p.reviewCount || 0;
                const starsHtml = Array.from({length: 5}, (_, i) =>
                    `<i class="fas fa-star ${i < fullStars ? '' : (i === fullStars && hasHalf ? 'half' : 'empty')}"></i>`
                ).join('');

                // Build image gallery for quick view
                let galleryHtml = '';
                if (p.images && p.images.length > 1) {
                    galleryHtml = `
                        <div class="qv-gallery">
                            <div class="qv-main-image">
                                <img id="qvMainImg" src="${p.images[0] ? getImageUrl(p.images[0]) : 'https://placehold.co/600x800/FAF9F6/C8A35A?text=Product'}" alt="${p.name}" />
                            </div>
                            <div class="qv-thumbnails">
                                ${p.images.map((img, i) => `<img src="${getImageUrl(img)}" alt="${p.name} ${i + 1}" class="${i === 0 ? 'active' : ''}" data-index="${i}" />`).join('')}
                            </div>
                        </div>`;
                } else {
                    galleryHtml = `<div class="qv-gallery"><div class="qv-main-image"><img id="qvMainImg" src="${p.images?.[0] ? getImageUrl(p.images[0]) : 'https://placehold.co/600x800/FAF9F6/C8A35A?text=Product'}" alt="${p.name}" /></div></div>`;
                }

                const badges = [];
                if (p.flashSale && p.flashSaleEnd && new Date(p.flashSaleEnd) > new Date()) badges.push('<span class="mini-badge flash-sale">⚡ Flash Sale</span>');
                if (p.sponsored) badges.push('<span class="mini-badge sponsored">Sponsored</span>');
                if (p.isNewArrival) badges.push('<span class="mini-badge new">New</span>');
                if (p.isBestSeller) badges.push('<span class="mini-badge hot">Best Seller</span>');
                if (p.featured) badges.push('<span class="mini-badge featured">Featured</span>');
                if (p.limitedAvailable && p.limitedPieces > 0 && p.limitedPieces <= 10) badges.push(`<span class="mini-badge limited">Only ${p.limitedPieces} left</span>`);
                if (p.installmentEligible) badges.push('<span class="mini-badge installment">Lipa Mdogo Mdogo</span>');
                if (p.preOrder) badges.push('<span class="mini-badge pre-order">Pre-Order</span>');

                qvContent.innerHTML = `
                    ${galleryHtml}
                    <div class="qv-info">
                        ${p.brand ? `<div class="brand">${escHtml(p.brand)}</div>` : ''}
                        <h2 class="qv-name">${escHtml(p.name)}</h2>
                        <div class="qv-rating">
                            <div class="stars">${Array.from({length: 5}, (_, i) => `<i class="fas fa-star ${i < fullStars ? '' : (i === fullStars && hasHalf ? 'half' : 'empty')}"></i>`).join('')}</div>
                            ${rating > 0 ? `<span class="score">${rating.toFixed(1)}</span><span class="count">(${reviewCount} reviews)</span>` : ''}
                        </div>
                        <div class="qv-badges">${badges.join('')}</div>
                        ${p.category ? `<div class="qv-category">${escHtml(p.category.replace('-', ' '))} ${p.gender ? '· ' + escHtml(p.gender) : ''}</div>` : ''}
                        <div class="qv-price">
                            Ksh ${(p.flashSale && p.flashSalePrice ? p.flashSalePrice : p.price).toLocaleString()}
                            ${p.originalPrice ? `<span class="original">Ksh ${p.originalPrice.toLocaleString()}</span>` : ''}
                            ${p.originalPrice && p.originalPrice > p.price ? `<span class="discount">${Math.round(((p.originalPrice - p.price) / p.originalPrice) * 100)}%</span>` : ''}
                        </div>
                        ${p.flashSale && p.flashSaleEnd && new Date(p.flashSaleEnd) > new Date() ? `<div style="color:var(--error);font-size:0.85rem;font-weight:600;margin:4px 0;">⚡ Flash sale ends: ${new Date(p.flashSaleEnd).toLocaleString()}</div>` : ''}
                        ${p.installmentEligible && p.installmentPrice ? `<div style="font-size:0.8rem;color:var(--text-secondary);margin:4px 0;background:var(--bg-secondary);padding:6px 10px;border-radius:4px;">💳 Lipa Mdogo Mdogo: ${Math.ceil(p.price / p.installmentPrice)}x Ksh ${p.installmentPrice.toLocaleString()}/mo</div>` : ''}
                        <div class="qv-stock ${inStock ? 'in-stock' : 'out'}">${inStock ? (effectiveStock <= 5 ? `Only ${effectiveStock} left` : 'In Stock') : 'Out of Stock'}</div>
                        ${p.shortDescription ? `<div style="font-size:0.85rem;color:var(--text-secondary);margin:8px 0;">${escHtml(p.shortDescription)}</div>` : ''}
                        ${p.description ? `<div class="qv-desc">${escHtml(p.description)}</div>` : ''}
                        ${p.sizes && p.sizes.length ? `
                            <div class="qv-sizes">
                                <label>Size</label>
                                <div class="size-chips">${p.sizes.map(s => `<button class="size-chip" data-size="${escHtml(s)}">${escHtml(s)}</button>`).join('')}</div>
                            </div>` : ''}
                        ${p.colors && p.colors.length ? `
                            <div class="qv-colors">
                                <label>Color</label>
                                <div class="color-chips">${p.colors.map(c => `<button class="color-chip" data-color="${escHtml(c)}" style="background:${escHtml(c)}"></button>`).join('')}</div>
                            </div>` : ''}
                        <div class="qv-qty">
                            <label>Quantity</label>
                            <div class="qty-selector">
                                <button class="qty-btn minus">-</button>
                                <input type="number" id="qvQty" value="1" min="1" max="${inStock ? effectiveStock : 0}" ${!inStock ? 'disabled' : ''} />
                                <button class="qty-btn plus">+</button>
                            </div>
                        </div>
                        <div class="qv-actions">
                            <button class="qv-btn add-to-cart" ${!inStock ? 'disabled' : ''} data-id="${p._id}"><i class="fas fa-shopping-bag"></i> Add to Cart</button>
                            <button class="qv-btn buy-now" ${!inStock ? 'disabled' : ''} data-id="${p._id}">Buy Now</button>
                            <button class="qv-btn wishlist ${isInWishlist(p._id) ? 'liked' : ''}" data-id="${p._id}"><i class="fa${isInWishlist(p._id) ? 's' : 'r'} fa-heart"></i></button>
                            <button class="qv-btn share"><i class="fas fa-share-alt"></i></button>
                        </div>
                        ${p.tags && p.tags.length ? `<div style="margin-top:12px;font-size:0.8rem;color:var(--text-secondary);"><strong>Tags:</strong> ${escHtml(p.tags.join(', '))}</div>` : ''}
                        <div class="qv-meta">
                            <div><strong>Category:</strong> ${escHtml(p.category || 'N/A')}</div>
                            ${p.brand ? `<div><strong>Brand:</strong> ${escHtml(p.brand)}</div>` : ''}
                            ${p.gender ? `<div><strong>Gender:</strong> ${escHtml(p.gender)}</div>` : ''}
                            ${p.material ? `<div><strong>Material:</strong> ${escHtml(p.material)}</div>` : ''}
                            ${p.sku ? `<div><strong>SKU:</strong> ${escHtml(p.sku)}</div>` : ''}
                        </div>
                        ${(p.specifications && p.specifications.length) ? `
                        <div style="margin-top:16px;border-top:1px solid var(--border-light);padding-top:12px;">
                            <h4 style="font-size:0.9rem;margin-bottom:8px;">Specifications</h4>
                            <table style="width:100%;font-size:0.8rem;border-collapse:collapse;">
                                ${p.specifications.map(s => `<tr><td style="padding:4px 8px;color:var(--text-secondary);border-bottom:1px solid var(--border-light);">${escHtml(s.key)}</td><td style="padding:4px 8px;border-bottom:1px solid var(--border-light);">${escHtml(s.value)}</td></tr>`).join('')}
                            </table>
                        </div>` : ''}
                        <div id="qvReviewsSection" style="margin-top:16px;border-top:1px solid var(--border-light);padding-top:12px;">
                            <h4 style="font-size:0.9rem;margin-bottom:8px;">Customer Reviews</h4>
                            <div id="qvReviewsList" style="font-size:0.85rem;color:var(--text-secondary);">Loading reviews...</div>
                            <div id="qvReviewForm" style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border-light);display:none;">
                                <p style="font-size:0.8rem;font-weight:600;margin-bottom:6px;">Write a Review</p>
                                <div id="qvStarRating" style="display:flex;gap:4px;margin-bottom:8px;cursor:pointer;">
                                    <i class="far fa-star" data-star="1" style="font-size:1.1rem;color:var(--color-gold);"></i>
                                    <i class="far fa-star" data-star="2" style="font-size:1.1rem;color:var(--color-gold);"></i>
                                    <i class="far fa-star" data-star="3" style="font-size:1.1rem;color:var(--color-gold);"></i>
                                    <i class="far fa-star" data-star="4" style="font-size:1.1rem;color:var(--color-gold);"></i>
                                    <i class="far fa-star" data-star="5" style="font-size:1.1rem;color:var(--color-gold);"></i>
                                </div>
                                <input type="text" id="qvReviewTitle" placeholder="Review title (optional)" style="width:100%;padding:8px 12px;border:1px solid var(--border-light);border-radius:4px;font-size:0.8rem;margin-bottom:6px;" />
                                <textarea id="qvReviewComment" rows="2" placeholder="Share your experience..." style="width:100%;padding:8px 12px;border:1px solid var(--border-light);border-radius:4px;font-size:0.8rem;resize:vertical;margin-bottom:6px;"></textarea>
                                <button id="qvSubmitReview" style="padding:8px 20px;background:var(--color-gold);color:#fff;border:none;border-radius:4px;font-size:0.75rem;font-weight:600;letter-spacing:0.5px;cursor:pointer;">Submit Review</button>
                            </div>
                        </div>
                        <div id="qvQASection" style="margin-top:16px;border-top:1px solid var(--border-light);padding-top:12px;">
                            <h4 style="font-size:0.9rem;margin-bottom:8px;">Questions & Answers</h4>
                            <div id="qvQAList" style="font-size:0.85rem;color:var(--text-secondary);">Loading Q&A...</div>
                            <div id="qvQAForm" style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border-light);">
                                <p style="font-size:0.8rem;font-weight:600;margin-bottom:6px;">Ask a Question</p>
                                <div style="display:flex;gap:8px;">
                                    <input type="text" id="qvQuestionText" placeholder="Type your question..." style="flex:1;padding:8px 12px;border:1px solid var(--border-light);border-radius:4px;font-size:0.8rem;" />
                                    <button id="qvSubmitQuestion" style="padding:8px 16px;background:var(--text-primary);color:#fff;border:none;border-radius:4px;font-size:0.75rem;font-weight:600;cursor:pointer;">Ask</button>
                                </div>
                            </div>
                        </div>
                        <div id="qvRecommended" style="margin-top:16px;border-top:1px solid var(--border-light);padding-top:12px;">
                            <h4 style="font-size:0.9rem;margin-bottom:8px;">You May Also Like</h4>
                            <div id="qvRecommendedList" style="display:flex;gap:12px;overflow-x:auto;padding-bottom:8px;"></div>
                        </div>
                    `;
                document.getElementById('qvContent').innerHTML = qvContent.innerHTML;

                // Load reviews
                loadQVReviews(p._id);
                loadQVQA(p._id);
                loadQVRecommended(p._id);
                showReviewFormIfLoggedIn();

                // Track recently viewed
                if (typeof window.trackRecentlyViewed === 'function') {
                    window.trackRecentlyViewed(p);
                }

                // Initialize thumbnails
                document.querySelectorAll('.qv-thumbnails img').forEach(thumb => {
                    thumb.addEventListener('click', () => {
                        document.querySelectorAll('.qv-thumbnails img').forEach(t => t.classList.remove('active'));
                        thumb.classList.add('active');
                        document.getElementById('qvMainImg').src = thumb.src;
                    });
                });

                // Quantity selector
                const qtyInput = document.getElementById('qvQty');
                document.querySelectorAll('.qty-btn.minus').forEach(btn => {
                    btn.addEventListener('click', () => { const v = parseInt(qtyInput.value) || 1; if (v > 1) qtyInput.value = v - 1; });
                });
                document.querySelectorAll('.qty-btn.plus').forEach(btn => {
                    btn.addEventListener('click', () => { const max = parseInt(qtyInput.max) || 99; const v = parseInt(qvQty.value) || 1; if (v < max) qtyInput.value = v + 1; });
                });

                // Size/color selection
                document.querySelectorAll('.size-chip').forEach(chip => {
                    chip.addEventListener('click', () => {
                        document.querySelectorAll('.size-chip').forEach(c => c.classList.remove('selected'));
                        chip.classList.add('selected');
                    });
                });
                document.querySelectorAll('.color-chip').forEach(chip => {
                    chip.addEventListener('click', () => {
                        document.querySelectorAll('.color-chip').forEach(c => c.classList.remove('selected'));
                        chip.classList.add('selected');
                    });
                });

                // QV actions
                document.querySelectorAll('.qv-btn.add-to-cart').forEach(btn => {
                    btn.addEventListener('click', e => {
                        e.stopPropagation();
                        const p = currentQVProduct;
                        const qty = parseInt(document.getElementById('qvQty').value) || 1;
                        const size = document.querySelector('.size-chip.selected')?.dataset.size;
                        const color = document.querySelector('.color-chip.selected')?.dataset.color;
                        if (p.sizes && p.sizes.length && !size) { showToast('Please select a size', 'error'); return; }
                        const item = { ...p, quantity: qty, size, color };
                        addToCart(item);
                        closeQuickView();
                    });
                });
                document.querySelectorAll('.qv-btn.buy-now').forEach(btn => {
                    btn.addEventListener('click', e => {
                        e.stopPropagation();
                        const p = currentQVProduct;
                        const qty = parseInt(document.getElementById('qvQty').value) || 1;
                        const size = document.querySelector('.size-chip.selected')?.dataset.size;
                        const color = document.querySelector('.color-chip.selected')?.dataset.color;
                        if (p.sizes && p.sizes.length && !size) { showToast('Please select a size', 'error'); return; }
                        const item = { ...p, quantity: qty, size, color };
                        addToCart(item);
                        closeQuickView();
                        openCheckout();
                    });
                });
                document.querySelectorAll('.qv-btn.wishlist').forEach(btn => {
                    btn.addEventListener('click', e => {
                        e.stopPropagation();
                        if (currentQVProduct) toggleWishlist(currentQVProduct);
                    });
                });
                document.querySelectorAll('.qv-btn.share').forEach(btn => {
                    btn.addEventListener('click', e => {
                        e.stopPropagation();
                        if (navigator.share) {
                            navigator.share({ title: currentQVProduct.name, text: 'Check out this product!', url: window.location.href });
                        } else {
                            navigator.clipboard.writeText(window.location.href);
                            showToast('Link copied to clipboard!');
                        }
                    });
                });

                quickViewOverlay.classList.add('show');
                document.body.classList.add('no-scroll');

                // SEO: Dynamic product JSON-LD
                const existingLD = document.getElementById('product-jsonld');
                if (existingLD) existingLD.remove();
                const ld = document.createElement('script');
                ld.type = 'application/ld+json';
                ld.id = 'product-jsonld';
                const prodUrl = `${window.location.origin}/#product-${p._id}`;
                ld.textContent = JSON.stringify({
                    '@context': 'https://schema.org',
                    '@type': 'Product',
                    name: p.name,
                    description: p.description || p.shortDescription || '',
                    image: p.images || [],
                    brand: { '@type': 'Brand', name: p.brand || 'Trendy Wardrobe' },
                    sku: p.sku || '',
                    offers: {
                        '@type': 'Offer',
                        price: (p.flashSale && p.flashSalePrice ? p.flashSalePrice : p.price),
                        priceCurrency: 'KES',
                        availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
                        url: prodUrl,
                        seller: { '@type': 'Organization', name: 'Trendy Wardrobe' }
                    },
                    aggregateRating: p.rating > 0 ? { '@type': 'AggregateRating', ratingValue: p.rating, reviewCount: p.totalReviews || 0 } : undefined,
                    category: p.category || ''
                }, null, 2);
                document.head.appendChild(ld);

                // SEO: Update meta tags for product
                document.title = `${p.name} — Trendy Wardrobe | Ksh ${p.price.toLocaleString()}`;
                const metaDesc = document.querySelector('meta[name="description"]');
                if (metaDesc) metaDesc.content = (p.description || p.shortDescription || `${p.name} - Premium fashion from Trendy Wardrobe`).substring(0, 160);
                const ogTitle = document.querySelector('meta[property="og:title"]');
                if (ogTitle) ogTitle.content = `${p.name} — Trendy Wardrobe`;
                const ogDesc = document.querySelector('meta[property="og:description"]');
                if (ogDesc) ogDesc.content = (p.description || '').substring(0, 200);
                const ogImage = document.querySelector('meta[property="og:image"]');
                if (ogImage && p.images?.[0]) ogImage.content = getImageUrl(p.images[0]);
                const ogUrl = document.querySelector('meta[property="og:url"]');
                if (ogUrl) ogUrl.content = prodUrl;
            } catch (e) { showToast('Could not load product', 'error'); }
        }

        function closeQuickView() {
            quickViewOverlay.classList.remove('show');
            document.body.classList.remove('no-scroll');
            // SEO: Restore default meta tags
            document.title = 'Trendy_Wardrobe — Luxury Fashion | Premium Trench Coats, Wardrobe & Shoes';
            const metaDesc = document.querySelector('meta[name="description"]');
            if (metaDesc) metaDesc.content = 'Trendy Wardrobe — Nairobi\'s premier luxury fashion store. Shop executive trench coats, wardrobe essentials, and designer shoes.';
            const ogTitle = document.querySelector('meta[property="og:title"]');
            if (ogTitle) ogTitle.content = 'Trendy Wardrobe — Luxury Fashion';
            const ogUrl = document.querySelector('meta[property="og:url"]');
            if (ogUrl) ogUrl.content = window.location.origin + '/';
            const prodLD = document.getElementById('product-jsonld');
            if (prodLD) prodLD.remove();
        }

        closeQV && closeQV.addEventListener('click', closeQuickView);
        quickViewOverlay && quickViewOverlay.addEventListener('click', e => {
            if (e.target === quickViewOverlay) closeQuickView();
        });
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && quickViewOverlay.classList.contains('show')) closeQuickView();
        });

        // ============================================================
        // SEARCH
        // ============================================================
        function performSearch(query) {
            const q = query || searchInput.value.trim();
            if (q.length > 0) {
                loadProducts('all', null, q);
                if (searchOverlay.classList.contains('open')) {
                    searchOverlay.classList.remove('open');
                    document.body.classList.remove('no-scroll');
                }
            } else {
                loadProducts();
            }
        }

        searchBtn.addEventListener('click', () => performSearch());
        searchInput.addEventListener('keypress', e => { if (e.key === 'Enter') performSearch(); });

        // Search icon mobile — opens search overlay with recent searches
        if (searchIconMobile) {
            searchIconMobile.addEventListener('click', () => {
                searchOverlay.classList.add('open');
                document.body.classList.add('no-scroll');
                renderRecentSearches();
                setTimeout(() => searchOverlayInput?.focus(), 100);
            });
        }

        // Also open search overlay when clicking the desktop search bar
        if (searchInput) {
            searchInput.addEventListener('focus', () => {
                if (window.innerWidth <= 768) {
                    searchOverlay.classList.add('open');
                    document.body.classList.add('no-scroll');
                    renderRecentSearches();
                    searchOverlayInput.value = searchInput.value;
                    setTimeout(() => searchOverlayInput?.focus(), 100);
                }
            });
        }

        // Mobile search button (new header) - toggles inline search bar
        const searchBtnMobile = document.getElementById('searchBtnMobile');
        const mobileSearchBar = document.getElementById('mobileSearchBar');
        const mobileSearchInput = document.getElementById('mobileSearchInput');
        if (searchBtnMobile && mobileSearchBar) {
            searchBtnMobile.addEventListener('click', function() {
                const isOpen = mobileSearchBar.classList.toggle('open');
                this.setAttribute('aria-expanded', isOpen);
                mobileSearchBar.setAttribute('aria-hidden', !isOpen);
                if (isOpen) {
                    setTimeout(() => mobileSearchInput?.focus(), 100);
                }
            });
        }

        // Mobile search bar submit
        if (mobileSearchInput) {
            mobileSearchInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    const q = this.value.trim();
                    if (q) { addRecentSearch(q); performSearch(q); closeAllOverlays(); }
                }
            });
        }
        const mobileSearchSubmit = mobileSearchBar?.querySelector('.search-submit');
        if (mobileSearchSubmit) {
            mobileSearchSubmit.addEventListener('click', function() {
                const q = mobileSearchInput?.value?.trim();
                if (q) { addRecentSearch(q); performSearch(q); closeAllOverlays(); }
            });
        }

        searchClose.addEventListener('click', () => {
            searchOverlay.classList.remove('open');
            document.body.classList.remove('no-scroll');
        });
        searchOverlay.addEventListener('click', e => {
            if (e.target === searchOverlay || (!e.target.closest('.search-panel') && !e.target.closest('.search-result-item') && !e.target.closest('.search-tag') && !e.target.closest('.search-recent-item'))) {
                searchOverlay.classList.remove('open');
                document.body.classList.remove('no-scroll');
            }
        });
        searchOverlaySubmit.addEventListener('click', () => {
            const q = searchOverlayInput.value.trim();
            if (q) { addRecentSearch(q); performSearch(q); }
        });
        searchOverlayInput.addEventListener('keypress', e => {
            if (e.key === 'Enter') {
                const q = searchOverlayInput.value.trim();
                if (q) { addRecentSearch(q); performSearch(q); }
            }
        });
        searchOverlayInput.addEventListener('input', function() {
            const q = this.value.trim();
            const liveResults = document.getElementById('searchLiveResults');
            const suggestions = document.getElementById('searchSuggestions');
            if (q.length >= 2) {
                if (suggestions) suggestions.style.display = 'none';
                clearTimeout(searchDebounce);
                searchDebounce = setTimeout(() => performLiveSearch(q), 300);
            } else {
                if (liveResults) liveResults.innerHTML = '';
                if (suggestions) suggestions.style.display = 'block';
            }
        });

        // ============================================================
        // HEADER SHRINK & HIDE/SHOW ON SCROLL
        // ============================================================
        let lastScrollY = window.scrollY;
        let scrollTimeout;
        window.addEventListener('scroll', () => {
            const scrollY = window.scrollY;
            // Shrink header
            stickyHeader.classList.toggle('shrink', scrollY > 60);
            // Scroll shadow
            stickyHeader.classList.toggle('scrolled', scrollY > 10);
            // Hide/show on scroll
            if (Math.abs(scrollY - lastScrollY) > 10) {
                if (scrollY > lastScrollY && scrollY > 100) {
                    stickyHeader.classList.add('hidden');
                } else {
                    stickyHeader.classList.remove('hidden');
                }
                lastScrollY = scrollY;
            }
        }, { passive: true });

        // ============================================================
        // MOBILE DRAWER (updated for new header)
        // ============================================================
        function openDrawer() {
            drawer.classList.add('open');
            drawerOverlay.classList.add('open');
            document.body.classList.add('no-scroll');
            const hamburger = document.getElementById('hamburgerBtn');
            if (hamburger) hamburger.setAttribute('aria-expanded', 'true');
            drawerFocusTrap();
        }

        function closeDrawerFn() {
            drawer.classList.remove('open');
            drawerOverlay.classList.remove('open');
            document.body.classList.remove('no-scroll');
            const hamburger = document.getElementById('hamburgerBtn');
            if (hamburger) hamburger.setAttribute('aria-expanded', 'false');
        }

        function drawerFocusTrap() {
            const focusable = drawer.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])');
            if (!focusable.length) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            first.focus();
            function trap(e) {
                if (!drawer.classList.contains('open')) { document.removeEventListener('keydown', trap); return; }
                if (e.key !== 'Tab') return;
                if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
                else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
            }
            document.addEventListener('keydown', trap);
        }

        // New hamburger button
        if (hamburgerBtn) {
            hamburgerBtn.addEventListener('click', openDrawer);
        }
        closeDrawer.addEventListener('click', closeDrawerFn);
        drawerOverlay.addEventListener('click', closeDrawerFn);

        document.querySelectorAll('.drawer-toggle').forEach(toggle => {
            toggle.addEventListener('click', function() {
                const targetId = this.dataset.target;
                const sub = document.getElementById(targetId);
                const arrow = this.querySelector('.arrow');
                if (sub) {
                    sub.classList.toggle('open');
                    if (arrow) arrow.classList.toggle('open');
                }
            });
        });

        document.querySelectorAll('.drawer-nav a').forEach(link => {
            link.addEventListener('click', () => {
                setTimeout(closeDrawerFn, 200);
            });
        });

        drawerHome.addEventListener('click', (e) => { e.preventDefault();
            showHomeSection(); });
        drawerContact.addEventListener('click', (e) => {
            window.location.href = '/contact.html'; });

        // New drawer items
        const drawerWishlist = document.getElementById('drawerWishlist');
        const drawerOrders = document.getElementById('drawerOrders');
        const drawerSettings = document.getElementById('drawerSettings');
        const drawerLogout = document.getElementById('drawerLogout');

        if (drawerWishlist) drawerWishlist.addEventListener('click', (e) => {
            e.preventDefault(); closeDrawerFn(); toggleAuthRequiredAction('wishlist');
        });
        if (drawerOrders) drawerOrders.addEventListener('click', (e) => {
            e.preventDefault(); closeDrawerFn(); toggleAuthRequiredAction('orders');
        });
        if (drawerSettings) drawerSettings.addEventListener('click', (e) => {
            e.preventDefault(); closeDrawerFn(); toggleAuthRequiredAction('settings');
        });
        if (drawerLogout) drawerLogout.addEventListener('click', (e) => {
            e.preventDefault(); closeDrawerFn(); clearAuth(); showToast('Logged out', 'info'); loadProducts();
        });

        // ============================================================
        // FOOTER SOCIAL LINKS (from API)
        // ============================================================
        const socialIconMap = {
            facebook: 'fab fa-facebook-f',
            instagram: 'fab fa-instagram',
            tiktok: 'fab fa-tiktok',
            twitter: 'fab fa-twitter',
            pinterest: 'fab fa-pinterest',
            linkedin: 'fab fa-linkedin-in',
            youtube: 'fab fa-youtube',
            whatsapp: 'fab fa-whatsapp',
            threads: 'fab fa-threads',
            telegram: 'fab fa-telegram',
            snapchat: 'fab fa-snapchat-ghost'
        };

        async function loadSocialLinks() {
            try {
                const res = await fetch(`${API_URL}/social-links`);
                if (!res.ok) return;
                const json = await res.json();
                const data = json.data || json || {};
                const platforms = Object.keys(data).filter(k => k !== '_id' && k !== 'createdAt' && k !== 'updatedAt' && k !== '__v' && k !== 'website' && data[k] && typeof data[k] === 'object' && data[k].enabled && data[k].url);
                if (!platforms.length) return;
                const html = platforms.map(k => {
                    const link = data[k];
                    const icon = socialIconMap[k] || 'fas fa-link';
                    const target = link.openInNewTab !== false ? ' target="_blank"' : '';
                    return `<a href="${link.url}"${target} aria-label="${k}"><i class="${icon}"></i></a>`;
                }).join('');
                const footerContainer = document.getElementById('footerSocialLinks');
                if (footerContainer) footerContainer.innerHTML = html;
                const drawerContainer = document.getElementById('drawerSocialLinks');
                if (drawerContainer) drawerContainer.innerHTML = html;
                if (data.whatsapp && data.whatsapp.enabled && data.whatsapp.url) {
                    const floater = document.getElementById('floatingWhatsApp');
                    if (floater) { floater.href = data.whatsapp.url; floater.classList.remove('hidden-wa'); }
                }
            } catch (e) { console.error('Social links error', e); }
        }

        // ============================================================
        // FOOTER LINKS
        // ============================================================
        const footerLinks = document.querySelectorAll('.footer-link');
        footerLinks.forEach(link => {
            link.addEventListener('click', function(e) {
                e.preventDefault();
                const page = this.dataset.page;
                if (page === 'home') showHomeSection();
                else if (this.dataset.category) {
                    const cat = this.dataset.category;
                    loadProducts(cat);
                    showHomeSection();
                    document.getElementById('productsSection').scrollIntoView({ behavior: 'smooth' });
                    showToast(`🛍️ ${cat.replace('-',' ')}`, 'info');
                }
            });
        });

        // ============================================================
        // SHOP NOW BUTTON
        // ============================================================
        document.getElementById('shopNowBtn').addEventListener('click', () => {
            showHomeSection();
            document.getElementById('productsSection').scrollIntoView({ behavior: 'smooth' });
        });

        // ============================================================
        // HERO TOUCH SWIPE
        // ============================================================
        (function initHeroTouchSwipe() {
            const hero = document.getElementById('heroSection');
            if (!hero) return;
            let startX = 0;
            hero.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
            hero.addEventListener('touchend', e => {
                if (!heroSlides.length || heroSlides.length < 2) return;
                const diff = startX - e.changedTouches[0].clientX;
                if (Math.abs(diff) > 60) {
                    if (diff > 0) { heroIndex = (heroIndex + 1) % heroSlides.length; }
                    else { heroIndex = (heroIndex - 1 + heroSlides.length) % heroSlides.length; }
                    setHeroSlide(heroSlides[heroIndex]);
                }
            }, { passive: true });
        })();

        // ============================================================
        // TESTIMONIALS FROM API
        // ============================================================
        async function loadTestimonials() {
            const grid = document.getElementById('testimonialsGrid');
            if (!grid) return;
            try {
                const res = await fetch(API_URL + '/reviews/top?limit=6');
                if (!res.ok) return;
                const reviews = await res.json();
                const items = (reviews.data || reviews || []).filter(r => r.rating >= 4);
                if (!items.length) return;
                const section = document.getElementById('testimonialsSection');
                if (section) section.style.display = 'block';
                grid.innerHTML = items.map(r => {
                    const name = r.userId?.name || r.user?.name || 'Customer';
                    const initial = name.charAt(0).toUpperCase();
                    const stars = Array.from({length: 5}, (_, i) => i < r.rating ? '<i class="fas fa-star" style="color:#F59E0B;"></i>' : '<i class="far fa-star" style="color:#D1D5DB;"></i>').join('');
                    const product = r.productId?.name || r.product?.name || '';
                    return '<div class="testimonial-card" style="background:var(--bg-secondary);border-radius:12px;padding:24px;border:1px solid var(--border-light);box-shadow:var(--shadow);">' +
                        '<div style="display:flex;gap:12px;align-items:center;margin-bottom:12px;">' +
                            '<div style="width:44px;height:44px;border-radius:50%;background:var(--color-gold);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1.1rem;">' + initial + '</div>' +
                            '<div><div style="font-weight:600;font-size:0.9rem;">' + escHtml(name) + '</div>' +
                            '<div style="font-size:0.75rem;color:var(--text-secondary);">' + new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + '</div></div>' +
                        '</div>' +
                        '<div style="margin-bottom:8px;">' + stars + '</div>' +
                        (r.title ? '<div style="font-weight:600;margin-bottom:6px;font-size:0.9rem;">' + escHtml(r.title) + '</div>' : '') +
                        '<p style="font-size:0.85rem;color:var(--text-secondary);line-height:1.6;margin:0;">' + escHtml(r.comment || '') + '</p>' +
                        (product ? '<div style="margin-top:10px;font-size:0.75rem;color:var(--color-gold);font-weight:500;"><i class="fas fa-box-open" style="margin-right:4px;"></i>' + escHtml(product) + '</div>' : '') +
                    '</div>';
                }).join('');
            } catch(e) { /* silent */ }
        }

        // Back to top
        const backToTopBtn = document.getElementById('backToTop');
        window.addEventListener('scroll', () => {
            if (backToTopBtn) backToTopBtn.classList.toggle('visible', window.scrollY > 500);
        });
        if (backToTopBtn) backToTopBtn.addEventListener('click', () => { window.scrollTo({ top: 0, behavior: 'smooth' }); });

        // Recent searches
        function getRecentSearches() {
            try { return JSON.parse(localStorage.getItem('recentSearches') || '[]'); } catch (e) { return []; }
        }
        function addRecentSearch(query) {
            let recent = getRecentSearches().filter(s => s !== query);
            recent.unshift(query);
            if (recent.length > 6) recent = recent.slice(0, 6);
            localStorage.setItem('recentSearches', JSON.stringify(recent));
        }
        function renderRecentSearches() {
            const recent = getRecentSearches();
            const section = document.getElementById('recentSearchSection');
            const container = document.getElementById('recentSearches');
            if (!section || !container) return;
            if (recent.length === 0) { section.style.display = 'none'; return; }
            section.style.display = 'block';
            container.innerHTML = recent.map(q => `
                <div class="search-recent-item" data-search="${q}">
                    <i class="fas fa-history"></i><span>${q}</span>
                </div>
            `).join('');
            container.querySelectorAll('.search-recent-item').forEach(item => {
                item.addEventListener('click', () => {
                    const q = item.dataset.search;
                    searchOverlayInput.value = q;
                    performLiveSearch(q);
                });
            });
        }

        // Live search
        let searchDebounce = null;
        async function performLiveSearch(query) {
            const resultsContainer = document.getElementById('searchLiveResults');
            const suggestionsEl = document.getElementById('searchSuggestions');
            if (!resultsContainer) return;
            if (!query || query.length < 2) {
                resultsContainer.innerHTML = '';
                if (suggestionsEl) suggestionsEl.style.display = 'block';
                return;
            }
            if (suggestionsEl) suggestionsEl.style.display = 'none';
            try {
                const res = await fetch(`${API_URL}/products?search=${encodeURIComponent(query)}`);
                if (!res.ok) return;
                const raw = await res.json();
                const products = Array.isArray(raw) ? raw : (raw.data || []);
                if (!products || products.length === 0) {
                    resultsContainer.innerHTML = '<div style="text-align:center;padding:30px 0;color:var(--text-secondary);font-size:0.85rem;">No products found for "' + query + '"</div>';
                    return;
                }
                resultsContainer.innerHTML = products.slice(0, 8).map(p => {
                    const img = p.images?.[0] ? getImageUrl(p.images[0]) : 'https://placehold.co/48x48/FAF9F6/C8A35A?text=?';
                    const cat = p.category ? p.category.replace('-', ' ') : '';
                    const gender = p.gender ? ' · ' + p.gender : '';
                    return `
                        <div class="search-result-item" data-id="${p._id}">
                            <img src="${img}" alt="${escHtml(p.name)}" loading="lazy" />
                            <div class="result-info">
                                <div class="result-name">${escHtml(p.name)}</div>
                                <div class="result-meta"><span>${escHtml(cat + gender)}</span></div>
                            </div>
                            <div class="result-price">Ksh ${p.price.toLocaleString()}</div>
                        </div>
                    `;
                }).join('');
                resultsContainer.querySelectorAll('.search-result-item').forEach(item => {
                    item.addEventListener('click', () => {
                        addRecentSearch(query);
                        searchOverlay.classList.remove('open');
                        document.body.classList.remove('no-scroll');
                        openQuickView(item.dataset.id);
                    });
                });
            } catch (e) { console.error('Live search error', e); }
        }

        // Search tags click (re-bound after dynamic load)
        bindSearchTags();

        // ESC key closes search
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (searchOverlay.classList.contains('open')) {
                    searchOverlay.classList.remove('open');
                    document.body.classList.remove('no-scroll');
                }
            }
        });

        // Re-apply hero sizing on resize
        let heroResizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(heroResizeTimer);
            heroResizeTimer = setTimeout(() => {
                if (heroSlides.length) setHeroSlide(heroSlides[heroIndex]);
            }, 200);
        });

        // ============================================================
        // PRODUCT FILTER & SORT
        // ============================================================
        let currentFilter = 'all';
        let currentSort = 'newest';
        let currentGender = null;

        // URL state management for filters
        function getFilterFromURL() {
            const params = new URLSearchParams(window.location.search);
            return {
                filter: params.get('filter') || 'all',
                gender: params.get('gender') || null,
                search: params.get('search') || '',
                sort: params.get('sort') || 'newest'
            };
        }
        function setFilterToURL(filter, gender, search, sort) {
            const params = new URLSearchParams();
            if (filter && filter !== 'all') params.set('filter', filter);
            if (gender) params.set('gender', gender);
            if (search) params.set('search', search);
            if (sort && sort !== 'newest') params.set('sort', sort);
            const qs = params.toString();
            const url = qs ? '?' + qs : window.location.pathname;
            history.replaceState(null, '', url);
        }

        // Gender filter buttons
        document.querySelectorAll('.gender-btn[data-gender]').forEach(btn => {
            btn.addEventListener('click', function() {
                document.querySelectorAll('.gender-btn[data-gender]').forEach(b => {
                    b.classList.remove('active');
                    b.style.background = 'transparent';
                    b.style.color = 'var(--text-secondary)';
                    b.style.borderColor = 'var(--border-light)';
                });
                this.classList.add('active');
                this.style.background = 'var(--color-gold)';
                this.style.color = '#fff';
                this.style.borderColor = 'var(--color-gold)';
                currentGender = this.dataset.gender === 'all' ? null : this.dataset.gender;
                setFilterToURL(currentFilter, currentGender, lastFetchSearch, currentSort);
                loadProducts(currentFilter, currentGender);
            });
        });

        document.querySelectorAll('.filter-btn[data-filter]').forEach(btn => {
            btn.addEventListener('click', function() {
                document.querySelectorAll('.filter-btn[data-filter]').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                currentFilter = this.dataset.filter;
                setFilterToURL(currentFilter, currentGender, lastFetchSearch, currentSort);
                loadProducts(currentFilter, currentGender);
            });
        });

        document.getElementById('sortSelect').addEventListener('change', function() {
            currentSort = this.value;
            setFilterToURL(currentFilter, currentGender, lastFetchSearch, currentSort);
            loadProducts(currentFilter, currentGender);
        });

        function applyFilterAndSort() {
            let filtered = [...currentProducts];
            if (currentFilter !== 'all') {
                filtered = filtered.filter(p => p.category === currentFilter);
            }
            if (currentGender) {
                filtered = filtered.filter(p => p.gender === currentGender || p.gender === 'unisex');
            }
            switch (currentSort) {
                case 'price-low': filtered.sort((a, b) => a.price - b.price); break;
                case 'price-high': filtered.sort((a, b) => b.price - a.price); break;
                case 'popular': filtered.sort((a, b) => (b.totalSold || 0) - (a.totalSold || 0)); break;
                case 'name-az': filtered.sort((a, b) => a.name.localeCompare(b.name)); break;
                case 'newest': default: filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); break;
            }
            const countEl = document.getElementById('productCount');
            if (countEl) countEl.textContent = filtered.length + ' product' + (filtered.length !== 1 ? 's' : '');
            renderProducts(filtered);
        }

        // ============================================================
        // HOMEPAGE SECTIONS — New Arrivals & Best Sellers
        // ============================================================
        async function loadHomepageSections() {
            try {
                const [newRes, bestRes] = await Promise.all([
                    fetch(`${API_URL}/products?limit=6&sortBy=newest`),
                    fetch(`${API_URL}/products?limit=6&sortBy=popular`)
                ]);
                const newData = newRes.ok ? await newRes.json() : { data: [] };
                const bestData = bestRes.ok ? await bestRes.json() : { data: [] };
                const newProducts = (newData.data || []).filter(p => p.isNewArrival);
                const bestProducts = (bestData.data || []).filter(p => p.isBestSeller);
                if (newProducts.length > 0) {
                    const section = document.getElementById('newArrivalsSection');
                    const grid = document.getElementById('newArrivalsGrid');
                    if (section && grid) {
                        section.style.display = 'block';
                        grid.innerHTML = newProducts.map(p => buildProductCard(p)).join('');
                        bindProductCardEvents(grid);
                    }
                }
                if (bestProducts.length > 0) {
                    const section = document.getElementById('bestSellersSection');
                    const grid = document.getElementById('bestSellersGrid');
                    if (section && grid) {
                        section.style.display = 'block';
                        grid.innerHTML = bestProducts.map(p => buildProductCard(p)).join('');
                        bindProductCardEvents(grid);
                    }
                }
            } catch(e) { console.error('Homepage sections error', e); }
        }

        // ============================================================
        // FLASH SALE HOMEPAGE SECTION
        // ============================================================
        let flashSaleTimer = null;

        async function loadFlashSales() {
            try {
                const res = await fetch(`${API_URL}/products/flash-sale`);
                if (!res.ok) return;
                const json = await res.json();
                const products = json.data || [];
                if (!products.length) return;

                const section = document.getElementById('flashSaleSection');
                const grid = document.getElementById('flashSaleGrid');
                const countdown = document.getElementById('flashSaleCountdown');
                if (!section || !grid) return;

                section.style.display = 'block';
                grid.innerHTML = products.map(p => buildProductCard(p)).join('');
                bindProductCardEvents(grid);

                const earliestEnd = products.reduce((min, p) => {
                    const end = new Date(p.flashSaleEnd);
                    return end < min ? end : min;
                }, new Date(products[0].flashSaleEnd));

                function updateCountdown() {
                    const now = new Date();
                    const diff = earliestEnd - now;
                    if (diff <= 0) { countdown.innerHTML = '<span style="color:#DC2626;font-weight:600;">Sale Ended</span>'; clearInterval(flashSaleTimer); return; }
                    const d = Math.floor(diff / 86400000);
                    const h = Math.floor((diff % 86400000) / 3600000);
                    const m = Math.floor((diff % 3600000) / 60000);
                    const s = Math.floor((diff % 60000) / 1000);
                    countdown.innerHTML = [
                        { v: d, l: 'Days' }, { v: h, l: 'Hrs' }, { v: m, l: 'Min' }, { v: s, l: 'Sec' }
                    ].map(u => `<div style="text-align:center;"><div style="background:var(--text-primary);color:#fff;padding:8px 12px;border-radius:6px;font-size:1.2rem;font-weight:700;min-width:44px;">${String(u.v).padStart(2,'0')}</div><div style="font-size:0.7rem;color:var(--text-secondary);margin-top:4px;">${u.l}</div></div>`).join('');
                }
                updateCountdown();
                if (flashSaleTimer) clearInterval(flashSaleTimer);
                flashSaleTimer = setInterval(updateCountdown, 1000);
            } catch(e) { console.error('Flash sale load error:', e); }
        }

        // ============================================================
        // PROMO BANNER SECTION
        // ============================================================
        async function loadPromoBanners() {
            try {
                const res = await fetch(`${API_URL}/promo/banners/public?location=homepage`);
                if (!res.ok) return;
                const json = await res.json();
                const banners = json.data || [];
                if (!banners.length) return;

                const area = document.getElementById('promoBannerArea');
                if (!area) return;
                area.innerHTML = banners.map(b => {
                    const bgColor = b.backgroundColor || '#1A1A1A';
                    const textColor = b.textColor || '#FFFFFF';
                    const link = b.buttonLink || b.link || '#';
                    const onclick = link.startsWith('http') ? `window.open('${escHtml(link)}','_blank')` : `window.location.href='${escHtml(link)}'`;
                    return `<div class="promo-banner" style="background:${bgColor};color:${textColor};padding:24px 20px;text-align:center;cursor:pointer;margin-bottom:20px;" onclick="${onclick}" role="banner">
                        ${b.title ? `<div style="font-size:1.4rem;font-weight:700;text-transform:uppercase;letter-spacing:2px;">${escHtml(b.title)}</div>` : ''}
                        ${b.subtitle ? `<div style="font-size:0.9rem;opacity:0.85;margin-top:6px;">${escHtml(b.subtitle)}</div>` : ''}
                        ${b.buttonText ? `<div style="margin-top:10px;"><span style="display:inline-block;padding:8px 24px;border:2px solid ${textColor};border-radius:4px;font-weight:600;font-size:0.85rem;text-transform:uppercase;letter-spacing:1px;">${escHtml(b.buttonText)}</span></div>` : ''}
                    </div>`;
                }).join('');

                banners.forEach(b => {
                    fetch(`${API_URL}/promo/banners/${b._id}/track`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'view' })
                    }).catch(() => {});
                });
            } catch(e) { console.error('Promo banners load error:', e); }
        }

        // ============================================================
        // COUPON SYSTEM
        // ============================================================
        let appliedCoupon = null;
        const COUPONS = {
            'TRENDY10': { type: 'percent', value: 10, minOrder: 5000, maxDiscount: 5000 },
            'WELCOME15': { type: 'percent', value: 15, minOrder: 10000, maxDiscount: 8000 },
            'FREESHIP': { type: 'shipping', value: 0, minOrder: 5000 },
            'SAVE500': { type: 'fixed', value: 500, minOrder: 8000 }
        };

        const applyCouponBtn = document.getElementById('applyCouponBtn');
        const couponInput = document.getElementById('checkoutCoupon');
        const couponMessage = document.getElementById('couponMessage');

        if (applyCouponBtn) {
            applyCouponBtn.addEventListener('click', function() {
                const code = (couponInput.value || '').trim().toUpperCase();
                if (!code) { showCouponMessage('Please enter a coupon code', 'error'); return; }
                const coupon = COUPONS[code];
                if (!coupon) { showCouponMessage('Invalid coupon code', 'error'); return; }
                const subtotal = cartItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
                if (subtotal < coupon.minOrder) { showCouponMessage(`Minimum order Ksh ${coupon.minOrder.toLocaleString()} required`, 'error'); return; }
                appliedCoupon = { code, ...coupon };
                let discount = 0;
                if (coupon.type === 'percent') { discount = Math.min(Math.round(subtotal * coupon.value / 100), coupon.maxDiscount || Infinity); }
                else if (coupon.type === 'fixed') { discount = coupon.value; }
                showCouponMessage(`Coupon applied! You save Ksh ${discount.toLocaleString()}`, 'success');
                updateCheckoutTotals();
            });
        }

        function showCouponMessage(msg, type) {
            if (!couponMessage) return;
            couponMessage.style.display = 'block';
            couponMessage.textContent = msg;
            couponMessage.style.background = type === 'success' ? '#e8f5e9' : '#fce4ec';
            couponMessage.style.color = type === 'success' ? '#2e7d32' : '#c62828';
        }

        function updateCheckoutTotals() {
            const subtotal = cartItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
            let discount = 0;
            if (appliedCoupon) {
                if (appliedCoupon.type === 'percent') { discount = Math.min(Math.round(subtotal * appliedCoupon.value / 100), appliedCoupon.maxDiscount || Infinity); }
                else if (appliedCoupon.type === 'fixed') { discount = appliedCoupon.value; }
            }
            const freeDeliveryThreshold = 15000;
            const delivery = subtotal >= freeDeliveryThreshold ? 0 : (subtotal > 0 ? 150 : 0);
            const total = Math.max(0, subtotal - discount + delivery);
            const subtotalEl = document.getElementById('checkoutSubtotal');
            const deliveryEl = document.getElementById('checkoutDelivery');
            const totalEl = document.getElementById('checkoutTotal');
            const discountRow = document.getElementById('discountRow');
            const discountEl = document.getElementById('checkoutDiscount');
            if (subtotalEl) subtotalEl.textContent = `Ksh ${subtotal.toLocaleString()}`;
            if (deliveryEl) deliveryEl.textContent = delivery === 0 && subtotal > 0 ? 'FREE' : `Ksh ${delivery.toLocaleString()}`;
            if (discountRow) discountRow.style.display = discount > 0 ? 'flex' : 'none';
            if (discountEl) discountEl.textContent = `- Ksh ${discount.toLocaleString()}`;
            if (totalEl) totalEl.textContent = `Ksh ${total.toLocaleString()}`;
            renderCheckoutItems();
        }

        function renderCheckoutItems() {
            const container = document.getElementById('checkoutItems');
            if (!container) return;
            container.innerHTML = cartItems.map(item => {
                const img = item.image ? getImageUrl(item.image) : 'https://placehold.co/40x40/FAF9F6/C8A35A?text=?';
                const opts = [];
                if (item.size) opts.push(item.size);
                if (item.color) opts.push(item.color);
                return `<div style="display:flex;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid var(--border-light);font-size:0.8rem;">
                    <img src="${img}" alt="${escHtml(item.name)}" style="width:40px;height:40px;object-fit:cover;border-radius:4px;" loading="lazy" />
                    <div style="flex:1;min-width:0;">
                        <div style="font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(item.name)}</div>
                        <div style="color:var(--text-secondary);font-size:0.75rem;">${opts.length ? opts.join(' / ') + ' · ' : ''}Qty: ${item.quantity}</div>
                    </div>
                    <div style="font-weight:600;white-space:nowrap;">Ksh ${(item.price * item.quantity).toLocaleString()}</div>
                </div>`;
            }).join('');
        }

        // ============================================================
        // SIZE SELECTOR ON PRODUCT CARDS
        // ============================================================
        let selectedSizes = {};

        function renderSizeChips(product, containerId) {
            const container = document.getElementById(containerId);
            if (!container || !product.sizes || !product.sizes.length) { if (container) container.innerHTML = ''; return; }
            container.innerHTML = product.sizes.map(s =>
                `<span class="size-chip" data-size="${s}">${s}</span>`
            ).join('');
            container.querySelectorAll('.size-chip').forEach(chip => {
                chip.addEventListener('click', function(e) {
                    e.stopPropagation();
                    container.querySelectorAll('.size-chip').forEach(c => c.classList.remove('selected'));
                    this.classList.add('selected');
                    selectedSizes[product._id] = this.dataset.size;
                });
            });
            if (selectedSizes[product._id]) {
                const active = container.querySelector(`[data-size="${selectedSizes[product._id]}"]`);
                if (active) active.classList.add('selected');
            }
        }

        // ============================================================
        // PRODUCT REVIEWS
        // ============================================================
        async function loadProductReviews(productId) {
            const listEl = document.getElementById('qvReviewsList');
            const avgEl = document.getElementById('qvAvgRating');
            const avgStars = document.getElementById('qvAvgStars');
            const avgText = document.getElementById('qvAvgText');
            if (!listEl) return;
            listEl.innerHTML = '<div class="no-reviews">Loading reviews...</div>';
            try {
                const res = await fetch(`${API_URL}/reviews/product/${productId}`);
                if (!res.ok) throw new Error('Failed');
                const reviews = await res.json();
                if (!reviews || reviews.length === 0) {
                    listEl.innerHTML = '<div class="no-reviews">No reviews yet. Be the first to review this product!</div>';
                    if (avgEl) avgEl.style.display = 'none';
                    return;
                }
                const avg = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
                if (avgEl) { avgEl.style.display = 'flex'; avgStars.innerHTML = Array.from({length: 5}, (_, i) => i < Math.round(avg) ? '<i class="fas fa-star"></i>' : '<i class="far fa-star"></i>').join(''); avgText.textContent = avg.toFixed(1) + ' (' + reviews.length + ' review' + (reviews.length !== 1 ? 's' : '') + ')'; }
                listEl.innerHTML = reviews.slice(0, 5).map(r => {
                    const name = r.userId?.name || r.user?.name || 'Customer';
                    const initial = name.charAt(0).toUpperCase();
                    const stars = Array.from({length: 5}, (_, i) => i < r.rating ? '<i class="fas fa-star"></i>' : '<i class="far fa-star"></i>').join('');
                    const date = new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                    return `<div class="review-item"><div class="review-header"><div class="review-avatar">${initial}</div><span class="review-name">${escHtml(name)}</span><span class="review-stars">${stars}</span><span class="review-date">${date}</span></div>${r.title ? `<div style="font-weight:600;margin:4px 0;">${escHtml(r.title)}</div>` : ''}<div class="review-comment">${escHtml(r.comment || '')}</div></div>`;
                }).join('');
            } catch (e) {
                listEl.innerHTML = '<div class="no-reviews">Could not load reviews.</div>';
                if (avgEl) avgEl.style.display = 'none';
            }
        }
        async function loadQVReviews(productId) {
            const el = document.getElementById('qvReviewsList');
            if (!el) return;
            try {
                const res = await fetch(`${API_URL}/reviews/product/${productId}`);
                if (!res.ok) throw new Error('Failed');
                const data = await res.json();
                const reviews = data.data || data;
                if (!reviews || !reviews.length) { el.innerHTML = '<p style="font-size:0.8rem;">No reviews yet. Be the first!</p>'; return; }
                const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
                el.innerHTML = `<div style="margin-bottom:8px;"><strong>${avg.toFixed(1)}</strong> / 5 (${reviews.length} reviews)</div>` + reviews.slice(0, 3).map(r => {
                    const name = r.user?.name || 'Customer';
                    const stars = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
                    return `<div style="border-bottom:1px solid var(--border-light);padding:6px 0;"><div style="display:flex;justify-content:space-between;"><span style="font-weight:600;">${escHtml(name)}</span><span style="color:var(--gold);font-size:0.8rem;">${stars}</span></div>${r.title ? `<div style="font-weight:600;font-size:0.85rem;">${escHtml(r.title)}</div>` : ''}<div style="font-size:0.8rem;color:var(--text-secondary);">${escHtml(r.comment || '')}</div></div>`;
                }).join('');
            } catch (e) { el.innerHTML = '<p style="font-size:0.8rem;">Could not load reviews.</p>'; }
        }
        async function loadQVQA(productId) {
            const el = document.getElementById('qvQAList');
            if (!el) return;
            try {
                const res = await fetch(`${API_URL}/qa/product/${productId}`);
                if (!res.ok) throw new Error('Failed');
                const data = await res.json();
                const questions = data.data || data;
                if (!questions || !questions.length) { el.innerHTML = '<p style="font-size:0.8rem;">No questions yet. Ask one!</p>'; return; }
                el.innerHTML = questions.slice(0, 5).map(q => {
                    const name = q.user?.name || 'Customer';
                    const answers = (q.answers || []).filter(a => a.status === 'approved');
                    return `<div style="border-bottom:1px solid var(--border-light);padding:6px 0;"><div style="font-weight:600;font-size:0.85rem;">Q: ${escHtml(q.text)}</div><div style="font-size:0.75rem;color:var(--text-muted);">by ${escHtml(name)} · ${new Date(q.createdAt).toLocaleDateString()}</div>${answers.map(a => `<div style="margin-left:16px;margin-top:4px;font-size:0.8rem;"><strong>A:</strong> ${escHtml(a.text)} <span style="color:var(--text-muted);font-size:0.7rem;">— ${escHtml(a.user?.name || 'Admin')}</span></div>`).join('')}</div>`;
                }).join('');
            } catch (e) { el.innerHTML = '<p style="font-size:0.8rem;">Could not load Q&A.</p>'; }
        }

        // Star rating for review form
        let selectedRating = 0;
        document.addEventListener('click', function(e) {
            if (e.target.closest('#qvStarRating')) {
                const star = e.target.closest('[data-star]');
                if (!star) return;
                selectedRating = parseInt(star.dataset.star);
                document.querySelectorAll('#qvStarRating i').forEach(function(s, i) {
                    s.className = i < selectedRating ? 'fas fa-star' : 'far fa-star';
                });
            }
        });

        // Submit review
        document.addEventListener('click', function(e) {
            if (e.target.id === 'qvSubmitReview') {
                e.preventDefault();
                const token = getToken();
                if (!token) { showToast('Please login to submit a review'); return; }
                if (!selectedRating) { showToast('Please select a rating'); return; }
                const comment = document.getElementById('qvReviewComment').value.trim();
                if (!comment) { showToast('Please write a review'); return; }
                const title = document.getElementById('qvReviewTitle').value.trim();
                e.target.disabled = true;
                e.target.textContent = 'Submitting...';
                fetch(API_URL + '/reviews', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                    body: JSON.stringify({ productId: currentQVProduct._id, rating: selectedRating, comment: comment, title: title })
                }).then(function(r) { return r.json(); }).then(function(d) {
                    if (d.success) {
                        showToast('Review submitted! It will appear after approval.');
                        document.getElementById('qvReviewTitle').value = '';
                        document.getElementById('qvReviewComment').value = '';
                        selectedRating = 0;
                        document.querySelectorAll('#qvStarRating i').forEach(function(s) { s.className = 'far fa-star'; });
                        loadQVReviews(currentQVProduct._id);
                    } else { showToast(d.message || 'Failed to submit review'); }
                }).catch(function() { showToast('Network error'); })
                .finally(function() { e.target.disabled = false; e.target.textContent = 'Submit Review'; });
            }
        });

        // Submit question
        document.addEventListener('click', function(e) {
            if (e.target.id === 'qvSubmitQuestion') {
                e.preventDefault();
                const token = getToken();
                if (!token) { showToast('Please login to ask a question'); return; }
                const text = document.getElementById('qvQuestionText').value.trim();
                if (!text || text.length < 3) { showToast('Please enter your question'); return; }
                e.target.disabled = true;
                fetch(API_URL + '/qa', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                    body: JSON.stringify({ productId: currentQVProduct._id, text: text })
                }).then(function(r) { return r.json(); }).then(function(d) {
                    if (d.success) {
                        showToast('Question submitted!');
                        document.getElementById('qvQuestionText').value = '';
                        loadQVQA(currentQVProduct._id);
                    } else { showToast(d.message || 'Failed to submit question'); }
                }).catch(function() { showToast('Network error'); })
                .finally(function() { e.target.disabled = false; });
            }
        });

        // Show review form for logged-in users
        function showReviewFormIfLoggedIn() {
            const form = document.getElementById('qvReviewForm');
            if (form) form.style.display = getToken() ? 'block' : 'none';
        }

        async function loadQVRecommended(productId) {
            const el = document.getElementById('qvRecommendedList');
            if (!el) return;
            try {
                const res = await fetch(`${API_URL}/products/related/${productId}?limit=6`);
                if (!res.ok) throw new Error('Failed');
                const data = await res.json();
                const products = data.data || data;
                if (!products || !products.length) { document.getElementById('qvRecommended').style.display = 'none'; return; }
                el.innerHTML = products.map(p => {
                    const img = p.images?.[0] ? getImageUrl(p.images[0]) : 'https://placehold.co/100x100/FAF9F6/C8A35A?text=Product';
                    return `<div style="min-width:120px;max-width:120px;cursor:pointer;border:1px solid var(--border-light);border-radius:6px;overflow:hidden;" onclick="closeQuickView();openQuickView('${p._id}');">
                        <img src="${img}" alt="${escHtml(p.name)}" style="width:100%;height:120px;object-fit:cover;" loading="lazy" />
                        <div style="padding:6px 8px;font-size:0.7rem;"><div style="font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(p.name)}</div><div style="color:var(--color-gold);font-weight:600;">Ksh ${p.price.toLocaleString()}</div></div>
                    </div>`;
                }).join('');
            } catch (e) { if (document.getElementById('qvRecommended')) document.getElementById('qvRecommended').style.display = 'none'; }
        }

        // ============================================================
        // HELPER FUNCTIONS
        // ============================================================
        function closeAllOverlays() {
            if (typeof closeCartFn === 'function') closeCartFn();
            else { const el = document.getElementById('miniCartOverlay'); if (el) el.classList.remove('show'); }
            const qv = document.getElementById('quickViewOverlay'); if (qv) qv.classList.remove('show');
            const drOv = document.getElementById('drawerOverlay'); if (drOv) drOv.classList.remove('open');
            const dr = document.getElementById('drawer'); if (dr) dr.classList.remove('open');
            const auth = document.getElementById('authOverlay'); if (auth) auth.style.display = 'none';
            const so = document.getElementById('searchOverlay'); if (so) so.classList.remove('open');
            const cp = document.getElementById('contactPanel'); if (cp) cp.classList.remove('open');
            const cpOv = document.getElementById('contactPanelOverlay'); if (cpOv) cpOv.classList.remove('open');
            document.body.classList.remove('no-scroll');
        }
        function openCartModal() { closeAllOverlays(); openCart(); }
        function toggleAuthRequiredAction(action) {
            closeAllOverlays();
            if (action === 'wishlist') {
                openAuthModal();
                if (isLoggedIn()) {
                    showDashboard(getUser());
                    switchDashboardTab('wishlist');
                } else {
                    authForms.style.display = 'none';
                    authLoggedIn.style.display = 'block';
                    authModalTitle.textContent = 'My Wishlist';
                    document.getElementById('authLoggedIn').querySelectorAll('.dashboard-tabs button').forEach(b => b.style.display = b.dataset.tab === 'wishlist' ? '' : 'none');
                    const wishTab = document.getElementById('tab-wishlist');
                    if (wishTab) { wishTab.classList.add('active'); wishTab.style.display = 'block'; }
                    document.querySelectorAll('.tab-pane').forEach(p => { if (p.id !== 'tab-wishlist') p.classList.remove('active'); });
                    loadWishlistDashboard();
                }
                return;
            }
            if (!isLoggedIn()) {
                openAuthModal();
                return;
            }
            if (action === 'orders') {
                openAuthModal();
                showDashboard(getUser());
                switchDashboardTab('orders');
                loadOrders();
            } else if (action === 'settings' || action === 'profile') {
                openAuthModal();
                showDashboard(getUser());
                switchDashboardTab('profile');
            }
        }

        // ============================================================
        // INIT
        // ============================================================
        // Restore filters from URL
        (function() {
            const urlState = getFilterFromURL();
            if (urlState.filter !== 'all') currentFilter = urlState.filter;
            if (urlState.gender) currentGender = urlState.gender;
            if (urlState.sort) currentSort = urlState.sort;
            if (urlState.search) lastFetchSearch = urlState.search;
            document.querySelectorAll('.filter-btn[data-filter]').forEach(b => b.classList.toggle('active', b.dataset.filter === currentFilter));
            document.querySelectorAll('.gender-btn[data-gender]').forEach(b => {
                const g = b.dataset.gender === 'all' ? null : b.dataset.gender;
                b.classList.toggle('active', g === currentGender);
                if (g === currentGender && currentGender) { b.style.background = 'var(--color-gold)'; b.style.color = '#fff'; b.style.borderColor = 'var(--color-gold)'; }
            });
            const sortSel = document.getElementById('sortSelect');
            if (sortSel) sortSel.value = currentSort;
        })();
        loadCart();
        loadWishlist();
        loadProducts(currentFilter, currentGender, lastFetchSearch);
        loadHeroImages();
        loadCategoryImages();
        loadSocialLinks();
        loadSettings();
        loadCategories();
        loadSearchTags();
        loadHomepageSections();
        loadFlashSales();
        loadPromoBanners();
        loadTestimonials();
        updateUI();
        console.log('🚀 Trendy_Wardrobe – All features fixed & extended');
        console.log('📡 API:', API_URL);

        // ============================================================
        // MOBILE BOTTOM NAV INIT
        // ============================================================
        (function initMobileBottomNav() {
            const mql = window.matchMedia('(max-width: 768px)');
            const nav = document.getElementById('mobileBottomNav');
            function applyMobileNav(e) {
                if (nav) nav.style.display = e.matches ? 'flex' : 'none';
                document.body.style.paddingBottom = e.matches ? '70px' : '';
            }
            mql.addEventListener('change', applyMobileNav);
            applyMobileNav(mql);
        })();

        // Virtual keyboard: hide fixed overlays when keyboard opens on mobile
        (function initVirtualKeyboardHandler() {
            if (!window.visualViewport) return;
            const fixedEls = [
                document.getElementById('mobileBottomNav'),
                document.querySelector('.floating-whatsapp'),
                document.querySelector('.back-to-top'),
                document.getElementById('backToTop')
            ].filter(Boolean);
            function onResize() {
                const vh = window.visualViewport.height;
                const isKeyboard = vh < window.innerHeight * 0.75;
                fixedEls.forEach(function(el) {
                    el.style.transform = isKeyboard ? 'translateY(100vh)' : '';
                    el.style.transition = 'transform 0.2s ease';
                });
            }
            window.visualViewport.addEventListener('resize', onResize);
            window.visualViewport.addEventListener('focusout', function() {
                fixedEls.forEach(function(el) { el.style.transform = ''; });
            });
        })();

        function updateMobileCartBadge() {
            const badge = document.getElementById('mobileCartBadge');
            if (badge) {
                const count = cartItems.reduce((sum, i) => sum + i.quantity, 0);
                badge.textContent = count;
                badge.style.display = count > 0 ? 'flex' : 'none';
            }
            updateCartBadge();
        }
        setInterval(updateMobileCartBadge, 2000);

        // ============================================================
        // HERO PARALLAX — Premium smooth scroll effect
        // ============================================================
        (function initHeroParallax() {
            const heroBg = document.getElementById('heroBg');
            const hero = document.getElementById('heroSection');
            if (!heroBg || !hero) return;

            // Detect if parallax should be disabled (reduced motion, low-end devices)
            const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            const isLowEndDevice = navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4;
            const isMobile = window.innerWidth <= 768;
            const disableParallax = prefersReducedMotion || isLowEndDevice;

            if (disableParallax) {
                heroBg.classList.add('parallax-disabled');
                return;
            }

            // Parallax intensity — subtle (0.25 as specified)
            const PARALLAX_FACTOR = isMobile ? 0.15 : 0.25;

            // Smooth interpolation using requestAnimationFrame
            let currentY = 0;
            let targetY = 0;
            let rafId = null;
            let lastScrollY = window.scrollY;

            function updateParallax() {
                const scrollY = window.scrollY;
                const heroRect = hero.getBoundingClientRect();
                const heroBottom = heroRect.bottom;
                const heroTop = heroRect.top;

                // Only apply parallax when hero is in viewport
                if (heroBottom > 0 && heroTop < window.innerHeight) {
                    // Calculate target based on scroll position
                    targetY = scrollY * PARALLAX_FACTOR;
                }

                // Smooth interpolation (lerp) for 60fps smoothness
                currentY += (targetY - currentY) * 0.15;

                // Apply GPU-accelerated transform
                heroBg.style.transform = `translateZ(0) translateY(${currentY}px) scale(1)`;

                rafId = requestAnimationFrame(updateParallax);
            }

            // Start the animation loop
            rafId = requestAnimationFrame(updateParallax);

            // Cleanup on page unload
            window.addEventListener('beforeunload', () => {
                if (rafId) cancelAnimationFrame(rafId);
            });
        })();

        // ============================================================
        // SERVICE WORKER REGISTRATION
        // ============================================================
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(reg => {
                    reg.update();
                    console.log('✅ Service Worker registered:', reg.scope);
                    reg.onupdatefound = () => {
                        const newWorker = reg.installing;
                        newWorker.onstatechange = () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                newWorker.postMessage({ type: 'SKIP_WAITING' });
                                showToast('🔄 New version available! Refresh to update.', 'info');
                            }
                        };
                    };
                }).catch(err => console.log('SW registration failed:', err));
            });
        }

        // ============================================================
        // PWA INSTALL PROMPT
        // ============================================================
        let deferredPrompt;
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            const installBanner = document.createElement('div');
            installBanner.id = 'pwaInstallBanner';
            installBanner.style.cssText = 'position:fixed;bottom:100px;right:28px;z-index:999;background:#1a1a1a;color:#fff;padding:16px 24px;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.3);display:flex;align-items:center;gap:12px;max-width:320px;font-size:13px;animation:fadeUp 0.5s ease;';
            installBanner.innerHTML = '<div style="flex:1;"><strong style="display:block;margin-bottom:4px;">Install Trendy Wardrobe</strong><span style="color:#999;font-size:11px;">Add to your home screen for the best experience</span></div><button onclick="installPWA()" style="background:var(--color-gold);color:#1a1a1a;border:none;padding:8px 16px;border-radius:6px;font-weight:600;cursor:pointer;white-space:nowrap;">Install</button><button onclick="dismissPWA()" style="background:none;border:none;color:#666;cursor:pointer;font-size:18px;padding:4px;">&times;</button>';
            document.body.appendChild(installBanner);
        });

        function installPWA() {
            if (!deferredPrompt) return;
            deferredPrompt.prompt();
            deferredPrompt.userChoice.then(choice => {
                if (choice.outcome === 'accepted') showToast('✅ App installed!', 'success');
                deferredPrompt = null;
                const b = document.getElementById('pwaInstallBanner');
                if (b) b.remove();
            });
        }

        function dismissPWA() {
            const b = document.getElementById('pwaInstallBanner');
            if (b) b.remove();
        }

        // ============================================================
        // PERFORMANCE: Scroll-reveal animations (IntersectionObserver)
        // ============================================================
        (function() {
            const revealSections = document.querySelectorAll('.products-section, .trust-badges, .category-grid, .footer');
            revealSections.forEach(sec => sec.classList.add('reveal-up'));

            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('revealed');
                        observer.unobserve(entry.target);
                    }
                });
            }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

            revealSections.forEach(sec => observer.observe(sec));

            // Re-observe after new products load
            const origRenderProducts = window.renderProducts;
            if (typeof origRenderProducts === 'function') {
                window.renderProducts = function() {
                    const result = origRenderProducts.apply(this, arguments);
                    document.querySelectorAll('.products-section:not(.revealed)').forEach(sec => observer.observe(sec));
                    return result;
                };
            }
        })();

        // ============================================================
        // MOBILE UX: Bottom nav active state on scroll
        // ============================================================
        (function() {
            const bottomNav = document.getElementById('mobileBottomNav');
            if (!bottomNav) return;
            const buttons = bottomNav.querySelectorAll('button');
            const sections = ['heroSection', 'products-section', null, null, null];
            const sectionIds = ['heroSection', 'products-section'];

            function updateActiveNav() {
                const scrollY = window.scrollY + window.innerHeight / 3;
                let activeIdx = 0;
                sectionIds.forEach((id, i) => {
                    const el = document.getElementById(id) || document.querySelector('.' + id);
                    if (el && el.offsetTop <= scrollY) activeIdx = i;
                });
                buttons.forEach((btn, i) => {
                    if (i === activeIdx) btn.classList.add('active');
                    else btn.classList.remove('active');
                });
            }
            window.addEventListener('scroll', updateActiveNav, { passive: true });
            updateActiveNav();
        })();

        // ============================================================
        // MOBILE UX: Haptic feedback on actions
        // ============================================================
        function hapticFeedback() {
            if (navigator.vibrate) navigator.vibrate(10);
        }
        document.addEventListener('click', function(e) {
            if (e.target.closest('button, .product-card, .category-card, .filter-btn, .search-tag')) {
                hapticFeedback();
            }
        }, { passive: true });

        // ============================================================
        // GOOGLE ANALYTICS – ENHANCED ECOMMERCE & EVENT TRACKING
        // ============================================================
        (function() {
            // --- Page View ---
            gtag('event', 'page_view', {
                page_title: document.title,
                page_location: window.location.href,
                content_group: 'homepage'
            });

            // --- Scroll Depth (25%, 50%, 75%, 100%) ---
            let scrollTracked = {};
            window.addEventListener('scroll', function() {
                const h = document.documentElement.scrollHeight - window.innerHeight;
                if (h <= 0) return;
                const pct = Math.round((window.scrollY / h) * 100);
                [25, 50, 75, 100].forEach(function(t) {
                    if (pct >= t && !scrollTracked[t]) {
                        scrollTracked[t] = true;
                        gtag('event', 'scroll', { percent_scrolled: t });
                    }
                });
            }, { passive: true });

            // --- Search ---
            const origPerformSearch = window.performSearch;
            window.performSearch = function(query) {
                const q = query || (searchInput && searchInput.value.trim());
                if (q && q.length > 0) {
                    gtag('event', 'search', {
                        search_term: q,
                        content_type: 'products'
                    });
                }
                return origPerformSearch ? origPerformSearch.apply(this, arguments) : undefined;
            };

            // --- WhatsApp Click ---
            document.querySelectorAll('a[href*="wa.me"]').forEach(function(a) {
                a.addEventListener('click', function() {
                    gtag('event', 'whatsapp_click', {
                        link_url: a.href,
                        link_text: a.textContent.trim().substring(0, 50)
                    });
                });
            });

            // --- Contact Form ---
            const contactFormEl = document.querySelector('.contact-form, #contactForm');
            if (contactFormEl) {
                contactFormEl.addEventListener('submit', function() {
                    gtag('event', 'contact_form_submit', {
                        content_type: 'contact'
                    });
                });
            }

            // --- Product View (Quick View) ---
            const origOpenQuickView = window.openQuickView;
            window.openQuickView = function(id) {
                gtag('event', 'view_item', {
                    items: [{ item_id: id }]
                });
                return origOpenQuickView.apply(this, arguments);
            };

            // --- Add to Cart ---
            const origAddToCart = window.addToCart;
            window.addToCart = function(product) {
                gtag('event', 'add_to_cart', {
                    currency: 'KES',
                    value: product.price,
                    items: [{
                        item_id: product._id,
                        item_name: product.name,
                        price: product.price,
                        quantity: 1
                    }]
                });
                return origAddToCart.apply(this, arguments);
            };

            // --- Begin Checkout ---
            const origCheckoutBtnHandler = checkoutBtn && checkoutBtn.onclick;
            checkoutBtn && checkoutBtn.addEventListener('click', function() {
                const total = parseFloat((checkoutTotal.textContent || '0').replace('Ksh ', '').replace(/,/g, ''));
                gtag('event', 'begin_checkout', {
                    currency: 'KES',
                    value: total,
                    items: cartItems.map(function(item) {
                        return {
                            item_id: item.id,
                            item_name: item.name,
                            price: item.price,
                            quantity: item.quantity
                        };
                    })
                });
            });

            // --- Purchase ---
            const origCheckoutFormSubmit = checkoutForm && checkoutForm.onsubmit;
            checkoutForm && checkoutForm.addEventListener('submit', function() {
                setTimeout(function() {
                    const successEl = document.getElementById('orderSuccessOverlay');
                    if (successEl && successEl.classList.contains('show')) {
                        const total = parseFloat((checkoutTotal.textContent || '0').replace('Ksh ', '').replace(/,/g, ''));
                        gtag('event', 'purchase', {
                            currency: 'KES',
                            value: total,
                            transaction_id: orderNumberDisplay ? orderNumberDisplay.textContent.replace('#', '') : '',
                            items: cartItems.map(function(item) {
                                return {
                                    item_id: item.id,
                                    item_name: item.name,
                                    price: item.price,
                                    quantity: item.quantity
                                };
                            })
                        });
                    }
                }, 2000);
            });

            // --- Wishlist ---
            document.querySelectorAll('.wishlist-btn').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    gtag('event', 'add_to_wishlist', {
                        content_type: 'product'
                    });
                });
            });

            // --- Category Card Clicks ---
            document.querySelectorAll('.category-card').forEach(function(card) {
                card.addEventListener('click', function() {
                    const title = card.querySelector('h3');
                    gtag('event', 'select_content', {
                        content_type: 'category',
                        content_id: title ? title.textContent.trim().toLowerCase() : 'unknown'
                    });
                });
            });

            // --- CTA Button Clicks ---
            document.querySelectorAll('.btn-shop, .shop-now').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    gtag('event', 'cta_click', {
                        button_text: btn.textContent.trim(),
                        button_location: btn.closest('section') ? btn.closest('section').id || 'hero' : 'unknown'
                    });
                });
            });
        })();

    (function() {
        // Payment method instructions toggle
        var paySelect = document.getElementById('checkoutPayment');
        if (paySelect) {
            paySelect.addEventListener('change', function() {
                var mp = document.getElementById('mpesaInstructions');
                var cd = document.getElementById('cardInstructions');
                var bk = document.getElementById('bankInstructions');
                if (mp) mp.style.display = this.value === 'mpesa' ? 'block' : 'none';
                if (cd) cd.style.display = this.value === 'card' ? 'block' : 'none';
                if (bk) bk.style.display = this.value === 'bank' ? 'block' : 'none';
            });
        }

        // Newsletter signup (wired to API with client-side rate limiting)
        (function() {
            var nlForm = document.getElementById('newsletterForm');
            if (!nlForm) return;
            var nlLastSubmit = 0;
            var NL_COOLDOWN = 60000;
            nlForm.addEventListener('submit', async function(e) {
                e.preventDefault();
                var email = document.getElementById('newsletterEmail').value.trim();
                var msg = document.getElementById('newsletterMsg');
                var btn = document.getElementById('newsletterBtn');
                if (!email || !email.includes('@')) { msg.textContent = 'Please enter a valid email.'; msg.style.color = '#e53935'; msg.style.display = 'block'; return; }
                if (Date.now() - nlLastSubmit < NL_COOLDOWN) { msg.textContent = 'Please wait a minute before trying again.'; msg.style.color = '#e53935'; msg.style.display = 'block'; return; }
                btn.disabled = true; btn.textContent = 'Subscribing...'; msg.style.display = 'none';
                try {
                    var res = await fetch(API_URL + '/newsletter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email, source: 'website' }) });
                    var data = await res.json();
                    if (!res.ok) throw new Error(data.message || 'Subscription failed');
                    msg.textContent = 'Thank you for subscribing!'; msg.style.color = '#2e7d32'; msg.style.display = 'block';
                    document.getElementById('newsletterEmail').value = '';
                    nlLastSubmit = Date.now();
                } catch(err) {
                    msg.textContent = err.message || 'Something went wrong. Please try again.'; msg.style.color = '#e53935'; msg.style.display = 'block';
                } finally { btn.disabled = false; btn.textContent = 'Subscribe'; }
            });
        })();

        // Update breadcrumb when category filter changes
        document.querySelectorAll('.filter-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var bc = document.getElementById('breadcrumbCurrent');
                if (bc) bc.textContent = this.dataset.filter === 'all' ? 'All Products' : this.textContent;
            });
        });
        document.querySelectorAll('.gender-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var bc = document.getElementById('breadcrumbCurrent');
                if (bc) bc.textContent = this.dataset.gender === 'all' ? 'All Products' : this.textContent.charAt(0).toUpperCase() + this.textContent.slice(1) + ' Collection';
            });
        });
    })();
    function showSizeTab(tab) {
        ['men','women','kids'].forEach(function(t) {
            var el = document.getElementById('sizeTab' + t.charAt(0).toUpperCase() + t.slice(1));
            if (el) el.style.display = t === tab ? 'block' : 'none';
        });
        document.querySelectorAll('.size-tab').forEach(function(b) {
            b.style.background = b.textContent.toLowerCase() === tab ? 'var(--color-gold)' : 'transparent';
            b.style.color = b.textContent.toLowerCase() === tab ? '#fff' : 'var(--text-secondary)';
            b.style.borderColor = b.textContent.toLowerCase() === tab ? 'var(--color-gold)' : 'var(--border-light)';
        });
    }