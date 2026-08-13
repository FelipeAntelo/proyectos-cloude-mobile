// Se muestra una única vez, justo después de entrar a un grupo por
// invitación (o al crear uno recibiendo su primer integrante). Guarda la
// selección localmente — sirve para trazabilidad ("Registrado por X"), no
// para permisos: no hace falta impedir que dos dispositivos elijan a la
// misma persona.

import { h } from '../../utils/dom.js';
import { getState, addPerson, selectLocalPerson } from '../../state/store.js';
import { avatarNode } from '../components/avatar.js';
import { icon } from '../components/icons.js';

export function renderWhoAreYou() {
  const container = h('div', { className: 'onboarding' });
  let addingNew = false;

  function draw() {
    container.replaceChildren();
    const state = getState();
    const people = state.people.filter((p) => p.active);

    if (addingNew) {
      const nameInput = h('input', { type: 'text', placeholder: 'Tu nombre', 'aria-label': 'Tu nombre', autofocus: true });
      container.append(
        h('h1', { style: { fontSize: '1.4rem' } }, '¿Cómo te llamás?'),
        h('div', { className: 'field' }, [nameInput]),
        h('button', {
          className: 'btn btn-primary btn-block',
          onClick: async () => {
            const name = nameInput.value.trim();
            if (!name) return;
            const person = await addPerson(name);
            await selectLocalPerson(person.id);
            location.hash = '#/';
          },
        }, 'Continuar'),
        h('button', { className: 'btn btn-ghost', onClick: () => { addingNew = false; draw(); } }, 'Volver a la lista')
      );
      setTimeout(() => nameInput.focus(), 50);
      return;
    }

    container.append(
      h('h1', { style: { fontSize: '1.4rem' } }, '¿Quién sos en este grupo?'),
      h('p', { className: 'muted' }, 'Es solo para esta app en este teléfono, podés cambiarlo después desde Ajustes.'),
      h('div', { className: 'list', style: { marginTop: '10px' } }, people.map((person) =>
        h('div', { className: 'list-item', role: 'button', tabindex: '0', onClick: async () => {
          await selectLocalPerson(person.id);
          location.hash = '#/';
        } }, [
          avatarNode(person),
          h('div', { className: 'list-main' }, [h('div', { className: 'list-title' }, person.name)]),
          icon('chevron', { size: 'sm', className: 'list-chevron' }),
        ])
      )),
      h('button', { className: 'btn btn-secondary btn-block', style: { marginTop: '14px' }, onClick: () => { addingNew = true; draw(); } }, 'No estoy en la lista')
    );
  }

  draw();
  return container;
}
