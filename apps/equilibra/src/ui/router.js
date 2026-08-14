import { h, mount } from '../utils/dom.js';
import { getState, subscribe, isGroupSyncAvailable } from '../state/store.js';
import { bottomNavNode } from './nav.js';
import { renderOnboarding } from './views/onboarding.js';
import { renderGroupEntry } from './views/groupEntry.js';
import { renderInviteAccept } from './views/inviteAccept.js';
import { renderWhoAreYou } from './views/whoAreYou.js';
import { renderHome } from './views/home.js';
import { renderHistory } from './views/history.js';
import { renderAnalysis } from './views/analysis.js';
import { renderGroup } from './views/group.js';
import { renderSettings } from './views/settings.js';
import { openAddChoice } from './views/addChoice.js';
import { consumeInviteTokenFromLocation } from '../utils/inviteUrl.js';

const TOP_ROUTES = { '': renderHome, history: renderHistory, analysis: renderAnalysis, group: renderGroup };

let pendingInviteToken = consumeInviteTokenFromLocation();

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

    // Un link de invitación manda siempre, sin pasar por el onboarding normal.
    if (pendingInviteToken) {
      mount(appRoot, renderInviteAccept(pendingInviteToken, () => { pendingInviteToken = null; }));
      return;
    }

    const route = parseRoute();

    // "¿Quién sos?" es una pantalla de una sola vez, sin barra inferior, que
    // se navega explícitamente justo después de entrar a un grupo.
    if (route === 'who-are-you') {
      mount(appRoot, renderWhoAreYou());
      return;
    }

    // Instalación nueva sin grupo y sin personas todavía: entrada mínima. Si
    // la sincronización no está configurada en este deploy, el concepto de
    // "grupo compartido" no aplica — se mantiene el onboarding local de
    // siempre.
    if (!state.group && state.people.length === 0) {
      mount(appRoot, isGroupSyncAvailable() ? renderGroupEntry() : renderOnboarding());
      return;
    }

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
