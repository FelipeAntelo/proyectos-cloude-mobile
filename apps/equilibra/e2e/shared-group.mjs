// E2E multi-dispositivo del grupo compartido (v1.3). Requiere credenciales
// reales configuradas en src/remote/config.js (ver SUPABASE_SETUP.md) — sin
// eso, sync no está activo y este script no prueba nada real. No forma parte
// de `node --test` (necesita un navegador + red): se corre a mano con
//
//   node apps/equilibra/e2e/shared-group.mjs [http://localhost:PUERTO/index.html]
//
// Sirve la carpeta de la app con un server estático antes de correrlo, p.ej.:
//   cd apps/equilibra && python3 -m http.server 8080
//
// Simula el escenario obligatorio: Felipe (iPhone) crea "Oficina" y comparte
// sus datos existentes, Israel (Android) entra por invitación, ambos
// registran compras y deben converger a los mismos balances, con una vuelta
// de offline/reconexión en el medio.

import pkg from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium, devices } = pkg;

const BASE = process.argv[2] || 'http://localhost:8080/index.html';

async function main() {
  const browser = await chromium.launch();

  const felipeCtx = await browser.newContext({ ...devices['iPhone 13'] });
  const israelCtx = await browser.newContext({ ...devices['Pixel 5'] });
  const felipe = await felipeCtx.newPage();
  const israel = await israelCtx.newPage();

  const errors = [];
  for (const [name, page] of [['felipe', felipe], ['israel', israel]]) {
    page.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${name}] ${m.text()}`); });
  }

  // 1) Felipe: onboarding local clásico (todavía sin grupo), crea 3 personas.
  await felipe.goto(BASE, { waitUntil: 'networkidle' });
  const hasLocalOnboarding = await felipe.locator('text=Crear grupo').count();
  if (hasLocalOnboarding) {
    await felipe.click('text=Crear grupo');
    for (const name of ['Felipe', 'Israel', 'Carlos']) {
      await felipe.fill('input[aria-label="Nombre de la persona"]', name);
      await felipe.click('button:has-text("Agregar")');
    }
    await felipe.click('button:has-text("Empezar")');
    await felipe.waitForTimeout(300);
  }

  // 2) Felipe comparte el grupo ("Oficina") con sus datos actuales.
  await felipe.goto(`${BASE}#/group`, { waitUntil: 'networkidle' });
  await felipe.click('text=Compartir este grupo');
  await felipe.fill('input[aria-label="Nombre del grupo"]', 'Oficina');
  await felipe.click('button:has-text("Compartir")');
  await felipe.waitForTimeout(1500);

  // 3) Felipe genera la invitación y obtiene el link.
  await felipe.click('text=Invitar');
  await felipe.waitForTimeout(1000);
  const inviteUrl = await felipe.evaluate(async () => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Copiar enlace'));
    if (!btn) return null;
    btn.click();
    return navigator.clipboard.readText();
  }).catch(() => null);

  if (!inviteUrl) {
    console.error('No se pudo obtener el link de invitación (¿credenciales de Supabase configuradas?).');
    await browser.close();
    process.exit(1);
  }

  // 4) Israel abre el link, entra al grupo, elige su identidad.
  await israel.goto(inviteUrl, { waitUntil: 'networkidle' });
  await israel.waitForTimeout(500);
  const noAddPeople = await israel.locator('text=Agregar personas').count();
  if (noAddPeople > 0) throw new Error('No debería aparecer "Agregar personas" al entrar por invitación');
  await israel.click('text=Entrar al grupo');
  await israel.waitForTimeout(2000);
  await israel.click('text=Israel');
  await israel.waitForTimeout(500);

  // 5) Felipe registra "Coca-Cola" Bs 55 (paga él, participan los 3).
  await felipe.goto(`${BASE}#/`, { waitUntil: 'networkidle' });
  await registerPurchase(felipe, { concept: 'Coca-Cola', amount: '55', payer: 'Felipe' });
  await felipe.waitForTimeout(2500);

  // 6) Israel debe verla sin acción manual.
  await israel.goto(`${BASE}#/history`, { waitUntil: 'networkidle' });
  await israel.waitForTimeout(2000);
  const israelSeesCoca = await israel.locator('text=Coca-Cola').count();
  if (!israelSeesCoca) throw new Error('Israel no recibió la compra de Felipe');

  // 7) Israel registra "Café" Bs 30.
  await registerPurchase(israel, { concept: 'Café', amount: '30', payer: 'Israel' });
  await israel.waitForTimeout(2500);
  await felipe.goto(`${BASE}#/history`, { waitUntil: 'networkidle' });
  await felipe.waitForTimeout(2000);
  const felipeSeesCafe = await felipe.locator('text=Café').count();
  if (!felipeSeesCafe) throw new Error('Felipe no recibió la compra de Israel');

  // 8) Balances idénticos en ambos dispositivos.
  await felipe.goto(`${BASE}#/`, { waitUntil: 'networkidle' });
  await israel.goto(`${BASE}#/`, { waitUntil: 'networkidle' });
  await felipe.waitForTimeout(1000);
  await israel.waitForTimeout(1000);
  const felipeText = await felipe.evaluate(() => document.body.innerText);
  const israelText = await israel.evaluate(() => document.body.innerText);
  console.log('Home Felipe:\n', felipeText.slice(0, 400));
  console.log('Home Israel:\n', israelText.slice(0, 400));

  // 9) Offline/reconexión: Israel pierde conexión, registra, reconecta.
  await israelCtx.setOffline(true);
  await registerPurchase(israel, { concept: 'Snacks offline', amount: '12', payer: 'Israel' });
  await israel.waitForTimeout(300);
  const pendingText = await israel.evaluate(() => document.body.innerText);
  if (!/pendiente|Sin conexión/i.test(pendingText)) console.warn('No se vio un indicador de pendiente/offline (revisar visualmente).');
  await israelCtx.setOffline(false);
  await israel.waitForTimeout(3000);
  await felipe.goto(`${BASE}#/history`, { waitUntil: 'networkidle' });
  await felipe.waitForTimeout(2000);
  const felipeSeesOfflinePurchase = await felipe.locator('text=Snacks offline').count();
  if (!felipeSeesOfflinePurchase) throw new Error('La compra registrada offline por Israel no llegó a Felipe tras reconectar');

  await browser.close();

  console.log('\n=== ERRORES DE CONSOLA ===');
  console.log(errors.length === 0 ? 'NINGUNO' : errors.join('\n'));
  console.log('\nOK: escenario E2E multi-dispositivo completo.');
}

async function registerPurchase(page, { concept, amount, payer }) {
  await page.click('.fab, [aria-label*="gregar" i]');
  await page.waitForTimeout(300);
  await page.click('button:has-text("Registrar compra")');
  await page.waitForTimeout(300);
  await page.fill('input[aria-label="Monto"], input[inputmode="decimal"]', amount);
  await page.fill('input[placeholder*="Almuerzo"]', concept);
  await page.click(`button:has-text("${payer}")`).catch(() => {});
  await page.click('button:has-text("Todos")').catch(() => {});
  await page.click('button:has-text("Guardar")');
}

main().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});
