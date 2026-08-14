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

// Resuelve Playwright desde varias ubicaciones posibles (entornos sandbox
// remotos y máquinas locales con Playwright instalado globalmente difieren
// en dónde vive el paquete), en vez de asumir una ruta absoluta fija.
const PLAYWRIGHT_CANDIDATES = [
  'playwright',
  '/opt/node22/lib/node_modules/playwright/index.js',
  '/opt/homebrew/lib/node_modules/playwright/index.js',
];
let pkg;
for (const candidate of PLAYWRIGHT_CANDIDATES) {
  try {
    pkg = await import(candidate);
    break;
  } catch {
    // probar la siguiente ubicación
  }
}
if (!pkg) {
  console.error('No se encontró el paquete "playwright" en ninguna ubicación conocida.');
  process.exit(1);
}
const { chromium, devices } = pkg.chromium ? pkg : pkg.default;

const BASE = process.argv[2] || 'http://localhost:8080/index.html';

async function main() {
  const browser = await chromium.launch();

  // clipboard-read/write: el link de invitación se obtiene copiándolo al
  // portapapeles (igual que haría la persona real desde "Copiar enlace"), y
  // Chromium exige permiso explícito para que el script pueda leerlo de vuelta.
  const clipboardPerms = { permissions: ['clipboard-read', 'clipboard-write'] };
  const felipeCtx = await browser.newContext({ ...devices['iPhone 13'], ...clipboardPerms });
  const israelCtx = await browser.newContext({ ...devices['Pixel 5'], ...clipboardPerms });
  const felipe = await felipeCtx.newPage();
  const israel = await israelCtx.newPage();

  const errors = [];
  for (const [name, page] of [['felipe', felipe], ['israel', israel]]) {
    page.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${name}] ${m.text()}`); });
  }

  // 1) Felipe: instalación nueva con sync configurado → pantalla de entrada
  // "Crear un grupo" / "Unirme a un grupo" (no el onboarding local viejo).
  await felipe.goto(BASE, { waitUntil: 'networkidle' });
  await felipe.click('button:has-text("Crear un grupo")');
  await felipe.fill('.sheet input[aria-label="Nombre del grupo"]', 'Oficina');
  await felipe.click('.sheet button:has-text("Crear")');
  await felipe.waitForTimeout(1500);

  // 2) Felipe agrega las 3 personas del grupo desde la pantalla "Grupo"
  // (el sheet "Agregar persona" se cierra solo después de cada alta).
  await felipe.goto(`${BASE}#/group`, { waitUntil: 'networkidle' });
  for (const name of ['Felipe', 'Israel', 'Carlos']) {
    await felipe.click('button:has-text("Agregar persona")');
    await felipe.fill('.sheet input[aria-label="Nombre de la persona"]', name);
    await felipe.click('.sheet button:has-text("Agregar")');
    await felipe.waitForTimeout(300);
  }

  // 3) Felipe genera la invitación y obtiene el link.
  await felipe.click('text=Invitar');
  await felipe.waitForTimeout(1000);
  const inviteUrl = await felipe.evaluate(async () => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Copiar enlace'));
    if (!btn) return null;
    btn.click();
    await new Promise((r) => setTimeout(r, 200));
    const clipboardText = await navigator.clipboard.readText();
    // "Copiar enlace" copia un mensaje de invitación completo
    // ("Únete a nuestro grupo en Equilibra.\n<url>"), no solo la URL.
    const match = clipboardText.match(/https?:\/\/\S+/);
    return match ? match[0] : null;
  }).catch(() => null);

  if (!inviteUrl) {
    console.error('No se pudo obtener el link de invitación (¿credenciales de Supabase configuradas?).');
    await browser.close();
    process.exit(1);
  }
  await felipe.click('.sheet button[aria-label="Cerrar"]').catch(() => {});
  await felipe.waitForTimeout(300);

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

  // 6) Israel debe verla. El pull periódico tarda hasta PERIODIC_PULL_MS
  // (25s en syncService.js) y Realtime depende de que las tablas estén
  // agregadas a la publicación `supabase_realtime` (ver migración
  // 0002_realtime.sql) — para no atar el tiempo del test a ninguno de los
  // dos, se fuerza un ciclo con el botón "Sincronizar ahora" de Ajustes.
  await forceSync(israel);
  await israel.goto(`${BASE}#/history`, { waitUntil: 'networkidle' });
  await israel.waitForTimeout(500);
  const israelSeesCoca = await israel.locator('text=Coca-Cola').count();
  if (!israelSeesCoca) throw new Error('Israel no recibió la compra de Felipe');

  // 7) Israel registra "Café" Bs 30.
  await registerPurchase(israel, { concept: 'Café', amount: '30', payer: 'Israel' });
  await israel.waitForTimeout(1000);
  await forceSync(felipe);
  await felipe.goto(`${BASE}#/history`, { waitUntil: 'networkidle' });
  await felipe.waitForTimeout(500);
  const felipeSeesCafe = await felipe.locator('text=Café').count();
  if (!felipeSeesCafe) throw new Error('Felipe no recibió la compra de Israel');

  // 8) Carlos (vía Felipe) le transfiere Bs 10 a Israel — cubre "transferencias".
  await registerSettlement(felipe, { amount: '10', fromLabel: 'Carlos', toLabel: 'Israel' });
  await israel.waitForTimeout(500);
  await forceSync(israel);
  await israel.goto(`${BASE}#/history`, { waitUntil: 'networkidle' });
  await israel.click('text=Transferencias');
  await israel.waitForTimeout(500);
  const israelSeesTransfer = await israel.locator('text=Carlos').count();
  if (!israelSeesTransfer) throw new Error('Israel no recibió la transferencia de Carlos a Israel');

  // 9) Balances idénticos en ambos dispositivos, e invariante sum(balance)=0
  // verificado sobre el estado real (no texto scrapeado de la UI).
  await forceSync(felipe);
  await felipe.goto(`${BASE}#/`, { waitUntil: 'networkidle' });
  await israel.goto(`${BASE}#/`, { waitUntil: 'networkidle' });
  await felipe.waitForTimeout(500);
  await israel.waitForTimeout(500);

  const felipeBalances = await readBalances(felipe);
  const israelBalances = await readBalances(israel);
  console.log('Balances (Felipe):', felipeBalances);
  console.log('Balances (Israel):', israelBalances);

  if (JSON.stringify(felipeBalances) !== JSON.stringify(israelBalances)) {
    throw new Error('Los balances no coinciden entre los dos dispositivos');
  }
  const sum = Object.values(felipeBalances).reduce((acc, v) => acc + v, 0);
  if (sum !== 0) throw new Error(`Invariante sum(balance)=0 violada: sum=${sum}`);

  // 10) Offline/reconexión: Israel pierde conexión, registra, reconecta.
  await israelCtx.setOffline(true);
  await registerPurchase(israel, { concept: 'Snacks offline', amount: '12', payer: 'Israel' });
  await israel.waitForTimeout(300);
  const pendingText = await israel.evaluate(() => document.body.innerText);
  if (!/pendiente|Sin conexión/i.test(pendingText)) console.warn('No se vio un indicador de pendiente/offline (revisar visualmente).');
  await israelCtx.setOffline(false);
  await israel.waitForTimeout(1500);
  await forceSync(israel);
  await forceSync(felipe);
  await felipe.goto(`${BASE}#/history`, { waitUntil: 'networkidle' });
  await felipe.waitForTimeout(500);
  const felipeSeesOfflinePurchase = await felipe.locator('text=Snacks offline').count();
  if (!felipeSeesOfflinePurchase) throw new Error('La compra registrada offline por Israel no llegó a Felipe tras reconectar');

  await browser.close();

  console.log('\n=== ERRORES DE CONSOLA ===');
  console.log(errors.length === 0 ? 'NINGUNO' : errors.join('\n'));
  console.log('\nOK: escenario E2E multi-dispositivo completo.');
}

