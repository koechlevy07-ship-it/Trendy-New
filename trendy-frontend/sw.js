const CACHE_NAME = 'trendy-v7';
const STATIC_CACHE = 'trendy-static-v7';
const DYNAMIC_CACHE = 'trendy-dynamic-v7';
const IMAGE_CACHE = 'trendy-images-v7';

const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/admin.html',
    '/contact.html',
    '/about.html',
    '/terms.html',
    '/privacy.html',
    '/404.html',
    '/cart.html',
    '/checkout.html',
    '/wishlist.html',
    '/product-details.html',
    '/account.html',
    '/order-confirmation.html',
    '/favicon.svg',
    '/manifest.json'
];

const CACHE_STRATEGIES = {
    STATIC: 'cache-first',
    DYNAMIC: 'stale-while-revalidate',
    IMAGE: 'cache-first',
    API: 'network-first'
};

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then(cache => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
            .catch(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== STATIC_CACHE && key !== DYNAMIC_CACHE && key !== IMAGE_CACHE)
                    .map(key => caches.delete(key))
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    if (request.method !== 'GET') return;

    if (url.origin !== self.location.origin) return;

    if (url.pathname.startsWith('/api/')) {
        event.respondWith(networkFirst(request));
        return;
    }

    if (request.destination === 'image' || url.pathname.match(/\.(jpg|jpeg|png|gif|webp|svg|ico)$/i)) {
        event.respondWith(cacheFirst(request, IMAGE_CACHE));
        return;
    }

    if (url.pathname.match(/\.(css|js)$/i) || url.pathname.startsWith('/fonts/')) {
        event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
        return;
    }

    if (request.mode === 'navigate') {
        event.respondWith(networkFirst(request));
        return;
    }
});

async function cacheFirst(request, cacheName = STATIC_CACHE) {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(cacheName);
            cache.put(request, response.clone());
        }
        return response;
    } catch (err) {
        return new Response('Offline', { status: 503 });
    }
}

async function staleWhileRevalidate(request, cacheName = DYNAMIC_CACHE) {
    const cached = await caches.match(request);
    const fetchPromise = fetch(request).then(response => {
        if (response.ok) {
            const cloned = response.clone();
            caches.open(cacheName).then(c => c.put(request, cloned));
        }
        return response;
    }).catch(() => cached || new Response('Offline', { status: 503 }));

    return cached || fetchPromise;
}

async function networkFirst(request) {
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(DYNAMIC_CACHE);
            cache.put(request, response.clone());
        }
        return response;
    } catch (err) {
        const cached = await caches.match(request);
        if (cached) return cached;

        if (request.mode === 'navigate') {
            const offlinePage = await caches.match('/404.html');
            if (offlinePage) return offlinePage;
        }

        return new Response(JSON.stringify({ error: 'Offline' }), {
            headers: { 'Content-Type': 'application/json' },
            status: 503
        });
    }
}

self.addEventListener('push', (event) => {
    if (!event.data) return;
    try {
        const data = event.data.json();
        event.waitUntil(
            self.registration.showNotification(data.title || 'Trendy Wardrobe', {
                body: data.body || 'You have a new notification',
                icon: '/favicon.svg',
                badge: '/favicon.svg',
                vibrate: [200, 100, 200],
                data: data.url || '/',
                actions: [
                    { action: 'open', title: 'View' },
                    { action: 'dismiss', title: 'Dismiss' }
                ]
            })
        );
    } catch (e) {}
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    if (event.action === 'dismiss') return;
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
            for (const client of clientList) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    return client.focus();
                }
            }
            return clients.openWindow(event.notification.data || '/');
        })
    );
});
