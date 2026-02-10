// Service Worker - Heizungseffizienz App
// Nur diese Zeile für Updates ändern:
const APP_VERSION = '1.7'; // ← Hier Version erhöhen zum Testen
const CACHE_NAME = `heizungseffizienz-v${APP_VERSION}`;
const APP_NAME = 'Heizungseffizienz';

const urlsToCache = [
    './',
    './index.html',
    './styles.css', 
    './app.js',
    './manifest.json',
    './icons/icon-72x72.png',
    './icons/icon-96x96.png',
    './icons/icon-128x128.png',
    './icons/icon-144x144.png',
    './icons/icon-152x152.png',
    './icons/icon-192x192.png',
    './icons/icon-384x384.png',
    './icons/icon-512x512.png'
];

// Installation - Aggressive Update-Strategie
self.addEventListener('install', event => {
    console.log(`🔄 Service Worker installiert - Version ${APP_VERSION}`);
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('📦 Cache geöffnet:', CACHE_NAME);
                return cache.addAll(urlsToCache);
            })
            .then(() => {
                console.log('✅ Alle Dateien gecacht');
                // Sofort übernehmen ohne Warten
                return self.skipWaiting();
            })
            .catch(error => {
                console.error('❌ Fehler beim Cachen:', error);
            })
    );
});

// Aktivierung - Aggressive Cache-Säuberung
self.addEventListener('activate', event => {
    console.log(`🚀 Service Worker aktiviert - Version ${APP_VERSION}`);
    
    event.waitUntil(
        Promise.all([
            // Alte Caches löschen
            caches.keys().then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        if (cacheName.startsWith('heizungseffizienz-v') && cacheName !== CACHE_NAME) {
                            console.log('🗑️ Lösche alten Cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            }),
            // Sofort alle Clients übernehmen
            self.clients.claim().then(() => {
                console.log('👑 Service Worker hat Kontrolle übernommen');
                // Benachrichtige alle Clients über Update
                return self.clients.matchAll().then(clients => {
                    clients.forEach(client => {
                        client.postMessage({
                            type: 'SW_UPDATED',
                            version: APP_VERSION
                        });
                    });
                });
            })
        ])
    );
});

// Fetch - Network First für bessere Updates
self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;
    
    const url = new URL(event.request.url);
    const isNavigationRequest = event.request.mode === 'navigate';
    const isAsset = url.pathname.endsWith('.html') || 
                   url.pathname.endsWith('.js') || 
                   url.pathname.endsWith('.css') ||
                   url.pathname === '/';

    if (isNavigationRequest || isAsset) {
        // Network First für schnelle Updates
        event.respondWith(
            fetch(event.request, { cache: 'no-cache' })
                .then(response => {
                    if (response && response.status === 200) {
                        const responseClone = response.clone();
                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(event.request, responseClone);
                        });
                    }
                    return response;
                })
                .catch(() => {
                    // Fallback auf Cache
                    return caches.match(event.request)
                        .then(cachedResponse => {
                            if (cachedResponse) {
                                return cachedResponse;
                            }
                            if (isNavigationRequest) {
                                return caches.match('./index.html');
                            }
                            throw new Error('Keine Cache-Antwort verfügbar');
                        });
                })
        );
    } else {
        // Cache First für Icons und andere Assets
        event.respondWith(
            caches.match(event.request)
                .then(cachedResponse => {
                    return cachedResponse || fetch(event.request);
                })
        );
    }
});

// Message Handler für Update-Kommunikation
self.addEventListener('message', event => {
    const message = event.data;
    
    if (!message) return;

    switch (message.type) {
        case 'SKIP_WAITING':
            console.log('⚡ Force Update angefordert');
            self.skipWaiting();
            break;
            
        case 'GET_VERSION':
            if (event.ports && event.ports[0]) {
                event.ports[0].postMessage({
                    type: 'VERSION_INFO',
                    version: APP_VERSION,
                    cacheVersion: CACHE_NAME,
                    appName: APP_NAME
                });
            }
            break;
            
        case 'CLEAR_CACHE':
            event.waitUntil(
                caches.delete(CACHE_NAME).then(() => {
                    console.log('🧹 Cache gelöscht auf Benutzeranfrage');
                    if (event.ports && event.ports[0]) {
                        event.ports[0].postMessage({
                            type: 'CACHE_CLEARED',
                            success: true
                        });
                    }
                })
            );
            break;
    }
});

console.log(`🏠 ${APP_NAME} Service Worker geladen - Version ${APP_VERSION}`);
