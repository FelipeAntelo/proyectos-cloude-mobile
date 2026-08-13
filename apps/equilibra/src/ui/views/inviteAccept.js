// Pantalla que se muestra al abrir un link de invitación (`?invite=TOKEN`).
// No pasa por el onboarding normal: solo confirma el grupo y, al aceptar,
// trae el snapshot inicial y pide "¿quién sos?" una única vez.

import { h } from '../../utils/dom.js';
import { icon } from '../components/icons.js';
import { showToast } from '../components/toast.js';
import { confirmDialog } from '../components/confirm.js';
import { previewInvite, redeemInvite, hasConflictingLocalState, exportBackup, wipeAll } from '../../state/store.js';

export function renderInviteAccept(token, onDone) {
  const container = h('div', { className: 'onboarding' });
  let status = 'loading'; // loading | ready | error | joining
  let invite = null;

  function draw() {
    container.replaceChildren();

    if (status === 'loading') {
      container.append(
        h('div', { className: 'mark' }, [icon('balanceMark', { size: 'lg', className: 'onboarding-mark' })]),
        h('h1', {}, 'Equilibra'),
        h('p', {}, 'Buscando la invitación…')
      );
      return;
    }

    if (status === 'error') {
      container.append(
        h('div', { className: 'mark' }, [icon('warning', { size: 'lg' })]),
        h('h1', {}, 'Invitación no válida'),
        h('p', {}, 'Este enlace venció o ya no existe. Pedile a quien te invitó que te comparta uno nuevo.'),
        h('button', { className: 'btn btn-secondary btn-block', onClick: () => { location.hash = ''; location.reload(); } }, 'Volver a Equilibra')
      );
      return;
    }

    if (status === 'joining') {
      container.append(
        h('div', { className: 'mark' }, [icon('balanceMark', { size: 'lg', className: 'onboarding-mark' })]),
        h('h1', {}, 'Preparando el grupo…')
      );
      return;
    }

    container.append(
      h('div', { className: 'mark' }, [icon('balanceMark', { size: 'lg', className: 'onboarding-mark' })]),
      h('h1', {}, 'Equilibra'),
      h('p', { className: 'muted' }, 'Te invitaron a un grupo'),
      h('h1', { style: { fontSize: '1.6rem' } }, invite.groupName),
      h('button', { className: 'btn btn-primary btn-block', style: { marginTop: '10px' }, onClick: onEnter }, 'Entrar al grupo')
    );
  }

  async function load() {
    try {
      invite = await previewInvite(token);
      status = invite ? 'ready' : 'error';
    } catch {
      status = 'error';
    }
    draw();
  }

  async function onEnter() {
    const conflict = await hasConflictingLocalState();
    if (conflict) {
      const proceed = await confirmDialog({
        title: 'Este dispositivo ya tiene datos de otro grupo',
        message:
          conflict.type === 'group'
            ? 'Ya estás en un grupo compartido en este teléfono. Si continuás, se guarda una copia de lo actual y este dispositivo pasa al nuevo grupo.'
            : 'Ya hay compras y personas cargadas en este teléfono sin compartir. Si continuás, se guarda una copia y se empieza de cero con el grupo al que te invitaron.',
        confirmLabel: 'Guardar copia y cambiar de grupo',
      });
      if (!proceed) return;

      const backup = await exportBackup();
      downloadBackup(backup);
      await wipeAll();
    }

    status = 'joining';
    draw();
    try {
      await redeemInvite(token);
      if (onDone) onDone();
      location.hash = '#/who-are-you';
    } catch (err) {
      showToast(err.message || 'No se pudo entrar al grupo.');
      status = 'ready';
      draw();
    }
  }

  function downloadBackup(backup) {
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `equilibra-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  load();
  return container;
}
