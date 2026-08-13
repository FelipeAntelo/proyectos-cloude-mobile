// Pantalla de entrada para una instalación sin grupo y sin datos locales
// todavía. Reemplaza el onboarding "agregá personas" cuando hay sincronización
// configurada: acá el punto de partida es un grupo, no una lista de nombres.

import { h } from '../../utils/dom.js';
import { icon } from '../components/icons.js';
import { openSheet, closeSheet } from '../components/sheet.js';
import { showToast } from '../components/toast.js';
import { createGroup } from '../../state/store.js';
import { extractInviteToken } from '../../utils/inviteUrl.js';

export function renderGroupEntry() {
  return h('div', { className: 'onboarding' }, [
    h('div', { className: 'mark' }, [icon('balanceMark', { size: 'lg', className: 'onboarding-mark' })]),
    h('h1', {}, 'Equilibra'),
    h('p', {}, 'Gastos compartidos, sin complicaciones.'),
    h('div', { className: 'stack-12', style: { marginTop: '8px' } }, [
      h('button', { className: 'btn btn-primary btn-block', onClick: () => openCreateGroupSheet() }, 'Crear un grupo'),
      h('button', { className: 'btn btn-secondary btn-block', onClick: () => openJoinGroupSheet() }, 'Unirme a un grupo'),
    ]),
  ]);
}

function openCreateGroupSheet() {
  const nameInput = h('input', { type: 'text', placeholder: 'Ej. Oficina', 'aria-label': 'Nombre del grupo', autofocus: true });
  const content = h('div', {}, [
    h('div', { className: 'field' }, [h('label', {}, 'Nombre del grupo'), nameInput]),
    h(
      'button',
      {
        className: 'btn btn-primary btn-block',
        onClick: async () => {
          const name = nameInput.value.trim();
          if (!name) return;
          try {
            await createGroup(name);
            closeSheet();
          } catch (err) {
            showToast(err.message || 'No se pudo crear el grupo.');
          }
        },
      },
      'Crear'
    ),
  ]);
  openSheet('Nombre del grupo', content);
  setTimeout(() => nameInput.focus(), 50);
}

function openJoinGroupSheet() {
  const linkInput = h('input', { type: 'text', placeholder: 'Pegá el enlace de invitación', 'aria-label': 'Enlace de invitación', autofocus: true });
  const content = h('div', {}, [
    h('div', { className: 'field' }, [h('label', {}, 'Enlace o código de invitación'), linkInput]),
    h(
      'button',
      {
        className: 'btn btn-primary btn-block',
        onClick: () => {
          const token = extractInviteToken(linkInput.value);
          if (!token) {
            showToast('Ese enlace no parece válido.');
            return;
          }
          closeSheet();
          location.hash = '';
          location.href = `${location.pathname}?invite=${encodeURIComponent(token)}`;
        },
      },
      'Continuar'
    ),
  ]);
  openSheet('Unirme a un grupo', content);
  setTimeout(() => linkInput.focus(), 50);
}
