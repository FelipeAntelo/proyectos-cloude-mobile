// Motor de recomendación: "¿quién debería pagar la próxima compra?".
//
// Enfoque: en vez de simplemente elegir a quien tiene el balance más negativo,
// se simula el efecto real de que cada candidato pague el monto estimado
// (dividido en partes iguales entre los participantes esperados) y se elige
// el candidato que deja al grupo con menor dispersión de balances (RMS, ver
// equilibrium.js). Esto es más justo que "paga el más negativo" porque tiene
// en cuenta cuánto desequilibrio *introduce* el propio pago: con montos altos
// puede convenir que pague alguien con balance ligeramente positivo si así el
// grupo queda más parejo que dejando a la persona más negativa aún más lejos
// del resto en la dirección opuesta.
//
// Si no se indica un monto estimado, se usa el promedio histórico de compras
// (o un valor por defecto si no hay historial) — el resultado converge al
// simple "balance más negativo" cuando el monto simulado es 0, por lo que ese
// caso queda cubierto por el mismo algoritmo sin una rama aparte.

import { splitEqual } from './split.js';
import { computeBalances } from './balances.js';
import { rms } from './equilibrium.js';

const DEFAULT_FALLBACK_AMOUNT_CENTS = 5000; // Bs 50, solo si no hay historial alguno

export function averagePurchaseAmountCents(purchases) {
  if (purchases.length === 0) return DEFAULT_FALLBACK_AMOUNT_CENTS;
  const total = purchases.reduce((sum, p) => sum + p.amountCents, 0);
  return Math.round(total / purchases.length);
}

/**
 * Simula una compra hipotética con un pagador dado y devuelve los balances resultantes.
 * @returns {Record<string, {balanceCents:number, consumedCents:number}>}
 */
export function simulatePurchase(balancesMap, { payerId, amountCents, participantIds }) {
  const shares = splitEqual(amountCents, participantIds);
  const next = {};
  for (const [id, entry] of Object.entries(balancesMap)) {
    next[id] = { ...entry };
  }
  if (next[payerId]) {
    next[payerId] = { ...next[payerId], paidCents: next[payerId].paidCents + amountCents };
  }
  for (const [personId, cents] of Object.entries(shares)) {
    if (next[personId]) {
      next[personId] = { ...next[personId], consumedCents: next[personId].consumedCents + cents };
    }
  }
  for (const entry of Object.values(next)) {
    entry.balanceCents = entry.paidCents - entry.consumedCents + entry.settlementNetCents;
  }
  return next;
}

/**
 * @param {Array} people
 * @param {Array} purchases
 * @param {Array} settlements
 * @param {object} [options]
 * @param {string[]} [options.participantIds] quiénes consumirían la próxima compra (por defecto: personas activas)
 * @param {string[]} [options.eligiblePayerIds] quiénes pueden ser candidatos a pagar (por defecto: igual a participantIds)
 * @param {number} [options.amountCents] monto estimado de la próxima compra
 */
export function recommendNextPayer(people, purchases, settlements, options = {}) {
  const activeIds = people.filter((p) => p.active).map((p) => p.id);
  const participantIds = options.participantIds && options.participantIds.length ? options.participantIds : activeIds;
  const eligiblePayerIds = options.eligiblePayerIds && options.eligiblePayerIds.length ? options.eligiblePayerIds : participantIds;
  const amountCents = Number.isFinite(options.amountCents) && options.amountCents > 0
    ? Math.round(options.amountCents)
    : averagePurchaseAmountCents(purchases);

  if (participantIds.length === 0 || eligiblePayerIds.length === 0) {
    return null;
  }

  const currentBalances = computeBalances(people, purchases, settlements);
  const currentRms = rms(activeIds.map((id) => currentBalances[id]?.balanceCents ?? 0));

  const candidates = eligiblePayerIds.map((payerId) => {
    const simulated = simulatePurchase(currentBalances, { payerId, amountCents, participantIds });
    const metric = rms(activeIds.map((id) => simulated[id]?.balanceCents ?? 0));
    return {
      payerId,
      metric,
      currentBalanceCents: currentBalances[payerId]?.balanceCents ?? 0,
    };
  });

  candidates.sort((a, b) => {
    if (a.metric !== b.metric) return a.metric - b.metric;
    return a.currentBalanceCents - b.currentBalanceCents; // desempate: el que menos ha aportado
  });

  const best = candidates[0];
  const improvementPct = currentRms > 0 ? Math.round(((currentRms - best.metric) / currentRms) * 100) : 0;

  return {
    payerId: best.payerId,
    amountCents,
    currentRms,
    newRms: best.metric,
    improvementPct,
    candidates,
  };
}
