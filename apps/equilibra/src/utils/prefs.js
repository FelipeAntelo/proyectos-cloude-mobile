// Preferencias livianas de UI (no la base de datos: eso es IndexedDB).
// Namespaceadas con el slug de la app para no pisar datos de otras PWAs del repo.

const PREFIX = 'pwa-lab:equilibra:';

export function getPref(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function setPref(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* almacenamiento no disponible, se ignora */
  }
}
