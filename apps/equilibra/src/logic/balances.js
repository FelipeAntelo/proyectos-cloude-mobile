// Motor de balances: única fuente de verdad para "cuánto puso cada quien" vs
// "cuánto le correspondía". No se persisten balances derivados: siempre se
// reconstruyen desde personas + compras + compensaciones.
//
//   balance = pagado - consumo_correspondiente + compensaciones_netas
//
// balance > 0  -> aportó de más (le deben)
// balance < 0  -> aportó de menos (debe)
// balance ≈ 0  -> está al día

/**
 * @param {Array<{id:string}>} people
 * @param {Array<{payerId:string, amountCents:number, shares:Record<string,number>}>} purchases
 * @param {Array<{fromPersonId:string, toPersonId:string, amountCents:number}>} settlements
 * @returns {Record<string, {personId:string, paidCents:number, consumedCents:number, settlementNetCents:number, balanceCents:number, purchaseCount:number}>}
 */
export function computeBalances(people, purchases, settlements) {
  const map = {};
  for (const person of people) {
    map[person.id] = {
      personId: person.id,
      paidCents: 0,
      consumedCents: 0,
      settlementNetCents: 0,
      balanceCents: 0,
      purchaseCount: 0,
    };
  }

  for (const purchase of purchases) {
    if (map[purchase.payerId]) {
      map[purchase.payerId].paidCents += purchase.amountCents;
      map[purchase.payerId].purchaseCount += 1;
    }
    for (const [personId, cents] of Object.entries(purchase.shares || {})) {
      if (map[personId]) map[personId].consumedCents += cents;
    }
  }

  for (const settlement of settlements) {
    if (map[settlement.fromPersonId]) map[settlement.fromPersonId].settlementNetCents += settlement.amountCents;
    if (map[settlement.toPersonId]) map[settlement.toPersonId].settlementNetCents -= settlement.amountCents;
  }

  for (const entry of Object.values(map)) {
    entry.balanceCents = entry.paidCents - entry.consumedCents + entry.settlementNetCents;
  }

  return map;
}

export function totalPaidCents(purchases) {
  return purchases.reduce((sum, p) => sum + p.amountCents, 0);
}

export function totalConsumedCents(balancesMap) {
  return Object.values(balancesMap).reduce((sum, b) => sum + b.consumedCents, 0);
}
