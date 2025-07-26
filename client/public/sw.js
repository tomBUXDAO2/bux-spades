const CACHE_NAME = 'bux-spades-v1';
const CARD_CACHE_NAME = 'bux-spades-cards-v1';

// Cache card images aggressively
const CARD_IMAGES = [
  '/cards/2C.png', '/cards/2D.png', '/cards/2H.png', '/cards/2S.png',
  '/cards/3C.png', '/cards/3D.png', '/cards/3H.png', '/cards/3S.png',
  '/cards/4C.png', '/cards/4D.png', '/cards/4H.png', '/cards/4S.png',
  '/cards/5C.png', '/cards/5D.png', '/cards/5H.png', '/cards/5S.png',
  '/cards/6C.png', '/cards/6D.png', '/cards/6H.png', '/cards/6S.png',
  '/cards/7C.png', '/cards/7D.png', '/cards/7H.png', '/cards/7S.png',
  '/cards/8C.png', '/cards/8D.png', '/cards/8H.png', '/cards/8S.png',
  '/cards/9C.png', '/cards/9D.png', '/cards/9H.png', '/cards/9S.png',
  '/cards/10C.png', '/cards/10D.png', '/cards/10H.png', '/cards/10S.png',
  '/cards/JC.png', '/cards/JD.png', '/cards/JH.png', '/cards/JS.png',
  '/cards/QC.png', '/cards/QD.png', '/cards/QH.png', '/cards/QS.png',
  '/cards/KC.png', '/cards/KD.png', '/cards/KH.png', '/cards/KS.png',
  '/cards/AC.png', '/cards/AD.png', '/cards/AH.png', '/cards/AS.png',
  '/cards/blue_back.png'
];

// Install event - cache card images
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CARD_CACHE_NAME).then((cache) => {
      console.log('[SW] Caching card images');
      return cache.addAll(CARD_IMAGES);
    })
  );
});

// Fetch event - serve card images from cache
self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('/cards/')) {
    event.respondWith(
      caches.match(event.request).then((response) => {
        // Return cached version or fetch from network
        return response || fetch(event.request).then((fetchResponse) => {
          // Cache the fetched response for future use
          return caches.open(CARD_CACHE_NAME).then((cache) => {
            cache.put(event.request, fetchResponse.clone());
            return fetchResponse;
          });
        });
      })
    );
  }
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== CARD_CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
}); 