// ETAPA DE DESARROLLO — service worker desactivado a propósito.
//
// Este archivo ya no cachea nada: es un "kill switch". Existe para que los
// navegadores que todavía tengan instalada una versión anterior del service
// worker (que sí cacheaba) la reemplacen por esta, borren su caché y lo
// desregistren. Sin esto, un SW viejo seguiría sirviendo la versión anterior
// de la app aunque el HTML nuevo ya no lo registre.
//
// Al no haber handler de `fetch`, todas las peticiones van directo a la red.
//
// Cuando la app esté terminada se puede restaurar la estrategia cache-first
// del template de pwa-builder (ver CLAUDE.md §6).

const CACHE_PREFIX = '07-07-nosotros';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Solo las caches de ESTA app: todas las PWAs del repo comparten
      // origin en GitHub Pages y no deben tocarse entre sí.
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith(CACHE_PREFIX)).map((k) => caches.delete(k))
      );

      await self.registration.unregister();

      // Recarga las pestañas abiertas para que dejen de ver contenido viejo.
      // No genera bucle: tras el unregister ya no hay SW que vuelva a activarse.
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((client) => client.navigate(client.url));
    })()
  );
});
