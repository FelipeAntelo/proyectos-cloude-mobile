import { h } from '../../utils/dom.js';
import { getState, addPurchase, editPurchase } from '../../state/store.js';
import { openSheet, closeSheet } from '../components/sheet.js';
import { showToast } from '../components/toast.js';
import { avatarNode } from '../components/avatar.js';
import { parseAmountToCents, formatCents } from '../../logic/money.js';
import { splitWeighted } from '../../logic/split.js';
import { getPref, setPref } from '../../utils/prefs.js';
import { toDatetimeLocalValue, fromDatetimeLocalValue } from '../../utils/format.js';

export function openAddPurchase({ purchase } = {}) {
  const state = getState();
  const activePeople = state.people.filter((p) => p.active);
  const activeIds = new Set(activePeople.map((p) => p.id));
  const isEdit = Boolean(purchase);

  const defaults = getPref('lastPurchaseDefaults', {});
  // Los defaults recordados pueden referenciar a alguien que se marcó como inactivo
  // después de guardarlos: los filtramos para no arrastrar participantes "fantasma"
  // que ya no aparecen como chip seleccionable en el formulario.
  const rememberedPayerId = defaults.payerId && activeIds.has(defaults.payerId) ? defaults.payerId : null;
  const rememberedParticipantIds = (defaults.participantIds || []).filter((id) => activeIds.has(id));

  // Además de las personas activas, mostramos como chip (marcado inactivo) a
  // cualquier persona que ya formaba parte de esta compra al editarla, para no
  // ocultar en silencio a alguien que sigue en la división.
  const payerChoices = isEdit && purchase.payerId && !activeIds.has(purchase.payerId)
    ? [...activePeople, state.people.find((p) => p.id === purchase.payerId)].filter(Boolean)
    : activePeople;
  const extraParticipantIds = isEdit ? purchase.participantIds.filter((id) => !activeIds.has(id)) : [];
  const participantChoices = [...activePeople, ...extraParticipantIds.map((id) => state.people.find((p) => p.id === id)).filter(Boolean)];

  const form = {
    amountInput: purchase ? String(purchase.amountCents / 100) : '',
    concept: purchase ? purchase.concept : '',
    categoryId: purchase ? purchase.categoryId : defaults.categoryId || null,
    productId: purchase ? purchase.productId : null,
    payerId: purchase ? purchase.payerId : rememberedPayerId || activePeople[0]?.id || null,
    participantIds: new Set(
      purchase ? purchase.participantIds : rememberedParticipantIds.length > 0 ? rememberedParticipantIds : activePeople.map((p) => p.id)
    ),
    splitMode: purchase ? purchase.splitMode : 'equal',
    weights: purchase && purchase.weights ? { ...purchase.weights } : null,
    note: purchase ? purchase.note : '',
    datetime: purchase ? purchase.datetime : new Date().toISOString(),
  };

  const errorBox = h('div', {});
  const body = h('div', {});

  function setError(message) {
    if (message) errorBox.replaceChildren(h('div', { className: 'error-banner' }, message));
    else errorBox.replaceChildren();
  }

  function ensureWeights() {
    if (!form.weights) form.weights = {};
    for (const id of form.participantIds) {
      if (!(id in form.weights)) form.weights[id] = 1;
    }
    for (const id of Object.keys(form.weights)) {
      if (!form.participantIds.has(id)) delete form.weights[id];
    }
  }

  function draw() {
    body.replaceChildren();

    const amountCentsPreview = parseAmountToCents(form.amountInput);
    const validAmount = Number.isInteger(amountCentsPreview) && amountCentsPreview > 0;

    const amountField = h('div', { className: 'field' }, [
      h('label', { htmlFor: 'amount-input' }, 'Monto'),
      h('div', { className: 'amount-input-wrap' }, [
        h('span', { className: 'currency-tag' }, 'Bs'),
        h('input', {
          id: 'amount-input',
          type: 'number',
          inputmode: 'decimal',
          step: '0.01',
          min: '0',
          placeholder: '0.00',
          value: form.amountInput,
          onInput: (e) => { form.amountInput = e.target.value; drawSplitSection(); },
        }),
      ]),
    ]);

    const frequentProducts = state.products
      .filter((p) => !p.archived)
      .sort((a, b) => (b.useCount || 0) - (a.useCount || 0))
      .slice(0, 8);

    const conceptField = h('div', { className: 'field' }, [
      h('label', {}, 'Concepto / producto'),
      h('input', {
        type: 'text',
        placeholder: 'Ej. Almuerzo, Coca-Cola, hielo…',
        value: form.concept,
        onInput: (e) => { form.concept = e.target.value; },
      }),
      frequentProducts.length > 0
        ? h(
            'div',
            { className: 'chip-row', style: { marginTop: '8px' } },
            frequentProducts.map((product) =>
              h(
                'button',
                {
                  type: 'button',
                  className: `chip${form.productId === product.id ? ' selected' : ''}`,
                  onClick: () => {
                    form.productId = product.id;
                    form.concept = product.name;
                    if (product.categoryId) form.categoryId = product.categoryId;
                    draw();
                  },
                },
                product.name
              )
            )
          )
        : null,
    ]);

    const activeCategories = state.categories.filter((c) => !c.archived);
    const categoryField = h('div', { className: 'field' }, [
      h('label', {}, 'Categoría'),
      h(
        'div',
        { className: 'chip-row' },
        [
          h(
            'button',
            { type: 'button', className: `chip${!form.categoryId ? ' selected' : ''}`, onClick: () => { form.categoryId = null; draw(); } },
            'Sin categoría'
          ),
          ...activeCategories.map((cat) =>
            h(
              'button',
              {
                type: 'button',
                className: `chip${form.categoryId === cat.id ? ' selected' : ''}`,
                onClick: () => { form.categoryId = cat.id; draw(); },
              },
              cat.name
            )
          ),
        ]
      ),
    ]);

    const payerField = h('div', { className: 'field' }, [
      h('label', {}, '¿Quién pagó?'),
      h(
        'div',
        { className: 'chip-row' },
        payerChoices.map((person) =>
          h(
            'button',
            {
              type: 'button',
              className: `chip${form.payerId === person.id ? ' selected' : ''}`,
              onClick: () => { form.payerId = person.id; draw(); },
            },
            [avatarNode(person, { size: 'sm' }), person.name]
          )
        )
      ),
    ]);

    const allSelected = activePeople.every((p) => form.participantIds.has(p.id));
    const participantsField = h('div', { className: 'field' }, [
      h('label', {}, '¿Quién consumió?'),
      h(
        'div',
        { className: 'chip-row' },
        [
          h(
            'button',
            {
              type: 'button',
              className: `chip${allSelected ? ' selected' : ''}`,
              onClick: () => {
                if (allSelected) form.participantIds.clear();
                else activePeople.forEach((p) => form.participantIds.add(p.id));
                ensureWeights();
                draw();
              },
            },
            'Todos'
          ),
          ...participantChoices.map((person) =>
            h(
              'button',
              {
                type: 'button',
                className: `chip${form.participantIds.has(person.id) ? ' selected' : ''}`,
                onClick: () => {
                  if (form.participantIds.has(person.id)) form.participantIds.delete(person.id);
                  else form.participantIds.add(person.id);
                  ensureWeights();
                  draw();
                },
              },
              [avatarNode(person, { size: 'sm' }), person.name]
            )
          ),
        ]
      ),
    ]);

    const splitSection = h('div', { className: 'field' });
    const dateField = h('div', { className: 'field' }, [
      h('label', {}, 'Fecha y hora'),
      h('input', {
        type: 'datetime-local',
        value: toDatetimeLocalValue(form.datetime),
        onInput: (e) => { form.datetime = fromDatetimeLocalValue(e.target.value); },
      }),
    ]);
    body.append(amountField, conceptField, categoryField, payerField, participantsField, splitSection, dateField, h('div', { className: 'field' }, [
      h('label', {}, 'Nota (opcional)'),
      h('textarea', {
        placeholder: 'Detalle adicional…',
        onInput: (e) => { form.note = e.target.value; },
      }, form.note || ''),
    ]));

    function drawSplitSection() {
      splitSection.replaceChildren();
      const participantIds = [...form.participantIds];
      splitSection.append(
        h('label', {}, 'División'),
        h('div', { className: 'segmented' }, [
          h('button', { type: 'button', className: form.splitMode === 'equal' ? 'active' : '', onClick: () => { form.splitMode = 'equal'; drawSplitSection(); } }, 'Igual'),
          h('button', { type: 'button', className: form.splitMode === 'weighted' ? 'active' : '', onClick: () => { form.splitMode = 'weighted'; ensureWeights(); drawSplitSection(); } }, 'Personalizada'),
        ])
      );

      if (form.splitMode === 'weighted' && participantIds.length > 0) {
        ensureWeights();
        const cents = validAmount ? amountCentsPreview : 0;
        const shares = cents > 0 ? splitWeighted(cents, form.weights) : {};
        splitSection.append(
          h(
            'div',
            { style: { marginTop: '10px' } },
            participantIds.map((id) => {
              const person = state.people.find((p) => p.id === id);
              return h('div', { className: 'weight-row' }, [
                avatarNode(person, { size: 'sm' }),
                h('span', { className: 'name' }, person.name),
                h('div', { className: 'stepper' }, [
                  h('button', { type: 'button', 'aria-label': `Bajar peso de ${person.name}`, onClick: () => { form.weights[id] = Math.max(1, form.weights[id] - 1); drawSplitSection(); } }, '−'),
                  h('span', { className: 'stepper-value' }, String(form.weights[id])),
                  h('button', { type: 'button', 'aria-label': `Subir peso de ${person.name}`, onClick: () => { form.weights[id] = form.weights[id] + 1; drawSplitSection(); } }, '+'),
                ]),
                h('span', { className: 'share-preview' }, cents > 0 ? formatCents(shares[id] || 0) : '—'),
              ]);
            })
          )
        );
      } else if (participantIds.length > 0) {
        const cents = validAmount ? amountCentsPreview : 0;
        const each = cents > 0 ? Math.floor(cents / participantIds.length) : 0;
        splitSection.append(
          h('p', { className: 'faint', style: { marginTop: '8px' } }, cents > 0 ? `≈ ${formatCents(each)} por persona` : 'Ingresá un monto para ver la división.')
        );
      }
    }

    drawSplitSection();

    body.append(
      h(
        'button',
        {
          className: 'btn btn-primary btn-block',
          style: { marginTop: '18px' },
          onClick: submit,
        },
        isEdit ? 'Guardar cambios' : 'Guardar compra'
      )
    );
  }

  async function submit() {
    setError(null);
    try {
      const payload = {
        amountInput: form.amountInput,
        concept: form.concept,
        categoryId: form.categoryId,
        productId: form.productId,
        payerId: form.payerId,
        participantIds: [...form.participantIds],
        splitMode: form.splitMode,
        weights: form.splitMode === 'weighted' ? form.weights : null,
        note: form.note,
        datetime: form.datetime,
      };

      if (isEdit) {
        await editPurchase(purchase.id, payload);
        showToast('Compra actualizada');
      } else {
        await addPurchase(payload);
        setPref('lastPurchaseDefaults', {
          payerId: form.payerId,
          participantIds: [...form.participantIds],
          categoryId: form.categoryId,
        });
        showToast('Compra registrada');
      }
      closeSheet();
    } catch (err) {
      setError(err.message || 'No se pudo guardar la compra.');
    }
  }

  draw();
  const content = h('div', {}, [errorBox, body]);
  openSheet(isEdit ? 'Editar compra' : 'Registrar compra', content);
}
