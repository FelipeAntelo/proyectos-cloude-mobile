// Sistema de iconos de línea, propio y liviano (sin librerías externas).
// Mismo grosor de trazo, mismo viewBox y mismos remates en todos los íconos
// para que se sientan como un único sistema visual coherente.

import { svgEl } from '../../utils/svg.js';

const DEFAULT_ATTRS = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': '1.8',
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
  'aria-hidden': 'true',
  focusable: 'false',
};

const PATHS = {
  home: ['path', { d: 'M4 11.5 12 4l8 7.5' }, 'path', { d: 'M6 10v9a1 1 0 0 0 1 1h3.5v-5.5h3V20H17a1 1 0 0 0 1-1v-9' }],
  history: ['circle', { cx: '12', cy: '12', r: '8.25' }, 'path', { d: 'M12 7.5V12l3 2' }],
  plus: ['path', { d: 'M12 5v14M5 12h14' }],
  analysis: ['path', { d: 'M4 20V10M10 20V4M16 20v-7M4 20h16' }],
  group: [
    'circle', { cx: '9', cy: '8.5', r: '3' },
    'path', { d: 'M3.5 19c.6-3.1 2.9-5 5.5-5s4.9 1.9 5.5 5' },
    'circle', { cx: '17', cy: '8', r: '2.4' },
    'path', { d: 'M15.7 11.3c2.1.2 3.9 1.9 4.3 4.7' },
  ],
  settings: [
    'circle', { cx: '12', cy: '12', r: '2.8' },
    'path', {
      d: 'M12 4.2v1.9M12 17.9v1.9M19.8 12h-1.9M6.1 12H4.2M17.4 6.6l-1.3 1.3M7.9 16.1l-1.3 1.3M17.4 17.4l-1.3-1.3M7.9 7.9 6.6 6.6',
    },
  ],
  back: ['path', { d: 'M15 5 8 12l7 7' }],
  close: ['path', { d: 'M6 6l12 12M18 6 6 18' }],
  refund: ['path', { d: 'M4 9h10.5a4.5 4.5 0 0 1 0 9H9' }, 'path', { d: 'M8 5 4 9l4 4' }],
  transfer: ['path', { d: 'M4 8h13M13 4l4 4-4 4' }, 'path', { d: 'M20 16H7M11 20l-4-4 4-4' }],
  search: ['circle', { cx: '10.5', cy: '10.5', r: '6.5' }, 'path', { d: 'M20 20l-4.8-4.8' }],
  tag: ['path', { d: 'M11.5 4H5a1 1 0 0 0-1 1v6.5a1 1 0 0 0 .29.71l8.5 8.5a1 1 0 0 0 1.42 0l6.29-6.29a1 1 0 0 0 0-1.42l-8.5-8.5A1 1 0 0 0 11.5 4Z' }, 'circle', { cx: '8.2', cy: '8.2', r: '1.1', fill: 'currentColor', stroke: 'none' }],
  receipt: ['path', { d: 'M6 3.5h12v17l-2.2-1.4L13.6 20l-1.6-1.4L10.4 20l-2.2-1.4L6 20.5Z' }, 'path', { d: 'M9 8h6M9 11.5h6M9 15h3.5' }],
  trash: ['path', { d: 'M5 7h14M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2M7 7l1 12.5A1 1 0 0 0 9 20.5h6a1 1 0 0 0 1-1L17 7' }, 'path', { d: 'M10 11v6M14 11v6' }],
  chevron: ['path', { d: 'M9 5l7 7-7 7' }],
  download: ['path', { d: 'M12 3.5v12M8 12l4 4 4-4' }, 'path', { d: 'M4.5 17v2.5a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1V17' }],
  upload: ['path', { d: 'M12 20.5v-12M8 12l4-4 4 4' }, 'path', { d: 'M4.5 17v2.5a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1V17' }],
  info: ['circle', { cx: '12', cy: '12', r: '8.25' }, 'path', { d: 'M12 11v5.2' }, 'circle', { cx: '12', cy: '8.2', r: '0.15', fill: 'currentColor', stroke: 'currentColor', 'stroke-width': '2' }],
  wave: ['path', { d: 'M8 13.5V6a1.5 1.5 0 0 1 3 0v5.5' }, 'path', { d: 'M11 11V4.5a1.5 1.5 0 0 1 3 0V11' }, 'path', { d: 'M14 11.2V6a1.5 1.5 0 0 1 3 0v8' }, 'path', { d: 'M17 12.5V10a1.5 1.5 0 0 1 3 0v5.5c0 3.6-2.7 6-6 6h-1.5c-2 0-3.2-.6-4.4-2.1L4.8 15a1.4 1.4 0 0 1 2-2l1.7 1.7' }],
  balanceMark: ['path', { d: 'M12 4v16M8 20h8' }, 'path', { d: 'M5 8h14' }, 'path', { d: 'M5 8 2.7 13a2.3 2.3 0 0 0 4.6 0Z' }, 'path', { d: 'M19 8l-2.3 5a2.3 2.3 0 0 0 4.6 0Z' }],
  empty: ['path', { d: 'M4 8.5 12 4l8 4.5v7L12 20l-8-4.5Z' }, 'path', { d: 'M4 8.5 12 13l8-4.5M12 13v7' }],
  check: ['path', { d: 'M5 12.5l4.5 4.5L19 7' }],
  warning: ['path', { d: 'M12 4.5 21 19.5H3Z' }, 'path', { d: 'M12 10v4.2' }, 'circle', { cx: '12', cy: '16.8', r: '0.15', fill: 'currentColor', stroke: 'currentColor', 'stroke-width': '2' }],
  share: ['circle', { cx: '18', cy: '6', r: '2.3' }, 'circle', { cx: '6', cy: '12', r: '2.3' }, 'circle', { cx: '18', cy: '18', r: '2.3' }, 'path', { d: 'M8.1 10.8l7.8-3.6M8.1 13.2l7.8 3.6' }],
};

export function icon(name, { size = 'md', className = '' } = {}) {
  const spec = PATHS[name];
  if (!spec) throw new Error(`Icono desconocido: ${name}`);

  const children = [];
  for (let i = 0; i < spec.length; i += 2) {
    children.push(svgEl(spec[i], spec[i + 1]));
  }

  return svgEl(
    'svg',
    { ...DEFAULT_ATTRS, class: `icon icon-${size}${className ? ` ${className}` : ''}` },
    children
  );
}
