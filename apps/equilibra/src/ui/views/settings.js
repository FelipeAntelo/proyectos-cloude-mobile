import { h } from '../../utils/dom.js';
import { exportBackup, importBackup, init as reinitStore } from '../../state/store.js';
import { getTheme, setTheme } from '../../utils/theme.js';
import { showToast } from '../components/toast.js';
import { openSheet, closeSheet } from '../components/sheet.js';
import { confirmDialog } from '../components/confirm.js';
import { loadDemoData } from '../../state/demoData.js';

export function renderSettings() {
  const screen = h('div', { className: 'screen' }, [
    h('div', { className: 'topbar' }, [h('a', { className: 'icon-btn', href: '#/', 'aria-label': 'Volver' }, '←'), h('h1', { className: 'page-title' }, 'Ajustes')]),

    h('div', { className: 'section-title' }, 'Apariencia'),
    h('div', { className: 'card' }, [themeSegmented()]),

    h('div', { className: 'section-title' }, 'Backup local'),
    h('div', { className: 'card stack-12' }, [
      h('p', { className: 'muted' }, 'Tus datos viven solo en este teléfono. Exportá un respaldo de vez en cuando por las dudas.'),
      h('button', { className: 'btn btn-secondary btn-block', onClick: exportData }, '⬇️ Exportar backup (JSON)'),
      importButton(),
    ]),

    h('div', { className: 'section-title' }, 'Datos de demostración'),
    h('div', { className: 'card stack-12' }, [
      h('p', { className: 'muted' }, 'Carga personas y compras ficticias para probar la app (balances variados, categorías, compensaciones). No lo uses si ya tenés datos reales que querés conservar limpios.'),
      h('button', { className: 'btn btn-secondary btn-block', onClick: confirmLoadDemo }, '🧪 Cargar datos de demostración'),
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
  showToast('Backup exportado');
}

function importButton() {
  const input = h('input', { type: 'file', accept: 'application/json', className: 'visually-hidden', onChange: handleFile });
  return h('div', {}, [
    input,
    h('button', { className: 'btn btn-secondary btn-block', onClick: () => input.click() }, '⬆️ Importar backup'),
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
    showToast('El archivo no es un JSON válido.');
    return;
  }

  if (!backup || backup.schema !== 'equilibra-backup') {
    showToast('Ese archivo no es un backup de Equilibra.');
    return;
  }

  const content = h('div', {}, [
    h('p', { className: 'muted' }, 'Elegí cómo restaurar este backup.'),
    h('div', { className: 'stack-12', style: { marginTop: '12px' } }, [
      h('button', { className: 'btn btn-primary btn-block', onClick: () => finishImport(backup, false) }, 'Fusionar con los datos actuales'),
      h('button', { className: 'btn btn-danger btn-block', onClick: () => finishImport(backup, true) }, 'Reemplazar todo'),
      h('button', { className: 'btn btn-secondary btn-block', onClick: () => closeSheet() }, 'Cancelar'),
    ]),
  ]);
  openSheet('Importar backup', content);
}

async function finishImport(backup, replace) {
  try {
    if (replace) {
      const ok = await confirmDialog({
        title: 'Reemplazar todos los datos',
        message: 'Esto borra los datos actuales del teléfono y los reemplaza por completo con el contenido del backup. No se puede deshacer.',
        confirmLabel: 'Reemplazar',
      });
      if (!ok) return;
    }
    await importBackup(backup, { replace });
    showToast('Backup importado');
    closeSheet();
  } catch (err) {
    showToast(err.message || 'No se pudo importar el backup.');
  }
}

async function confirmLoadDemo() {
  const ok = await confirmDialog({
    title: 'Cargar datos de demostración',
    message: 'Se agregarán 4 personas y varias compras ficticias a tu base actual, para que puedas probar la app. Podés borrarlas después reemplazando por un backup limpio.',
    confirmLabel: 'Cargar demo',
    danger: false,
  });
  if (!ok) return;
  await loadDemoData();
  await reinitStore();
  showToast('Datos de demostración cargados');
}
