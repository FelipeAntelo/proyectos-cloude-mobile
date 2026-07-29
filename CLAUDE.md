# CLAUDE.md — Reglas permanentes de este repositorio

Este repositorio es un laboratorio personal para crear **Progressive Web Apps (PWAs)
simples**, construidas y probadas desde un iPhone con Claude Code, e instalables
desde Safari iOS. Estas reglas son PERMANENTES: aplican a toda PWA presente y futura
en este repo, salvo que el usuario pida explícitamente lo contrario.

## 1. Stack permitido

- Solo **HTML, CSS y JavaScript puro** (vanilla). Sin frameworks, sin librerías de UI,
  sin bundlers, sin transpilers, sin paso de build.
- Todo archivo debe poder abrirse tal cual en el navegador / servirse como archivo
  estático, sin `npm install`, sin `package.json`, sin compilación.
- JavaScript simple, con `<script defer>` o inline al final del `<body>`, sin
  dependencias externas vía CDN salvo que el usuario lo pida explícitamente.

## 2. Estructura obligatoria de cada PWA

Cada PWA vive en `apps/<slug>/` (slug en kebab-case) y es **autocontenida**:

```
apps/<slug>/
├── index.html
├── styles.css
├── app.js
├── manifest.webmanifest
├── sw.js
└── icons/
    ├── apple-touch-icon.png   (180x180)
    ├── icon-192.png
    └── icon-512.png
```

No se comparten archivos JS/CSS entre apps. Cada carpeta debe poder copiarse o
borrarse sin afectar a las demás.

## 3. Mobile-first / iPhone

- CSS mobile-first: estilos base para pantalla chica primero, `@media` solo para
  ampliar hacia arriba si hace falta.
- Viewport obligatorio: `viewport-fit=cover` para poder usar `env(safe-area-inset-*)`.
- Respetar los *safe areas* del iPhone (notch / Dynamic Island / home indicator)
  aplicando padding con `env(safe-area-inset-top/right/bottom/left)` en el
  contenedor raíz.
- Todo elemento interactivo (botones, links) con área táctil mínima de 44x44px
  (guía de Apple HIG).
- Tipografía del sistema: `-apple-system, BlinkMacSystemFont, system-ui, sans-serif`.
- `-webkit-tap-highlight-color: transparent;` y `overscroll-behavior: none;` en
  `body` para look de app nativa.

## 4. Instalabilidad en iOS Safari (obligatorio en `<head>`)

Todo `index.html` de una PWA debe incluir, sin excepción:

```html
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />

<link rel="manifest" href="manifest.webmanifest" />
<meta name="theme-color" content="#0f1115" />

<!-- Soporte standalone en iOS (Safari ignora el "display" del manifest) -->
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="<Nombre corto>" />
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png" />
<link rel="apple-touch-icon" sizes="180x180" href="icons/apple-touch-icon.png" />
<link rel="icon" href="icons/icon-192.png" type="image/png" />
```

Notas de Safari iOS a tener siempre presentes:

- El ícono de home screen SOLO se toma de `apple-touch-icon` (PNG, 180x180).
  Safari ignora los `icons` del manifest para esto.
- El color de la status bar en modo standalone lo controla
  `apple-mobile-web-app-status-bar-style`, NO `theme-color` del manifest.
- Con `status-bar-style: black-translucent` el contenido pasa por debajo de la
  status bar → es obligatorio el padding con `env(safe-area-inset-top)`.
- Safari solo instala PWAs servidas por HTTPS (GitHub Pages cumple esto).
- El almacenamiento (`localStorage`, Cache Storage) de una PWA agregada a la
  pantalla de inicio es una instancia AISLADA de la de Safari normal — probar
  siempre en modo "app instalada", no solo en una pestaña de Safari.
- iOS puede purgar Service Workers y su cache tras ~7 días sin uso (ITP). Diseñar
  asumiendo que el offline puede perderse y el SW puede re-registrarse solo.

## 5. `manifest.webmanifest`

