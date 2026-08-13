const CACHE_NAME = 'equilibra-v3';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',

  './src/db/db.js',
  './src/db/repositories.js',

  './src/logic/balances.js',
  './src/logic/demoCleanup.js',
  './src/logic/equilibrium.js',
  './src/logic/money.js',
  './src/logic/period.js',
  './src/logic/purchaseBuilder.js',
  './src/logic/recommendation.js',
  './src/logic/refunds.js',
  './src/logic/split.js',
  './src/logic/validation.js',
  './src/logic/wording.js',

  './src/state/demoData.js',
  './src/state/store.js',

  './src/ui/nav.js',
  './src/ui/router.js',
  './src/ui/components/avatar.js',
  './src/ui/components/balancePill.js',
  './src/ui/components/charts.js',
  './src/ui/components/confirm.js',
  './src/ui/components/icons.js',
  './src/ui/components/sheet.js',
  './src/ui/components/toast.js',
  './src/ui/views/addChoice.js',
  './src/ui/views/addPurchase.js',
  './src/ui/views/addSettlement.js',
  './src/ui/views/analysis.js',
  './src/ui/views/categoryProducts.js',
  './src/ui/views/group.js',
  './src/ui/views/history.js',
  './src/ui/views/home.js',
  './src/ui/views/onboarding.js',
  './src/ui/views/refund.js',
  './src/ui/views/settings.js',

  './src/utils/avatar.js',
  './src/utils/dom.js',
  './src/utils/format.js',
  './src/utils/prefs.js',
  './src/utils/svg.js',
  './src/utils/theme.js',
  './src/utils/uuid.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});
