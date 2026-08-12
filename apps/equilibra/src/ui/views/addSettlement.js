import { h } from '../../utils/dom.js';
import { getState, addSettlement, editSettlement } from '../../state/store.js';
import { openSheet, closeSheet } from '../components/sheet.js';
import { showToast } from '../components/toast.js';
import { avatarNode } from '../components/avatar.js';
import { toDatetimeLocalValue, fromDatetimeLocalValue } from '../../utils/format.js';

export function openAddSettlement({ settlement } = {}) {
  const state = getState();
  const people = state.people.filter((p) => p.active || (settlement && (p.id === settlement.fromPersonId || p.id === settlement.toPersonId)));
  const isEdit = Boolean(settlement);

  const form = {
    amountInput: settlement ? String(settlement.amountCents / 100) : '',
    fromPersonId: settlement ? settlement.fromPersonId : people[0]?.id || null,
    toPersonId: settlement ? settlement.toPersonId : people[1]?.id || null,
    note: settlement ? settlement.note : '',
    datetime: settlement ? settlement.datetime : new Date().toISOString(),
  };

  const errorBox = h('div', {});

  function setError(message) {
    if (message) errorBox.replaceChildren(h('div', { className: 'error-banner' }, message));
    else errorBox.replaceChildren();
  }

  function personChips(selectedId, onSelect) {
    return h(
      'div',
      { className: 'chip-row' },
      people.map((person) =>
        h(
          'button',
          {
            type: 'button',
            className: `chip${selectedId === person.id ? ' selected' : ''}`,
            onClick: () => onSelect(person.id),
          },
          [avatarNode(person, { size: 'sm' }), person.name]
        )
      )
    );
  }

  const fromField = h('div', { className: 'field' }, [h('label', {}, 'Quién entrega')]);
  const toField = h('div', { className: 'field' }, [h('label', {}, 'Quién recibe')]);

  function redrawChips() {
    fromField.replaceChildren(
      h('label', {}, 'Quién entrega'),
      personChips(form.fromPersonId, (id) => { form.fromPersonId = id; redrawChips(); })
    );
    toField.replaceChildren(
      h('label', {}, 'Quién recibe'),
      personChips(form.toPersonId, (id) => { form.toPersonId = id; redrawChips(); })
    );
  }
  redrawChips();

  const content = h('div', {}, [
    errorBox,
    h('div', { className: 'field' }, [
      h('label', {}, 'Monto'),
      h('div', { className: 'amount-input-wrap' }, [
        h('span', { className: 'currency-tag' }, 'Bs'),
        h('input', {
          type: 'number',
          inputmode: 'decimal',
          step: '0.01',
          min: '0',
          placeholder: '0.00',
          value: form.amountInput,
          onInput: (e) => { form.amountInput = e.target.value; },
        }),
      ]),
    ]),
    fromField,
    toField,
    h('div', { className: 'field' }, [
      h('label', {}, 'Fecha y hora'),
      h('input', {
        type: 'datetime-local',
        value: toDatetimeLocalValue(form.datetime),
        onInput: (e) => { form.datetime = fromDatetimeLocalValue(e.target.value); },
      }),
    ]),
    h('div', { className: 'field' }, [
      h('label', {}, 'Nota (opcional)'),
      h('textarea', {
        placeholder: 'Ej. Transferencia por QR',
        onInput: (e) => { form.note = e.target.value; },
      }, form.note || ''),
    ]),
    h(
      'button',
      {
        className: 'btn btn-primary btn-block',
        onClick: async () => {
          setError(null);
          try {
            if (isEdit) {
              await editSettlement(settlement.id, form);
              showToast('Compensación actualizada');
            } else {
              await addSettlement(form);
              showToast('Compensación registrada');
            }
            closeSheet();
          } catch (err) {
            setError(err.message || 'No se pudo guardar la compensación.');
          }
        },
      },
      isEdit ? 'Guardar cambios' : 'Registrar compensación'
    ),
  ]);

  openSheet(isEdit ? 'Editar compensación' : 'Registrar compensación', content);
}
