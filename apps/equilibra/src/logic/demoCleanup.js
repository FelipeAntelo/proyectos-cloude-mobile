// Decide qué borrar al eliminar los datos de demostración, sin tocar nada
// real. Los registros creados por loadDemoData() llevan `source: 'demo'`;
// esta función es pura (no toca IndexedDB) para poder testearla sin
// depender del entorno del navegador — repositories.js solo ejecuta el plan
// que devuelve.
//
// Regla de seguridad: una compra o transferencia demo se borra siempre (son
// movimientos, no infraestructura). Una persona/categoría/producto demo se
// borra SOLO si, después de quitar los movimientos demo, ya no queda
// ninguna compra o transferencia real que la siga referenciando. Así, si el
// usuario agregó una compra real usando a "Felipe" (persona de demo) como
// participante, Felipe se conserva — borrarlo dejaría esa compra real con
// una referencia rota.

/**
 * @param {{people: object[], categories: object[], products: object[], purchases: object[], settlements: object[]}} data
 * @returns {{purchaseIds: string[], settlementIds: string[], personIds: string[], categoryIds: string[], productIds: string[]}}
 */
export function planDemoCleanup({ people, categories, products, purchases, settlements }) {
  const demoPurchaseIds = new Set(purchases.filter((p) => p.source === 'demo').map((p) => p.id));

  const settlementIdsToDelete = new Set(
    settlements
      .filter((s) => s.source === 'demo' || (s.purchaseId && demoPurchaseIds.has(s.purchaseId)))
      .map((s) => s.id)
  );

  const remainingPurchases = purchases.filter((p) => !demoPurchaseIds.has(p.id));
  const remainingSettlements = settlements.filter((s) => !settlementIdsToDelete.has(s.id));

  const referencedPersonIds = new Set();
  for (const p of remainingPurchases) {
    referencedPersonIds.add(p.payerId);
    for (const id of p.participantIds) referencedPersonIds.add(id);
  }
  for (const s of remainingSettlements) {
    referencedPersonIds.add(s.fromPersonId);
    referencedPersonIds.add(s.toPersonId);
  }

  const personIdsToDelete = people.filter((p) => p.source === 'demo' && !referencedPersonIds.has(p.id)).map((p) => p.id);

  const referencedCategoryIds = new Set(remainingPurchases.map((p) => p.categoryId).filter(Boolean));
  const referencedProductIds = new Set(remainingPurchases.map((p) => p.productId).filter(Boolean));

  const categoryIdsToDelete = categories.filter((c) => c.source === 'demo' && !referencedCategoryIds.has(c.id)).map((c) => c.id);
  const productIdsToDelete = products.filter((pr) => pr.source === 'demo' && !referencedProductIds.has(pr.id)).map((pr) => pr.id);

  return {
    purchaseIds: [...demoPurchaseIds],
    settlementIds: [...settlementIdsToDelete],
    personIds: personIdsToDelete,
    categoryIds: categoryIdsToDelete,
    productIds: productIdsToDelete,
  };
}

export function hasDemoData({ people, categories, products, purchases, settlements }) {
  return [people, categories, products, purchases, settlements].some((list) => list.some((item) => item.source === 'demo'));
}
