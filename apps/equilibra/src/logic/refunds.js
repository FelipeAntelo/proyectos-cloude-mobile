// Progreso de devoluciones de una compra concreta.
//
// No se persiste nada derivado: siempre se recalcula a partir de
// `purchase.shares` (lo que le correspondía a cada quien) y de las
// transferencias (`settlements`) que tengan `purchaseId` igual al de esta
// compra. Cada devolución sigue siendo, contablemente, la misma transferencia
// de dinero entre dos personas que ya afecta el balance global (balances.js);
// acá solo se agrupan por compra para poder mostrar "cuánto falta" en el
// detalle, sin inventar una segunda fuente de verdad.
//
// Un sobrepago (alguien devuelve más de lo que le correspondía en ESA compra)
// dejar "remainingCents" en 0 para esa compra —queda saldada— y el excedente
// no se pierde: como la transferencia completa ya se sumó al balance global
// de la persona en balances.js, ese excedente aparece solo como saldo a favor
// en su balance general. Ver `computeBalances`.

/**
 * @param {{id:string, payerId:string, participantIds:string[], shares:Record<string,number>}} purchase
 * @param {Array<{purchaseId:string|null, fromPersonId:string, amountCents:number}>} settlements
 * @returns {Record<string, {personId:string, owedCents:number, refundedCents:number, remainingCents:number, overpaidCents:number, settled:boolean}>}
 */
export function computePurchaseRefunds(purchase, settlements) {
  const linked = settlements.filter((s) => s.purchaseId === purchase.id);
  const progress = {};

  for (const participantId of purchase.participantIds) {
    if (participantId === purchase.payerId) continue; // quien pagó no tiene nada que devolverse a sí mismo

    const owedCents = purchase.shares[participantId] || 0;
    const refundedCents = linked
      .filter((s) => s.fromPersonId === participantId)
      .reduce((sum, s) => sum + s.amountCents, 0);
    const remainingCents = Math.max(0, owedCents - refundedCents);
    const overpaidCents = Math.max(0, refundedCents - owedCents);

    progress[participantId] = {
      personId: participantId,
      owedCents,
      refundedCents,
      remainingCents,
      overpaidCents,
      settled: remainingCents === 0,
    };
  }

  return progress;
}

/**
 * Estado de una compra: independiente del balance global de cada persona.
 * - 'pending': nadie devolvió nada todavía.
 * - 'partial': hay devoluciones, pero algún participante todavía tiene pendiente.
 * - 'settled': todos los participantes (menos quien pagó) ya cubrieron lo que les correspondía.
 * @param {Record<string, {refundedCents:number, settled:boolean}>} refundProgress
 */
export function purchaseStatus(refundProgress) {
  const entries = Object.values(refundProgress);
  if (entries.length === 0) return 'settled'; // solo participó quien pagó: no hay nada que devolver

  const allSettled = entries.every((e) => e.settled);
  if (allSettled) return 'settled';

  const anyRefunded = entries.some((e) => e.refundedCents > 0);
  return anyRefunded ? 'partial' : 'pending';
}

export function totalPendingCents(refundProgress) {
  return Object.values(refundProgress).reduce((sum, e) => sum + e.remainingCents, 0);
}
