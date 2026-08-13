// Métrica de desigualdad y de equilibrio del grupo.
//
// Dispersión (RMS de los balances): se usa la raíz del promedio de los balances
// al cuadrado, en vez de la simple suma de valores absolutos, para el motor de
// RECOMENDACIÓN (recommendation.js), donde interesa penalizar más un desbalance
// grande concentrado en una persona que varios chicos repartidos al comparar
// candidatos entre sí.
//
//   RMS = sqrt( (1/n) * Σ balance_i² )
//
// Indicador de equilibrio (0-100%): acá el objetivo es distinto — no comparar
// candidatos, sino dar un número absoluto que el usuario pueda leer de un
// vistazo. Se usa la fracción del dinero total que está "fuera de lugar":
//
//   imbalance   = Σ |balance_i| / 2         (el total que habría que mover para saldar todo)
//   equilibrio% = 100 * clamp(1 - imbalance / gastoTotal, 0, 1)
//
// Se divide por 2 porque cada Bs de desequilibrio aparece dos veces en la suma
// de valores absolutos (una vez en quien aportó de más, otra en quien aportó de
// menos). Normalizar contra el *gasto total del grupo* (no el promedio por
// persona) es lo que evita que el indicador caiga a 0% apenas se registra una
// única compra pagada por una sola persona —algo perfectamente normal al usar
// la app recién empezando— y en cambio solo se acerca a 0% cuando el
// desequilibrio acumulado (a través de muchos movimientos) es comparable al
// gasto total del grupo. Es scale-invariant (Bs 50 o Bs 5000 dan el mismo
// resultado si la proporción es la misma) y 100% solo se alcanza con balances
// en cero exacto.
//
// Sin actividad (gasto total 0) se considera perfectamente equilibrado (100%)
// porque no hay nada que repartir todavía.

export function rms(values) {
  if (values.length === 0) return 0;
  const meanSquare = values.reduce((sum, v) => sum + v * v, 0) / values.length;
  return Math.sqrt(meanSquare);
}

export function sumAbs(values) {
  return values.reduce((sum, v) => sum + Math.abs(v), 0);
}

/**
 * @param {Record<string, {balanceCents:number, consumedCents:number}>} balancesMap
 * @param {string[]} [personIds] restringe el cálculo a estas personas (por defecto todas las del mapa)
 */
export function equilibriumScore(balancesMap, personIds) {
  const entries = personIds ? personIds.map((id) => balancesMap[id]).filter(Boolean) : Object.values(balancesMap);
  if (entries.length === 0) return 100;

  const balances = entries.map((e) => e.balanceCents);
  const totalSpend = entries.reduce((sum, e) => sum + e.consumedCents, 0);

  if (totalSpend <= 0) return 100;

  const imbalance = sumAbs(balances) / 2;
  const ratio = imbalance / totalSpend;
  const score = 100 * Math.max(0, Math.min(1, 1 - ratio));
  return Math.round(score);
}