async function forceSync(page) {
  await page.goto(`${BASE}#/settings`, { waitUntil: 'networkidle' });
  await page.click('button:has-text("Sincronizar ahora")').catch(() => {});
  await page.waitForTimeout(2000);
}

async function registerSettlement(page, { amount, fromLabel, toLabel }) {
  await page.click('.fab, [aria-label*="gregar" i]');
  await page.waitForTimeout(300);
  await page.click('.sheet button:has-text("Transferencia entre personas")');
  await page.waitForTimeout(300);
  await page.fill('.sheet input[inputmode="decimal"]', amount);
  const chips = page.locator('.sheet .chip-row');
  await chips.nth(0).locator(`button:has-text("${fromLabel}")`).click();
  await chips.nth(1).locator(`button:has-text("${toLabel}")`).click();
  await page.click('.sheet button:has-text("Registrar transferencia")');
  await page.waitForTimeout(500);
}

/** Lee balances reales del estado de la app (no texto de UI) vía import dinámico del módulo de store. */
async function readBalances(page) {
  return page.evaluate(async () => {
    const { getState } = await import('/src/state/store.js');
    const state = getState();
    const out = {};
    for (const person of state.people) out[person.name] = state.balances[person.id]?.balanceCents ?? 0;
    return out;
  });
}

async function registerPurchase(page, { concept, amount, payer }) {
  await page.click('.fab, [aria-label*="gregar" i]');
  await page.waitForTimeout(300);
  // Home también tiene un botón "Registrar compra" propio en su estado
  // vacío: hay que apuntar al del sheet recién abierto, no al de debajo.
  await page.click('.sheet button:has-text("Registrar compra")');
  await page.waitForTimeout(300);
  await page.fill('.sheet input[aria-label="Monto"], .sheet input[inputmode="decimal"]', amount);
  await page.fill('.sheet input[placeholder*="Almuerzo"]', concept);
  await page.click(`.sheet button:has-text("${payer}")`).catch(() => {});
  // El formulario ya arranca con todas las personas activas como
  // participantes por defecto; tocar "Todos" acá lo togglearía a "ninguno".
  await page.click('.sheet button:has-text("Guardar")');
}

main().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});
