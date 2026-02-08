// Service Worker - Heizungseffizienz App
// Keine externen Dependencies - alles inline

const APP_VERSION = '1.0'; // ← Nur diese Zeile für Updates ändern
const CACHE_NAME = `heizungseffizienz-v${APP_VERSION}`;
const APP_NAME = 'Heizungseffizienz';

const urlsToCache = [
    './',
    './index.html',
    './styles.css',
    './app.js',
    './manifest.json',
    './logo.png',
    './icons/icon-72x72.png',
    './icons/icon-96x96.png',
    './icons/icon-128x128.png',
    './icons/icon-144x144.png',
    './icons/icon-152x152.png',
    './icons/icon-192x192.png',
    './icons/icon-384x384.png',
    './icons/icon-512x512.png'
];

// Installation
self.addEventListener('install', event => {
    console.log(`Service Worker installiert - Version ${APP_VERSION}`);
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Cache geöffnet:', CACHE_NAME);
                return cache.addAll(urlsToCache);
            })
            .catch(error => {
                console.error('Fehler beim Cachen der Dateien:', error);
            })
    );
    // Sofortige Aktivierung für Updates
    self.skipWaiting();
});

// Aktivierung - lösche alte Caches
self.addEventListener('activate', event => {
    console.log(`Service Worker aktiviert - Version ${APP_VERSION}`);
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    // Lösche nur Heizungseffizienz Caches, die nicht die aktuelle Version sind
                    if (cacheName.startsWith('heizungseffizienz-v') && cacheName !== CACHE_NAME) {
                        console.log('Lösche alten Cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    // Übernehme sofort die Kontrolle über alle Clients
    return self.clients.claim();
});

// Fetch Events - Intelligente Caching-Strategie
self.addEventListener('fetch', event => {
    // Nur GET-Requests cachen
    if (event.request.method !== 'GET') {
        return;
    }

    const url = new URL(event.request.url);
    const isNavigationRequest = event.request.mode === 'navigate';
    const isHTMLRequest = event.request.destination === 'document' || 
                         url.pathname.endsWith('.html') || 
                         url.pathname === '/' ||
                         url.pathname.endsWith('/');

    // Für HTML/Navigation: Network First (für schnelle Updates)
    if (isNavigationRequest || isHTMLRequest) {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    // Bei erfolgreichem Network-Request, Cache aktualisieren
                    if (response && response.status === 200) {
                        const responseClone = response.clone();
                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(event.request, responseClone);
                        });
                    }
                    return response;
                })
                .catch(() => {
                    // Bei Netzwerkfehler, Cache verwenden
                    return caches.match(event.request)
                        .then(cachedResponse => {
                            if (cachedResponse) {
                                return cachedResponse;
                            }
                            // Fallback für Navigation-Requests
                            if (isNavigationRequest) {
                                return caches.match('./index.html');
                            }
                            throw new Error('Keine Cache-Antwort verfügbar');
                        });
                })
        );
    }
    // Für Assets (CSS, JS, Bilder): Cache First (Performance)
    else {
        event.respondWith(
            caches.match(event.request)
                .then(cachedResponse => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    
                    // Falls nicht im Cache, vom Netzwerk laden
                    return fetch(event.request).then(response => {
                        // Nur erfolgreiche Responses cachen
                        if (response && response.status === 200) {
                            const responseClone = response.clone();
                            caches.open(CACHE_NAME).then(cache => {
                                cache.put(event.request, responseClone);
                            });
                        }
                        return response;
                    });
                })
        );
    }
});

// Message Handler für Update-Benachrichtigungen und Kommunikation
self.addEventListener('message', event => {
    const message = event.data;
    
    if (!message) return;

    switch (message.type) {
        case 'SKIP_WAITING':
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
                    console.log('Cache gelöscht auf Benutzeranfrage');
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

// Background Sync (für zukünftige Features)
self.addEventListener('sync', event => {
    console.log('Background Sync Event:', event.tag);
    
    if (event.tag === 'background-sync') {
        event.waitUntil(
            Promise.resolve().then(() => {
                console.log('Background Sync ausgeführt');
                return self.registration.showNotification(`${APP_NAME} - Sync`, {
                    body: 'Daten wurden im Hintergrund synchronisiert',
                    icon: './icons/icon-192x192.png',
                    badge: './icons/icon-96x96.png',
                    tag: 'sync-notification'
                });
            })
        );
    }
});

// Push Notifications mit Update-Support
self.addEventListener('push', event => {
    let notificationData = {
        title: APP_NAME,
        body: `${APP_NAME} wurde aktualisiert!`,
        icon: './icons/icon-192x192.png',
        badge: './icons/icon-96x96.png'
    };

    // Falls Push-Daten vorhanden sind
    if (event.data) {
        try {
            const pushData = event.data.json();
            notificationData = {
                ...notificationData,
                ...pushData
            };
        } catch (e) {
            // Falls JSON-Parsing fehlschlägt, Text verwenden
            notificationData.body = event.data.text() || notificationData.body;
        }
    }

    const options = {
        body: notificationData.body,
        icon: notificationData.icon,
        badge: notificationData.badge,
        vibrate: [100, 50, 100],
        tag: 'heating-update',
        data: {
            dateOfArrival: Date.now(),
            primaryKey: 1,
            type: 'update',
            url: './'
        },
        actions: [
            {
                action: 'explore',
                title: 'App öffnen',
                icon: './icons/icon-96x96.png'
            },
            {
                action: 'close',
                title: 'Später',
                icon: './icons/icon-96x96.png'
            }
        ]
    };

    event.waitUntil(
        self.registration.showNotification(notificationData.title, options)
    );
});

// Notification Click Handler
self.addEventListener('notificationclick', event => {
    console.log('Notification Click:', event.action);
    event.notification.close();

    if (event.action === 'explore' || !event.action) {
        // App öffnen oder in den Vordergrund bringen
        event.waitUntil(
            clients.matchAll({
                type: 'window',
                includeUncontrolled: true
            }).then(clientList => {
                // Prüfen ob App bereits geöffnet ist
                for (const client of clientList) {
                    if (client.url.includes(self.location.origin) && 'focus' in client) {
                        return client.focus();
                    }
                }
                // Falls nicht geöffnet, neue Instanz öffnen
                if (clients.openWindow) {
                    return clients.openWindow('./');
                }
            })
        );
    }
});

// Error Handler für unbehandelte Errors
self.addEventListener('error', event => {
    console.error('Service Worker Error:', event.error);
});

// Unhandled Promise Rejections
self.addEventListener('unhandledrejection', event => {
    console.error('Service Worker Unhandled Promise Rejection:', event.reason);
});

// Logging für Debugging
console.log(`Heizungseffizienz Service Worker geladen - Version ${APP_VERSION}`);
console.log('Cache Name:', CACHE_NAME);
console.log('Zu cachende URLs:', urlsToCache.length);
