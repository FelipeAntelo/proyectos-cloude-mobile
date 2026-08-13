import { h } from '../../utils/dom.js';
import { getState, exportBackup, importBackup, wipeAll, deleteDemoData, init as reinitStore, syncNowManual } from '../../state/store.js';
import { getTheme, setTheme } from '../../utils/theme.js';
import { showToast } from '../components/toast.js';
import { icon } from '../components/icons.js';
import { openSheet, closeSheet } from '../components/sheet.js';
import { confirmDialog } from '../components/confirm.js';
import { loadDemoData } from '../../state/demoData.js';

const APP_VERSION = '1.3';
const isDebug = () => new URLSearchParams(location.search).get('debug') === '1';

export function renderSettings() {
  const state = getState();

  const screen = h('div', { className: 'screen' }, [
    h('div', { className: 'topbar', style: { justifyContent: 'flex-start', gap: '4px' } }, [
      h('a', { className: 'icon-btn', href: '#/', 'aria-label': 'Volver' }, [icon('back', { size: 'md' })]),
      h('h1', { className: 'page-title' }, 'Ajustes'),
    ]),

    h('div', { className: 'settings-group' }, [
      h('div', { className: 'section-title' }, 'Apariencia'),
      h('div', { className: 'card' }, [themeSegmented()]),
    ]),

    h('div', { className: 'settings-group' }, [
      h('div', { className: 'section-title' }, 'Datos'),
      h('div', { className: 'card stack-8' }, [
        h('p', { className: 'muted' }, 'Descargá una copia de tus datos para poder recuperarlos más adelante.'),
        h('button', { className: 'btn btn-secondary btn-block', onClick: exportData }, [icon('download', { size: 'sm' }), 'Guardar copia']),
        importButton(),
      ]),
      state.group
        ? h('button', { className: 'btn btn-ghost', style: { marginTop: '10px' }, onClick: () => { syncNowManual(); showToast('Sincronizando…'); } }, 'Sincronizar ahora')
        : null,
      state.hasDemoData
        ? h('button', { className: 'btn btn-ghost', style: { marginTop: '10px' }, onClick: confirmDeleteDemo }, 'Eliminar datos de demostración')
        : null,
      h('div', { className: 'danger-zone', style: { marginTop: '14px' } }, [
        h('p', { className: 'muted', style: { marginBottom: '10px' } }, 'Borra todo lo guardado en este teléfono. No se puede deshacer.'),
        h('button', { className: 'btn btn-danger btn-block', onClick: confirmWipeAll }, [icon('trash', { size: 'sm' }), 'Borrar todos los datos']),
      ]),
    ]),

    h('div', { className: 'settings-group' }, [
      h('div', { className: 'section-title' }, 'Información'),
      h('div', { className: 'card' }, [
        h('div', { className: 'kv-row' }, [h('span', { className: 'kv-label' }, 'Versión'), h('span', { className: 'kv-value' }, APP_VERSION)]),
      ]),
      h('p', { className: 'faint', style: { marginTop: '10px' } }, 'Tus datos se guardan en este dispositivo.'),
      isDebug()
        ? h('button', { className: 'btn btn-ghost', style: { marginTop: '10px' }, onClick: confirmLoadDemo }, 'Cargar datos de demostración (debug)')
        : null,
    ]),
  ]);

  return screen;
}

function themeSegmented() {
  const wrap = h('div', { className: 'segmented' });
  const options = [
    ['system', 'Sistema'],
    ['light', 'Claro'],
    ['dark', 'Oscuro'],
  ];
  function draw() {
    wrap.replaceChildren(
      ...options.map(([value, label]) =>
        h(
          'button',
          {
            type: 'button',
            className: getTheme() === value ? 'active' : '',
            onClick: () => { setTheme(value); draw(); },
          },
          label
        )
      )
    );
  }
  draw();
  return wrap;
}

async function exportData() {
  const backup = await exportBackup();
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `equilibra-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast('Copia guardada');
}

function importButton() {
  const input = h('input', { type: 'file', accept: 'application/json', className: 'visually-hidden', onChange: handleFile });
  return h('div', {}, [
    input,
    h('button', { className: 'btn btn-secondary btn-block', onClick: () => input.click() }, [icon('upload', { size: 'sm' }), 'Restaurar copia']),
  ]);
}

async function handleFile(event) {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;

  let backup;
  try {
    const text = await file.text();
    backup = JSON.parse(text);
  } catch {
    showToast('El archivo no es válido.');
    return;
  }

  if (!backup || backup.schema !== 'equilibra-backup') {
    showToast('Ese archivo no es una copia de Equilibra.');
    return;
  }

  const content = h('div', {}, [
    h('p', { className: 'muted' }, 'Elegí cómo restaurar esta copia.'),
    h('div', { className: 'stack-12', style: { marginTop: '12px' } }, [
      h('button', { className: 'btn btn-primary btn-block', onClick: () => finishImport(backup, false) }, 'Fusionar con los datos actuales'),
      h('button', { className: 'btn btn-danger btn-block', onClick: () => finishImport(backup, true) }, 'Reemplazar todo'),
      h('button', { className: 'btn btn-secondary btn-block', onClick: () => closeSheet() }, 'Cancelar'),
    ]),
  ]);
  openSheet('Restaurar copia', content);
}

async function finishImport(backup, replace) {
  try {
    if (replace) {
      const ok = await confirmDialog({
        title: 'Reemplazar todos los datos',
        message: 'Esto borra los datos actuales del teléfono y los reemplaza por completo con el contenido de la copia. No se puede deshacer.',
        confirmLabel: 'Reemplazar',
      });
      if (!ok) return;
    }
    await importBackup(backup, { replace });
    showToast('Copia restaurada');
    closeSheet();
  } catch (err) {
    showToast(err.message || 'No se pudo restaurar la copia.');
  }
}

async function confirmWipeAll() {
  const ok = await confirmDialog({
    title: 'Borrar todos los datos',
    message: 'Se eliminarán personas, compras, devoluciones, transferencias, categorías y configuración guardada en este dispositivo. No se puede deshacer.',
    confirmLabel: 'Borrar todo',
  });
  if (!ok) return;
  await wipeAll();
  showToast('Datos borrados');
}

async function confirmDeleteDemo() {
  const ok = await confirmDialog({
    title: 'Eliminar datos de demostración',
    message: 'Se quitarán las personas, compras y transferencias de prueba que no estés usando en datos reales. Lo que hayas creado de verdad se conserva.',
    confirmLabel: 'Eliminar demo',
  });
  if (!ok) return;
  const result = await deleteDemoData();
  const total = result.purchases + result.settlements + result.people + result.categories + result.products;
  showToast(total > 0 ? 'Datos de demostración eliminados' : 'No había datos de demostración para quitar');
}

async function confirmLoadDemo() {
  const ok = await confirmDialog({
    title: 'Cargar datos de demostración',
    message: 'Se agregarán personas y compras ficticias a tu base actual, para probar la app. Podés quitarlas después con "Eliminar datos de demostración".',
    confirmLabel: 'Cargar demo',
    danger: false,
  });
  if (!ok) return;
  await loadDemoData();
  await reinitStore();
  showToast('Datos de demostración cargados');
}
