// Validaciones de integridad para compras, compensaciones y divisiones.
// Centralizadas acá para que UI y lógica de negocio compartan las mismas reglas.

import { sumShares } from './split.js';

export function validatePurchaseInput({ amountCents, payerId, participantIds, shares, peopleIds }) {
  const errors = [];

  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    errors.push('El monto debe ser mayor a cero.');
  }
  if (!payerId) {
    errors.push('Debe indicarse quién pagó.');
  }
  if (payerId && peopleIds && !peopleIds.includes(payerId)) {
    errors.push('El pagador no existe.');
  }
  if (!Array.isArray(participantIds) || participantIds.length === 0) {
    errors.push('Debe haber al menos un participante.');
  }
  if (participantIds && peopleIds) {
    const unknown = participantIds.filter((id) => !peopleIds.includes(id));
    if (unknown.length > 0) errors.push('Hay participantes que no existen.');
  }
  if (shares && Number.isInteger(amountCents)) {
    const sum = sumShares(shares);
    if (sum !== amountCents) {
      errors.push('La suma de la división no coincide con el monto total.');
    }
    const shareIds = Object.keys(shares);
    if (participantIds && (shareIds.length !== participantIds.length || participantIds.some((id) => !(id in shares)))) {
      errors.push('La división debe cubrir exactamente a los participantes seleccionados.');
    }
  }

  return errors;
}

export function validateSettlementInput({ amountCents, fromPersonId, toPersonId, peopleIds }) {
  const errors = [];

  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    errors.push('El monto debe ser mayor a cero.');
  }
  if (!fromPersonId || !toPersonId) {
    errors.push('Debe indicarse quién entrega y quién recibe.');
  }
  if (fromPersonId && toPersonId && fromPersonId === toPersonId) {
    errors.push('Quien entrega y quien recibe no pueden ser la misma persona.');
  }
  if (peopleIds) {
    if (fromPersonId && !peopleIds.includes(fromPersonId)) errors.push('La persona que entrega no existe.');
    if (toPersonId && !peopleIds.includes(toPersonId)) errors.push('La persona que recibe no existe.');
  }

  return errors;
}
