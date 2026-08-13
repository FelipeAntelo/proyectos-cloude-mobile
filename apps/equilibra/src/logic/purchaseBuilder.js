// Traduce el input crudo de la UI (strings, selecciones) a un payload de compra
// ya validado y con la división calculada en centavos. Mantiene a la UI libre
// de lógica financiera.

import { parseAmountToCents } from './money.js';
import { splitEqual, splitWeighted } from './split.js';
import { validatePurchaseInput } from './validation.js';

/**
 * @param {object} input
 * @param {string|number} input.amountInput
 * @param {string} input.concept
 * @param {string|null} input.categoryId
 * @param {string|null} input.productId
 * @param {string} input.payerId
 * @param {string[]} input.participantIds
 * @param {'equal'|'weighted'} input.splitMode
 * @param {Record<string, number>|null} input.weights
 * @param {string} [input.note]
 * @param {string} [input.datetime]
 * @param {string[]} input.peopleIds ids válidos de personas, para validar
 */
export function buildPurchasePayload(input) {
  const amountCents = parseAmountToCents(input.amountInput);
  if (!Number.isInteger(amountCents) || Number.isNaN(amountCents)) {
    throw new Error('Ingresá un monto válido.');
  }
  if (!input.concept || !input.concept.trim()) {
    throw new Error('Ingresá un concepto o producto.');
  }

  let shares;
  if (input.splitMode === 'weighted') {
    shares = splitWeighted(amountCents, input.weights || {});
  } else {
    shares = splitEqual(amountCents, input.participantIds || []);
  }

  const errors = validatePurchaseInput({
    amountCents,
    payerId: input.payerId,
    participantIds: input.participantIds,
    shares,
    peopleIds: input.peopleIds,
  });
  if (errors.length > 0) {
    throw new Error(errors.join(' '));
  }

  return {
    amountCents,
    concept: input.concept.trim(),
    categoryId: input.categoryId || null,
    productId: input.productId || null,
    payerId: input.payerId,
    participantIds: input.participantIds,
    splitMode: input.splitMode === 'weighted' ? 'weighted' : 'equal',
    weights: input.splitMode === 'weighted' ? { ...input.weights } : null,
    shares,
    note: input.note ? input.note.trim() : '',
    datetime: input.datetime || new Date().toISOString(),
  };
}
