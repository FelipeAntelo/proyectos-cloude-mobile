// Cliente Supabase perezoso: si no hay credenciales configuradas (ver
// config.js) o el import falla (offline, red bloqueada, etc.), la app sigue
// funcionando 100% local — nada de esto puede romper el arranque.

import { SUPABASE_URL, SUPABASE_ANON_KEY, isSyncConfigured } from './config.js';

let clientPromise = null;

export async function getSupabaseClient() {
  if (!isSyncConfigured()) return null;
  if (!clientPromise) {
    clientPromise = import('../../vendor/supabase-js.js')
      .then(({ createClient }) =>
        createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          auth: { persistSession: true, autoRefreshToken: true },
        })
      )
      .catch((err) => {
        clientPromise = null; // permite reintentar en el próximo llamado
        console.warn('Equilibra: no se pudo cargar el cliente de Supabase.', err);
        return null;
      });
  }
  return clientPromise;
}

/**
 * Identidad anónima de este dispositivo (sin email/password, invisible para
 * el usuario). supabase-js persiste la sesión sola entre aperturas de la
 * app; esto solo la crea la primera vez.
 */
export async function ensureAnonymousSession() {
  const client = await getSupabaseClient();
  if (!client) return null;
  const { data: existing } = await client.auth.getSession();
  if (existing && existing.session) return existing.session;
  const { data, error } = await client.auth.signInAnonymously();
  if (error) {
    console.warn('Equilibra: no se pudo iniciar sesión anónima.', error);
    return null;
  }
  return data.session;
}
