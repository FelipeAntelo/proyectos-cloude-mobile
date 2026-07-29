# proyectos-cloude-mobile

Laboratorio personal para crear PWAs (Progressive Web Apps) simples desde el
iPhone con Claude Code: HTML, CSS y JavaScript puro, mobile-first, instalables
desde Safari, con manifest, service worker y soporte offline básico. Se
despliega directamente con GitHub Pages, sin paso de build.

Las reglas permanentes del repositorio están en [`CLAUDE.md`](./CLAUDE.md).
Para crear una PWA nueva, usar el skill `pwa-builder`
(`.claude/skills/pwa-builder/SKILL.md`).

## Apps

- [`apps/carta-interactiva`](./apps/carta-interactiva) — carta que se voltea,
  con botón, animación discreta y contador configurable (PWA de demostración).

## Estructura

```
apps/<slug>/          PWA autocontenida (index.html, styles.css, app.js,
                       manifest.webmanifest, sw.js, icons/)
.claude/skills/        Skills de Claude Code (pwa-builder)
CLAUDE.md               Reglas permanentes del laboratorio
index.html               Landing con el listado de apps
```
