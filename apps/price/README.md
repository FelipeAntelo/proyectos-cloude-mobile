# PRICE

Seguimiento automatizado de precios con alertas push. PWA (React + TypeScript +
Tailwind) servida por un Cloudflare Worker con D1 y Cron Triggers.

> Excepción autorizada a las reglas del laboratorio (`CLAUDE.md`): esta app usa
> build y backend **solo dentro de `apps/price/`**. No se publica en GitHub Pages.

## Estructura

```
src/worker/        Worker: API, monitor programado, adaptadores, Web Push
  adapters/        Un archivo por tienda (bestbuy, ebay) + registry
  domain/          Lógica pura: variantes, alertas, financiación, impuestos
src/web/           PWA (React)
public/            manifest.webmanifest, sw.js, íconos
migrations/        Esquema D1
test/              Unit + integración (Vitest en workerd)
e2e/               Smoke test Playwright (viewport iPhone 11)
docs/              Documentación por fases
```

## Comandos

```
npm ci
npm run typecheck
npm run build
npm test
```

Despliegue: GitHub Actions (`.github/workflows/price.yml`) → Cloudflare.
Secretos (GitHub → Settings → Secrets and variables → Actions):
`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (opcional), `PRICE_SETUP_CODE`,
`BESTBUY_API_KEY`, `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`.

## Documentación

- [Fase 1 — evaluación y decisiones](docs/fase-1-evaluacion.md)
- [Fase 2 — fuentes, descubrimiento, backend y costes](docs/fase-2-fuentes-y-backend.md)
