// Formulario simplificado de "Registrar devolución": se abre siempre desde el
// detalle de una compra, para un participante concreto. A diferencia de la
// transferencia general (addSettlement.js), acá "quién devuelve" y "a quién"
// ya se conocen (el participante y quien pagó la compra), así que el
// formulario solo pide el monto — y explica con claridad qué pasa si el monto
// supera lo pendiente, en vez de bloquear o forzar un vuelto exacto.

import { h } from '../../utils/dom.js';
import { getState, addSettlement, editSettlement } from '../../state/store.js';
import { openSheet, closeSheet } from '../components/sheet.js';
import { showToast } from '../components/toast.js';
import { avatarNode } from '../components/avatar.js';
import { parseAmountToCents, formatCents } from '../../logic/money.js';
import { computePurchaseRefunds } from '../../logic/refunds.js';

/**
 * @param {object} input
 * @param {object} input.purchase
 * @param {object} input.participant persona que devuelve
 * @param {object} [input.settlement] si se pasa, edita esa devolución en vez de crear una nueva
 */
export function openRegisterRefund({ purchase, participant, settlement }) {
  const state = getState();
  const payer = state.people.find((p) => p.id === purchase.payerId);
  const isEdit = Boolean(settlement);

  // Al editar, no contamos la propia devolución que se está editando como "ya devuelto":
  // así el pendiente mostrado refleja el resto de devoluciones, y el monto actual del
  // formulario es justamente la diferencia que el usuario puede ajustar.
  const otherSettlements = state.settlements.filter((s) => s.id !== settlement?.id);
  const progress = computePurchaseRefunds(purchase, otherSettlements)[participant.id];
  const pendingCents = progress ? progress.remainingCents : 0;

  let amountValue = isEdit ? String(settlement.amountCents / 100) : pendingCents > 0 ? String(pendingCents / 100) : '';

  const errorBox = h('div', {});
  const previewBox = h('div', { className: 'faint', style: { marginTop: '10px', minHeight: '1.2em' } });

  function setError(message) {
    if (message) errorBox.replaceChildren(h('div', { className: 'error-banner' }, message));
    else errorBox.replaceChildren();
  }

  function updatePreview() {
    previewBox.replaceChildren();
    const cents = parseAmountToCents(amountValue);
    if (!Number.isInteger(cents) || cents <= 0) return;

    if (pendingCents > 0 && cents > pendingCents) {
      const extra = cents - pendingCents;
      previewBox.append(
        h('p', {}, [
          `${formatCents(pendingCents)} saldarán esta compra. `,
          h('strong', {}, `Los ${formatCents(extra)} restantes`),
          ` quedarán como saldo a favor de ${participant.name}.`,
        ])
      );
    } else if (pendingCents === 0) {
      previewBox.append(h('p', {}, `Esta compra ya está saldada para ${participant.name}: este monto se sumará como saldo a favor.`));
    } else if (cents === pendingCents) {
      previewBox.append(h('p', {}, 'Esto deja la compra saldada.'));
    }
  }

  const amountInput = h('input', {
    type: 'number',
    inputmode: 'decimal',
    step: '0.01',
    min: '0',
    placeholder: '0.00',
    value: amountValue,
    onInput: (e) => { amountValue = e.target.value; updatePreview(); },
  });

  const quickButtons = h('div', { className: 'chip-row', style: { marginTop: '8px' } }, [
    pendingCents > 0
      ? h(
          'button',
          {
            type: 'button',
            className: 'chip',
            onClick: () => { amountValue = String(pendingCents / 100); amountInput.value = amountValue; updatePreview(); },
          },
          `Todo: ${formatCents(pendingCents)}`
        )
      : null,
  ]);

  async function submit() {
    setError(null);
    const cents = parseAmountToCents(amountValue);
    if (!Number.isInteger(cents) || cents <= 0) {
      setError('Ingresá un monto válido.');
      return;
    }

    try {
      if (isEdit) {
        await editSettlement(settlement.id, {
          amountInput: amountValue,
          fromPersonId: participant.id,
          toPersonId: purchase.payerId,
          purchaseId: purchase.id,
          note: settlement.note,
          datetime: settlement.datetime,
        });
        showToast('Devolución actualizada');
        closeSheet();
        return;
      }

      await addSettlement({
        amountInput: amountValue,
        fromPersonId: participant.id,
        toPersonId: purchase.payerId,
        purchaseId: purchase.id,
        note: '',
        datetime: new Date().toISOString(),
      });

      let message = 'Devolución registrada.';
      if (pendingCents > 0 && cents >= pendingCents) {
        const extra = cents - pendingCents;
        message = extra > 0
          ? `Devolución registrada. Compra saldada — ${participant.name} ahora tiene ${formatCents(extra)} a favor.`
          : 'Devolución registrada. Compra saldada.';
      }
      showToast(message);
      closeSheet();
    } catch (err) {
      setError(err.message || 'No se pudo registrar la devolución.');
    }
  }

  const content = h('div', {}, [
    errorBox,
    h('div', { className: 'card', style: { marginBottom: '16px' } }, [
      infoRow('Quién devuelve', [avatarNode(participant, { size: 'sm' }), participant.name]),
      infoRow('A quién', [avatarNode(payer, { size: 'sm' }), payer ? payer.name : '—']),
      infoRow('Relacionado con', `${purchase.concept} — ${formatCents(purchase.amountCents)}`),
      infoRow(`Pendiente de ${participant.name}`, h('strong', {}, formatCents(pendingCents)), true),
    ]),
    h('div', { className: 'field' }, [
      h('label', {}, 'Monto a devolver'),
      h('div', { className: 'amount-input-wrap' }, [h('span', { className: 'currency-tag' }, 'Bs'), amountInput]),
      quickButtons,
      previewBox,
    ]),
    h('button', { className: 'btn btn-primary btn-block', onClick: submit }, isEdit ? 'Guardar cambios' : 'Registrar devolución'),
  ]);

  updatePreview();
  openSheet(isEdit ? 'Editar devolución' : 'Registrar devolución', content);
  setTimeout(() => amountInput.focus(), 50);
}

function infoRow(label, value, last = false) {
  return h('div', { className: 'row between', style: { marginTop: last ? '10px' : '0', paddingTop: last ? '10px' : '0', borderTop: last ? '1px solid var(--border)' : 'none' } }, [
    h('span', { className: 'muted' }, label),
    h('div', { className: 'row gap-8' }, value),
  ]);
}