- Nombre de archivo fijo: `manifest.webmanifest` (no `manifest.json`).
- `start_url` y `scope` siempre relativos: `"./"`.
- Debe incluir al menos `icon-192.png` y `icon-512.png` (`purpose: "any"`).
- Campos obligatorios: `name`, `short_name`, `start_url`, `scope`,
  `display: "standalone"`, `background_color`, `theme_color`, `icons`.

## 6. Service Worker

- Archivo `sw.js` en la raíz de cada `apps/<slug>/` (así el scope por defecto
  queda limitado a esa carpeta, sin tocar otras PWAs — no hace falta cabecera
  `Service-Worker-Allowed`).
- Estrategia: **cache-first** para el app shell (`index.html`, `styles.css`,
  `app.js`, `manifest.webmanifest`, íconos), con fallback a red y luego a
  `index.html` cacheado si falla todo (offline).
- `CACHE_NAME` con versión explícita: `"<slug>-v1"`. Al modificar el app shell
  hay que incrementar la versión (`v2`, `v3`, ...) para forzar la actualización
  del cache — iOS Safari es especialmente conservador reusando SW viejos.
- El `activate` debe borrar caches de versiones anteriores del mismo slug.
- Registro siempre condicionado a `'serviceWorker' in navigator` y con ruta
  relativa `sw.js`.

## 7. `localStorage`

- Toda key debe namespacearse con el slug: `pwa-lab:<slug>:<key>`
  (ej: `pwa-lab:carta-interactiva:counter`).
  **Motivo:** todas las PWAs del repo comparten el mismo origin en GitHub
  Pages; sin este prefijo, dos apps con una key igual (`"counter"`) se
  pisarían los datos entre sí.
- Guardar solo datos simples (strings/números/JSON pequeño). Nada de datos
  sensibles.
- Siempre leer con valores por defecto seguros (la primera vez no hay nada
  guardado) y con `try/catch` alrededor de `JSON.parse`.

## 8. GitHub Pages

- El repo se sirve con GitHub Pages "clásico" (Deploy from a branch, `main` /
  raíz). El archivo `.nojekyll` en la raíz evita que Pages procese el sitio
  con Jekyll.
- Todas las rutas dentro de una PWA (manifest, iconos, sw.js, css, js) deben
  ser **relativas**, nunca absolutas desde `/`, para que cada app funcione
  igual sin importar el nombre del repo o el subpath.
- Cada PWA nueva agregada en `apps/<slug>/` queda accesible automáticamente en
  `https://<usuario>.github.io/<repo>/apps/<slug>/` sin configuración extra.

## 9. Qué NO agregar todavía

No agregar, salvo pedido explícito y puntual del usuario:

- Frameworks o librerías de UI (React, Vue, Svelte, Tailwind, etc.)
- Bundlers/build tools (Vite, Webpack, esbuild, npm/yarn/pnpm, `package.json`)
- Plugins de Claude Code
- Servidores MCP
- Bases de datos (locales o remotas)
- Servicios externos: analytics, APIs de terceros, fuentes/CDNs externas
- Autenticación / backends

## 10. Cómo crear una PWA nueva

Usar el skill `pwa-builder` (`.claude/skills/pwa-builder/SKILL.md`), que aplica
automáticamente toda esta checklist y los templates de manifest/SW/meta tags.
Después de crear la app, sumarla también al listado en el `index.html` raíz.

## 11. Checklist antes de dar por terminada una PWA

- [ ] Abre y funciona en Safari iOS (viewport, safe areas, tamaños táctiles OK)
- [ ] "Compartir → Agregar a inicio" instala un ícono correcto (no genérico)
- [ ] Abierta desde el ícono de home screen corre en modo standalone (sin barra
      de Safari)
- [ ] En modo avión / sin red, la app sigue abriendo (app shell cacheado)
- [ ] Los datos persisten entre sesiones (`localStorage` namespaceado)
- [ ] No hay dependencias externas ni llamadas de red no esenciales
