import { h, mount } from '../utils/dom.js';
import { getState, subscribe } from '../state/store.js';
import { bottomNavNode } from './nav.js';
import { renderOnboarding } from './views/onboarding.js';
import { renderHome } from './views/home.js';
import { renderHistory } from './views/history.js';
import { renderAnalysis } from './views/analysis.js';
import { renderGroup } from './views/group.js';
import { renderSettings } from './views/settings.js';
import { openAddChoice } from './views/addChoice.js';

const TOP_ROUTES = { '': renderHome, history: renderHistory, analysis: renderAnalysis, group: renderGroup };

function parseRoute() {
  return (location.hash || '').replace(/^#\/?/, '');
}

function skeletonScreen() {
  return h('div', { className: 'screen' }, [
    h('div', { className: 'skeleton', style: { height: '28px', width: '140px', marginBottom: '16px' } }),
    h('div', { className: 'skeleton', style: { height: '90px', borderRadius: '22px', marginBottom: '12px' } }),
    h('div', { className: 'skeleton', style: { height: '180px', borderRadius: '22px' } }),
  ]);
}

export function startRouter() {
  const appRoot = document.getElementById('app');

  function render() {
    const state = getState();

    if (state.loading) {
      mount(appRoot, skeletonScreen());
      return;
    }

    if (state.people.length === 0) {
      mount(appRoot, renderOnboarding());
      return;
    }

    const route = parseRoute();

    if (route === 'settings') {
      mount(appRoot, h('div', {}, [renderSettings(), bottomNavNode('', openAddChoice)]));
      return;
    }

    const renderFn = TOP_ROUTES[route] || renderHome;
    const activeRoute = TOP_ROUTES[route] ? route : '';
    mount(appRoot, h('div', {}, [renderFn(), bottomNavNode(activeRoute, openAddChoice)]));
  }

  subscribe(render);
  window.addEventListener('hashchange', render);
  render();
}
