const dayFormatter = new Intl.DateTimeFormat('es-BO', { day: 'numeric', month: 'short' });
const dayYearFormatter = new Intl.DateTimeFormat('es-BO', { day: 'numeric', month: 'short', year: 'numeric' });
const timeFormatter = new Intl.DateTimeFormat('es-BO', { hour: '2-digit', minute: '2-digit' });
const longFormatter = new Intl.DateTimeFormat('es-BO', { weekday: 'long', day: 'numeric', month: 'long' });

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function formatDayLabel(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (isSameDay(date, now)) return 'Hoy';
  if (isSameDay(date, yesterday)) return 'Ayer';
  if (date.getFullYear() === now.getFullYear()) return capitalize(dayFormatter.format(date));
  return capitalize(dayYearFormatter.format(date));
}

export function formatTime(isoString) {
  return timeFormatter.format(new Date(isoString));
}

export function formatLong(isoString) {
  return capitalize(longFormatter.format(new Date(isoString)));
}

export function toDatetimeLocalValue(isoString) {
  const date = new Date(isoString);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromDatetimeLocalValue(value) {
  if (!value) return new Date().toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return startOfDay(d);
}

export function startOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}
