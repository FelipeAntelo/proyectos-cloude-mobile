import { h } from '../utils/dom.js';

const TABS = [
  { route: '', icon: '🏠', label: 'Inicio' },
  { route: 'history', icon: '🧾', label: 'Historial' },
  null, // hueco para el FAB
  { route: 'analysis', icon: '📊', label: 'Análisis' },
  { route: 'group', icon: '👥', label: 'Grupo' },
];

export function bottomNavNode(currentRoute, onFabClick) {
  return h(
    'nav',
    { className: 'bottom-nav', 'aria-label': 'Navegación principal' },
    TABS.map((tab) => {
      if (!tab) {
        return h('div', { className: 'nav-fab-slot' }, [
          h(
            'button',
            { className: 'nav-fab', 'aria-label': 'Agregar', onClick: onFabClick },
            '+'
          ),
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
        [h('span', { className: 'nav-icon', 'aria-hidden': 'true' }, tab.icon), h('span', {}, tab.label)]
      );
    })
  );
}
