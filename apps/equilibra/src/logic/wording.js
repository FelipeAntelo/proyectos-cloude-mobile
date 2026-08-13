// Traducción de balances/estados financieros a lenguaje cotidiano para la UI.
// El código interno sigue hablando de "balance"/"settlement" (son términos
// técnicos útiles para razonar sobre la contabilidad); esta es la única capa
// responsable de convertir esos números en frases que alguien sin vocabulario
// contable entienda de un vistazo, sin signos +/- ni la palabra "balance".

import { formatCents } from './money.js';

// Diferencias de un par de centavos (arrastradas por redondeo entre varias
// compras) no deberían leerse como "todavía debe algo": por debajo de este
// umbral la persona está, a efectos prácticos, al día.
const EVEN_THRESHOLD_CENTS = 50;

/**
 * @param {number} balanceCents balance - positivo: aportó de más; negativo: aportó de menos
 * @returns {{kind:'favor'|'pending'|'even', title:string, amountCents:number, detail:string}}
 */
export function describeBalance(balanceCents) {
  if (balanceCents > EVEN_THRESHOLD_CENTS) {
    return {
      kind: 'favor',
      title: 'Saldo a favor',
      amountCents: balanceCents,
      detail: 'Adelantó dinero por otros integrantes del grupo.',
    };
  }
  if (balanceCents < -EVEN_THRESHOLD_CENTS) {
    return {
      kind: 'pending',
      title: 'Aporte pendiente',
      amountCents: Math.abs(balanceCents),
      detail: 'Todavía le falta aportar para quedar al día con el grupo.',
    };
  }
  return {
    kind: 'even',
    title: 'Al día',
    amountCents: 0,
    detail: 'Aportó justo lo que le correspondía.',
  };
}

/** "Saldo a favor: Bs 36.67" / "Aporte pendiente: Bs 18.33" / "Al día" */
export function formatBalancePhrase(balanceCents) {
  const d = describeBalance(balanceCents);
  return d.kind === 'even' ? d.title : `${d.title}: ${formatCents(d.amountCents)}`;
}

export const PURCHASE_STATUS_LABELS = {
  pending: 'Pendiente',
  partial: 'Parcialmente saldada',
  settled: 'Saldada',
};

export const PURCHASE_STATUS_HINTS = {
  pending: 'Todavía nadie devolvió lo que le correspondía.',
  partial: 'Ya hay devoluciones registradas, pero falta dinero por devolver.',
  settled: 'Ya está todo cubierto entre devoluciones y lo que pagó cada quien.',
};
