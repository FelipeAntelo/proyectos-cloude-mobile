const KEY = 'pwa-lab:equilibra:theme';

export function getTheme() {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

export function setTheme(value) {
  try {
    if (value === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, value);
  } catch {
    /* almacenamiento no disponible */
  }
  applyTheme(value);
}

export function applyTheme(value) {
  if (value === 'light' || value === 'dark') {
    document.documentElement.setAttribute('data-theme', value);
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}
