// División de una compra entre participantes, siempre en centavos enteros.
// Invariante que ambas funciones garantizan: sum(shares) === amountCents exactamente.

/**
 * División igualitaria. El resto de centavos que no divide exacto se reparte
 * de a un centavo, en el orden de `participantIds`, para que la suma cierre exacta.
 * @param {number} amountCents
 * @param {string[]} participantIds
 * @returns {Record<string, number>} personId -> centavos
 */
export function splitEqual(amountCents, participantIds) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error('El monto debe ser un entero positivo de centavos.');
  }
  if (!Array.isArray(participantIds) || participantIds.length === 0) {
    throw new Error('Debe haber al menos un participante.');
  }

  const n = participantIds.length;
  const base = Math.floor(amountCents / n);
  const remainder = amountCents - base * n;

  const shares = {};
  participantIds.forEach((id, index) => {
    shares[id] = base + (index < remainder ? 1 : 0);
  });
  return shares;
}

/**
 * División ponderada por pesos (cantidades relativas). Usa el método del "mayor resto"
 * (largest remainder method) para que la suma cierre exacta sin sesgar sistemáticamente
 * a la misma persona: primero se asigna el piso proporcional a cada quien, y los centavos
 * sobrantes van a quienes tengan el resto fraccionario más alto.
 * @param {number} amountCents
 * @param {Record<string, number>} weights personId -> peso (> 0)
 * @returns {Record<string, number>} personId -> centavos
 */
export function splitWeighted(amountCents, weights) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error('El monto debe ser un entero positivo de centavos.');
  }
  const entries = Object.entries(weights || {});
  if (entries.length === 0) {
    throw new Error('Debe haber al menos un participante con peso.');
  }
  if (entries.some(([, w]) => !Number.isFinite(w) || w <= 0)) {
    throw new Error('Todos los pesos deben ser números positivos.');
  }

  const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0);

  const provisional = entries.map(([id, w], index) => {
    const raw = (amountCents * w) / totalWeight;
    const floor = Math.floor(raw);
    return { id, floor, fraction: raw - floor, index };
  });

  const assigned = provisional.reduce((sum, p) => sum + p.floor, 0);
  let remainingCents = amountCents - assigned;

  const byFractionDesc = [...provisional].sort((a, b) => {
    if (b.fraction !== a.fraction) return b.fraction - a.fraction;
    return a.index - b.index; // desempate determinista por orden de entrada
  });

  const shares = {};
  provisional.forEach((p) => {
    shares[p.id] = p.floor;
  });
  for (let i = 0; i < byFractionDesc.length && remainingCents > 0; i += 1) {
    shares[byFractionDesc[i].id] += 1;
    remainingCents -= 1;
  }

  return shares;
}

export function sumShares(shares) {
  return Object.values(shares).reduce((sum, v) => sum + v, 0);
}
