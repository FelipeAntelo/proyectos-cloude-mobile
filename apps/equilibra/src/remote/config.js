// Credenciales públicas de Supabase (URL + anon key). Son seguras de
// exponer en el frontend — la seguridad real la da RLS, no el secreto de
// estas dos strings. El `service_role` NUNCA va acá ni en ningún archivo de
// este repo. Ver SUPABASE_SETUP.md.
//
// Si SUPABASE_URL queda vacío, Equilibra no intenta sincronizar: funciona
// exactamente como una instalación local-only (comportamiento por defecto en
// este repo, ya que no incluimos un proyecto Supabase propio).

export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';

export function isSyncConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}
