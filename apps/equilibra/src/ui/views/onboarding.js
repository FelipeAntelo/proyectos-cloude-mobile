import { h } from '../../utils/dom.js';
import { addPerson } from '../../state/store.js';
import { showToast } from '../components/toast.js';
import { icon } from '../components/icons.js';

export function renderOnboarding() {
  let step = 0; // 0 = intro, 1 = agregar personas
  const names = [];

  const container = h('div', { className: 'onboarding' });

  function draw() {
    container.replaceChildren();
    if (step === 0) {
      container.append(
        h('div', { className: 'mark' }, [icon('balanceMark', { size: 'lg', className: 'onboarding-mark' })]),
        h('h1', {}, 'Equilibra lo que ponen entre todos.'),
        h(
          'p',
          {},
          'Registrá quién paga, quién consume, y dejá que la app calcule quién debería pagar después. Sin cuentas, sin nube: todo queda en tu teléfono.'
        ),
        h(
          'button',
          { className: 'btn btn-primary btn-block', onClick: () => { step = 1; draw(); } },
          'Crear grupo'
        )
      );
      return;
    }

    const input = h('input', {
      type: 'text',
      placeholder: 'Nombre de la persona',
      'aria-label': 'Nombre de la persona',
      autofocus: true,
      onKeydown: (e) => { if (e.key === 'Enter') addName(); },
    });

    const list = h(
      'ul',
      { className: 'chip-row', style: { marginTop: '4px' } },
      names.map((name, i) =>
        h('li', {}, [
          h('span', { className: 'chip' }, [
            name,
            h('button', {
              'aria-label': `Quitar a ${name}`,
              onClick: () => { names.splice(i, 1); draw(); },
              style: { marginLeft: '4px', display: 'inline-flex' },
            }, [icon('close', { size: 'sm' })]),
          ]),
        ])
      )
    );

    function addName() {
      const value = input.value.trim();
      if (!value) return;
      names.push(value);
      input.value = '';
      draw();
      const fresh = container.querySelector('input');
      if (fresh) fresh.focus();
    }

    container.append(
      h('h1', { style: { fontSize: '1.4rem' } }, '¿Quiénes son?'),
      h('p', {}, 'Agregá a tus compañeros. Podés sumar o editar personas después desde "Grupo".'),
      h('div', { className: 'field' }, [
        h('div', { className: 'row gap-8' }, [
          h('div', { style: { flex: 1 } }, input),
          h('button', { className: 'btn btn-secondary', onClick: addName }, 'Agregar'),
        ]),
      ]),
      list,
      h(
        'button',
        {
          className: 'btn btn-primary btn-block',
          disabled: names.length < 2,
          onClick: async () => {
            for (const name of names) {
              // eslint-disable-next-line no-await-in-loop
              await addPerson(name);
            }
            showToast('¡Grupo creado!');
          },
        },
        names.length < 2 ? 'Agregá al menos 2 personas' : `Empezar (${names.length} personas)`
      )
    );
  }

  draw();
  return container;
}
