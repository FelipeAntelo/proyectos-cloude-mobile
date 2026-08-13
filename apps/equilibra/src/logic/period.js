// Filtros de período reutilizados por el dashboard y la sección de análisis.

export const PERIODS = [
  { id: 'week', label: 'Esta semana' },
  { id: 'month', label: 'Este mes' },
  { id: '3months', label: 'Últimos 3 meses' },
  { id: 'all', label: 'Todo' },
];

export function periodRange(periodId, custom) {
  const now = new Date();
  if (periodId === 'custom' && custom) {
    return { start: new Date(custom.start), end: new Date(custom.end) };
  }
  if (periodId === 'week') {
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    start.setHours(0, 0, 0, 0);
    return { start, end: now };
  }
  if (periodId === 'month') {
    return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now };
  }
  if (periodId === '3months') {
    const start = new Date(now);
    start.setMonth(now.getMonth() - 3);
    return { start, end: now };
  }
  return { start: null, end: now }; // 'all'
}

export function withinPeriod(isoDate, periodId, custom) {
  if (periodId === 'all') return true;
  const { start, end } = periodRange(periodId, custom);
  const d = new Date(isoDate);
  if (start && d < start) return false;
  if (end && d > end) return false;
  return true;
}

export function filterByPeriod(items, periodId, custom, dateKey = 'datetime') {
  if (periodId === 'all') return items;
  return items.filter((item) => withinPeriod(item[dateKey], periodId, custom));
}
