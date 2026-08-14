// Construye/lee el link de invitación (`?invite=TOKEN`) respetando el base
// path real de la página (GitHub Pages sirve la app bajo /apps/equilibra/,
// pero esto funciona igual en cualquier subpath).

export function buildInviteUrl(token) {
  const base = `${location.origin}${location.pathname}`;
  return `${base}?invite=${encodeURIComponent(token)}`;
}

export function extractInviteToken(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    const fromQuery = url.searchParams.get('invite');
    if (fromQuery) return fromQuery;
  } catch {
    // no era una URL completa: puede ser el token pegado directamente
  }
  return /^[a-f0-9]{16,}$/i.test(trimmed) ? trimmed : null;
}

/** Lee `?invite=` de la URL actual y la limpia (sin recargar), para no dejar el token visible. */
export function consumeInviteTokenFromLocation() {
  const params = new URLSearchParams(location.search);
  const token = params.get('invite');
  if (!token) return null;
  params.delete('invite');
  const query = params.toString();
  const cleanUrl = `${location.pathname}${query ? `?${query}` : ''}${location.hash}`;
  history.replaceState(null, '', cleanUrl);
  return token;
}
