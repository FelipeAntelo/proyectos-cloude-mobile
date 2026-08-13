// Manejo de dinero en centavos (enteros) para evitar errores de punto flotante.
// Todo monto se representa internamente como un entero de "centavos" (1 Bs = 100 centavos).

const DEFAULT_CURRENCY = 'BOB';

const CURRENCY_SYMBOLS = {
  BOB: 'Bs',
};

/** Convierte un string/número ingresado por el usuario (ej. "12.5") a centavos enteros. */
export function parseAmountToCents(input) {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return NaN;
    return Math.round(input * 100);
  }
  const normalized = String(input).trim().replace(',', '.');
  if (normalized === '') return NaN;
  const value = Number(normalized);
  if (!Number.isFinite(value)) return NaN;
  return Math.round(value * 100);
}

/** Convierte centavos enteros a un número decimal (para cálculos, no para mostrar). */
export function centsToAmount(cents) {
  return cents / 100;
}

/** Formatea centavos como texto de moneda legible, ej. "Bs 120.50". */
export function formatCents(cents, currency = DEFAULT_CURRENCY) {
  const symbol = CURRENCY_SYMBOLS[currency] || currency;
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const fraction = String(abs % 100).padStart(2, '0');
  return `${sign}${symbol} ${whole.toLocaleString('es-BO')}.${fraction}`;
}

/** Formatea un balance con signo explícito (+ / −) para no depender solo del color. */
export function formatSignedCents(cents, currency = DEFAULT_CURRENCY) {
  if (cents === 0) return formatCents(0, currency);
  const sign = cents > 0 ? '+' : '−';
  return `${sign} ${formatCents(Math.abs(cents), currency)}`;
}

export { DEFAULT_CURRENCY };
