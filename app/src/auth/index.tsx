// Barrel de la capa de autenticación Supabase — NATIVO (.tsx).
//
// Se mantiene en `.tsx` porque reexporta módulos que importan
// `@supabase/supabase-js` (excluidos del typecheck). El wiring (`App.tsx`) y las
// pantallas `.tsx` consumen desde aquí.

export {
  supabase,
  getAccessToken,
  refreshAccessToken,
  signUpWithEmail,
  signInWithEmail,
  signOut,
  updateEmail,
  subscribeToAuthState,
} from './supabase-client';

export { SupabaseAuthClient } from './supabase-auth-client';
