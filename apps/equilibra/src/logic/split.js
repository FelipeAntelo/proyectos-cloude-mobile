// División de una compra entre participantes, siempre en centavos enteros.
// Invariante que ambas funciones garantizan: sum(shares) === amountCents exactamente.

function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * División igualitaria. El resto de centavos que no divide exacto (ej. Bs 55
 * entre 3 personas: 18.33 / 18.33 / 18.34) se reparte de a un centavo.
 *
 * Política de reparto del resto: en vez de darle siempre el centavo extra a
 * quienes aparecen primero en `participantIds` (lo que sesga sistemáticamente
 * a la misma persona si, por ejemplo, siempre se selecciona en el mismo orden
 * o siempre paga la primera persona de la lista), el punto de partida rota de
 * forma determinista según un hash del monto y el conjunto de participantes.
 * Así, para la MISMA compra el resultado es siempre idéntico (recalculable de
 * forma segura), pero a lo largo de muchas compras el centavo de más no cae
 * siempre en la misma persona. Es una decisión deliberadamente simple: no
 * hace falta un historial ni estado adicional, solo los datos de la propia
 * compra.
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
  participantIds.forEach((id) => {
    shares[id] = base;
  });

  if (remainder > 0) {
    const start = hashSeed(`${amountCents}:${participantIds.join(',')}`) % n;
    for (let i = 0; i < remainder; i += 1) {
      const id = participantIds[(start + i) % n];
      shares[id] += 1;
    }
  }

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
