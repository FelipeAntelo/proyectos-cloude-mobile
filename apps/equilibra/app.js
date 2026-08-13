import { init } from './src/state/store.js';
import { startRouter } from './src/ui/router.js';
import { applyTheme, getTheme } from './src/utils/theme.js';

applyTheme(getTheme());

init()
  .then(() => startRouter())
  .catch((err) => {
    console.error('No se pudo inicializar Equilibra', err);
    const root = document.getElementById('app');
    if (root) {
      root.innerHTML =
        '<div class="screen"><div class="empty-state"><div class="emoji">⚠️</div><h3>No se pudo cargar la app</h3><p>Reintentá cerrando y abriendo Equilibra. Si el problema sigue, tu navegador podría no soportar IndexedDB.</p></div></div>';
    }
  });
