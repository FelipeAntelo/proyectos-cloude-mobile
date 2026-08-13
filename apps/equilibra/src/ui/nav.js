import { h } from '../utils/dom.js';
import { icon } from './components/icons.js';

const TABS = [
  { route: '', iconName: 'home', label: 'Inicio' },
  { route: 'history', iconName: 'history', label: 'Historial' },
  null, // hueco para el FAB
  { route: 'analysis', iconName: 'analysis', label: 'Análisis' },
  { route: 'group', iconName: 'group', label: 'Grupo' },
];

export function bottomNavNode(currentRoute, onFabClick) {
  return h(
    'nav',
    { className: 'bottom-nav', 'aria-label': 'Navegación principal' },
    TABS.map((tab) => {
      if (!tab) {
        return h('div', { className: 'nav-fab-slot' }, [
          h('button', { className: 'nav-fab', 'aria-label': 'Agregar', onClick: onFabClick }, [icon('plus', { size: 'md' })]),
        ]);
      }
      const active = currentRoute === tab.route;
      return h(
        'a',
        {
          className: `nav-item${active ? ' active' : ''}`,
          href: `#/${tab.route}`,
          'aria-current': active ? 'page' : null,
        },
        [h('span', { className: 'nav-icon-wrap' }, [icon(tab.iconName, { size: 'sm' })]), h('span', {}, tab.label)]
      );
    })
  );
}
