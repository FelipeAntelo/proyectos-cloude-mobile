// Gráficos livianos en SVG puro, sin librerías. Siguen las especificaciones de
// marca del skill de dataviz: barras finas con extremo redondeado, separación
// entre marcas, etiquetas directas selectivas, y colores tomados de la paleta
// categórica ya validada (--series-1..8) definida en styles.css.

import { h } from '../../utils/dom.js';
import { svgEl } from '../../utils/svg.js';
import { formatCents } from '../../logic/money.js';

const SERIES_VARS = ['--series-1', '--series-2', '--series-3', '--series-4', '--series-5', '--series-6', '--series-7', '--series-8'];

/** Barras horizontales agrupadas: pagado vs. correspondía, una fila por persona. */
export function comparisonChart(rows) {
  if (rows.length === 0) return h('p', { className: 'faint' }, 'Sin datos todavía.');

  const barH = 14;
  const gap = 6;
  const rowH = barH * 2 + gap + 22;
  const width = 320;
  const labelW = 84;
  const valueSpace = 76; // suficiente para "Bs 9,999.00" a font-size 10 sin recortarse
  const trackW = width - labelW - valueSpace;
  const maxVal = Math.max(1, ...rows.map((r) => Math.max(r.paidCents, r.owedCents)));

  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${rowH * rows.length}`, role: 'img', 'aria-label': 'Pagado versus consumo correspondiente por persona' });

  rows.forEach((row, i) => {
    const y = i * rowH;
    const paidW = Math.max(2, (row.paidCents / maxVal) * trackW);
    const owedW = Math.max(2, (row.owedCents / maxVal) * trackW);

    svg.append(
      svgEl('text', { x: 0, y: y + 12, class: 'chart-label', 'font-size': '11', fill: 'var(--text-muted)' }, truncate(row.label, 12)),
      svgEl('rect', { x: labelW, y: y + 2, width: paidW, height: barH, rx: 4, fill: 'var(--series-1)' }),
      svgEl('text', { x: labelW + paidW + 6, y: y + 2 + barH - 3, 'font-size': '10', fill: 'var(--text-muted)' }, formatCents(row.paidCents)),
      svgEl('rect', { x: labelW, y: y + 2 + barH + gap, width: owedW, height: barH, rx: 4, fill: 'var(--series-2)' }),
      svgEl('text', { x: labelW + owedW + 6, y: y + 2 + barH + gap + barH - 3, 'font-size': '10', fill: 'var(--text-muted)' }, formatCents(row.owedCents))
    );
  });

  const wrap = h('div', { className: 'chart-card' }, [svg]);
  wrap.append(
    h('div', { className: 'legend' }, [
      h('span', { className: 'legend-item' }, [h('span', { className: 'legend-dot', style: { background: 'var(--series-1)' } }), 'Pagado']),
      h('span', { className: 'legend-item' }, [h('span', { className: 'legend-dot', style: { background: 'var(--series-2)' } }), 'Le correspondía']),
    ])
  );
  return wrap;
}

/** Barras horizontales por categoría, orden fijo de colores, sin ciclar más allá de 8. */
export function categoryChart(rows) {
  if (rows.length === 0) return h('p', { className: 'faint' }, 'Todavía no hay gastos categorizados.');

  const capped = capToEight(rows);
  const barH = 16;
  const rowGap = 10;
  const rowH = barH + rowGap;
  const width = 320;
  const labelW = 92;
  const valueSpace = 76; // suficiente para "Bs 9,999.00" a font-size 10 sin recortarse
  const trackW = width - labelW - valueSpace;
  const maxVal = Math.max(1, ...capped.map((r) => r.amountCents));

  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${rowH * capped.length}`, role: 'img', 'aria-label': 'Gasto por categoría' });

  capped.forEach((row, i) => {
    const y = i * rowH;
    const w = Math.max(2, (row.amountCents / maxVal) * trackW);
    svg.append(
      svgEl('text', { x: 0, y: y + barH - 4, 'font-size': '11', fill: 'var(--text-muted)' }, truncate(row.label, 13)),
      svgEl('rect', { x: labelW, y, width: w, height: barH, rx: 4, fill: `var(${SERIES_VARS[i]})` }),
      svgEl('text', { x: labelW + w + 6, y: y + barH - 4, 'font-size': '10', fill: 'var(--text-muted)' }, formatCents(row.amountCents))
    );
  });

  return h('div', { className: 'chart-card' }, [svg]);
}

/** Línea simple de evolución del % de equilibrio a lo largo del tiempo. Serie única: sin leyenda. */
export function equilibriumTrendChart(points) {
  if (points.length < 2) return h('p', { className: 'faint' }, 'Registrá más movimientos para ver la evolución.');

  const width = 320;
  const height = 120;
  const padX = 8;
  const padY = 16;
  const usableW = width - padX * 2;
  const usableH = height - padY * 2;

  const coords = points.map((p, i) => {
    const x = padX + (i / (points.length - 1)) * usableW;
    const y = padY + (1 - p.value / 100) * usableH;
    return { x, y, value: p.value };
  });

  const path = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');
  const last = coords[coords.length - 1];

  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': 'Evolución del equilibrio del grupo' }, [
    svgEl('line', { x1: padX, y1: padY + usableH, x2: width - padX, y2: padY + usableH, stroke: 'var(--border)', 'stroke-width': 1 }),
    svgEl('path', { d: path, fill: 'none', stroke: 'var(--positive)', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
    svgEl('circle', { cx: last.x, cy: last.y, r: 4, fill: 'var(--positive)', stroke: 'var(--surface)', 'stroke-width': 2 }),
    svgEl('text', { x: Math.min(last.x, width - 34), y: Math.max(10, last.y - 8), 'font-size': '11', fill: 'var(--text)', 'font-weight': '700' }, `${Math.round(last.value)}%`),
  ]);

  return h('div', { className: 'chart-card' }, [svg]);
}

function capToEight(rows) {
  const sorted = [...rows].sort((a, b) => b.amountCents - a.amountCents);
  if (sorted.length <= 8) return sorted;
  const head = sorted.slice(0, 7);
  const restTotal = sorted.slice(7).reduce((sum, r) => sum + r.amountCents, 0);
  head.push({ label: 'Otras', amountCents: restTotal });
  return head;
}

function truncate(str, max) {
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}
