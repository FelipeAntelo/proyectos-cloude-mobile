---
name: pwa-builder
description: Genera una PWA nueva en HTML/CSS/JS puro dentro de apps/<slug>/, siguiendo la estructura, checklist de archivos y convenciones fijadas en CLAUDE.md (mobile-first para iPhone, instalable desde Safari, manifest + service worker cache-first, localStorage namespaceado). Usar cuando el usuario pida crear, agregar o generar una nueva PWA, mini-app o proyecto instalable en este repositorio.
---

# PWA Builder

Antes de generar nada, releer `CLAUDE.md` en la raíz del repo — sus reglas son
obligatorias y tienen prioridad sobre cualquier atajo de este skill.

## 1. Reunir datos con el usuario

Si no vinieron ya en el pedido, preguntar:

- Nombre de la app y `slug` en kebab-case (carpeta `apps/<slug>/`)
- Descripción corta (para `manifest` y meta `description`)
- `short_name` (máx. ~12 caracteres, para el ícono de home screen en iOS)
- Color principal / tema (`background_color`, `theme_color`)
- Funcionalidad concreta a implementar

## 2. Checklist de archivos (crear en este orden)

1. `apps/<slug>/manifest.webmanifest`
2. `apps/<slug>/sw.js`
3. `apps/<slug>/styles.css`
4. `apps/<slug>/app.js`
5. `apps/<slug>/index.html`
6. `apps/<slug>/icons/apple-touch-icon.png` (180x180)
7. `apps/<slug>/icons/icon-192.png`
8. `apps/<slug>/icons/icon-512.png`
9. Actualizar el listado de apps en el `index.html` raíz del repo

## 3. Template de `manifest.webmanifest`

```json
{
  "name": "<Nombre completo>",
  "short_name": "<Nombre corto>",
  "description": "<Descripción corta>",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#0f1115",
  "theme_color": "#0f1115",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" }
  ]
}
```

## 4. Meta tags obligatorios en `index.html` (copiar tal cual, adaptando valores)

```html
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title><Nombre></title>
<meta name="description" content="<Descripción corta>" />

<link rel="manifest" href="manifest.webmanifest" />
<meta name="theme-color" content="#0f1115" />

<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="<Nombre corto>" />
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png" />
<link rel="apple-touch-icon" sizes="180x180" href="icons/apple-touch-icon.png" />
<link rel="icon" href="icons/icon-192.png" type="image/png" />

<link rel="stylesheet" href="styles.css" />
```

Antes de `</body>`:

```html
<script>
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(console.error);
    });
  }
</script>
<script src="app.js" defer></script>
```

## 5. Template de `sw.js` (cache-first, app shell)

```js
const CACHE_NAME = '<slug>-v1';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
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
```

Recordar subir `CACHE_NAME` (`v2`, `v3`...) cada vez que cambie algún archivo
del `APP_SHELL`.

## 6. Base de `styles.css` (mobile-first + safe areas)

```css
* { box-sizing: border-box; }

html, body {
  margin: 0;
  min-height: 100dvh;
}

body {
  padding: env(safe-area-inset-top) env(safe-area-inset-right)
           env(safe-area-inset-bottom) env(safe-area-inset-left);
  font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  -webkit-tap-highlight-color: transparent;
  overscroll-behavior: none;
  background: #0f1115;
  color: #f2f2f2;
}

button {
  min-height: 44px;
  min-width: 44px;
}
```

Ampliar con estilos propios de la app siempre partiendo de este bloque base.

## 7. `app.js`

- Leer/escribir `localStorage` SIEMPRE con prefijo `pwa-lab:<slug>:`.
- Envolver `JSON.parse` en `try/catch` con default seguro.
- Nada de dependencias externas ni `fetch` a APIs de terceros.

## 8. Íconos placeholder

El entorno no tiene ImageMagick ni PIL instalados. Generar los PNG placeholder
con un mini-encoder PNG en Python puro (usando solo `zlib` y `struct` de la
stdlib, sin instalar nada) que dibuje un cuadrado de color sólido (o con una
forma simple centrada) en 180x180, 192x192 y 512x512, usando el
`background_color` del manifest de la app. Documentar en el commit que son
placeholders y que el usuario puede reemplazarlos por arte real después.

## 9. Al terminar

- Sumar la app al array de apps listadas en el `index.html` raíz del repo.
- Repasar el checklist de la sección 11 de `CLAUDE.md` antes de considerar la
  PWA lista.
