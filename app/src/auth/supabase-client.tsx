// Capa de autenticación con Supabase Auth (GoTrue) — puente NATIVO (.tsx).
//
// docs/FRONTEND_INTEGRATION.md · §2: la app autentica DIRECTAMENTE contra
// Supabase Auth con `@supabase/supabase-js`, NO contra el backend (el backend
// no expone login/registro: solo consume el JWT resultante como
// `Authorization: Bearer <access_token>`).
//
// ⚠️ Este archivo es `.tsx` (aunque no renderiza JSX) porque importa
// `@supabase/supabase-js`, `react-native-url-polyfill/auto` y
// `@react-native-async-storage/async-storage`, cuyo toolchain nativo NO está
// instalado en el entorno de typecheck. Por eso `app/tsconfig.json` lo EXCLUYE
// (patrón `src/**/*.tsx`); typechea/ejecuta al instalar las deps del cliente.
//
// Responsabilidades:
//   - Crear el cliente Supabase con persistencia de sesión (AsyncStorage) y
//     auto-refresh de token (lo gestiona supabase-js, NO el backend).
//   - Exponer helpers puros de sesión (`getAccessToken`, `signUpWithEmail`,
//     `signInWithEmail`, `signOut`, `subscribeToAuthState`) que el wiring de la
//     app (App.tsx) y el `SupabaseAuthClient` consumen.
//
// NOTA: `react-native-url-polyfill/auto` DEBE importarse ANTES que supabase-js
// para que `fetch`/`URL` funcionen correctamente en React Native.

import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createClient,
  type Session,
  type SupabaseClient,
} from '@supabase/supabase-js';

import { appConfig } from '../config';

/**
 * Cliente Supabase único de la app. `persistSession` + `autoRefreshToken`
 * delegan en supabase-js el ciclo de vida del token (refresh transparente);
 * `detectSessionInUrl:false` porque en una app nativa no hay callback por URL.
 */
export const supabase: SupabaseClient = createClient(
  appConfig.supabaseUrl,
  appConfig.supabaseAnonKey,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

/**
 * Devuelve el Access_Token (JWT de Supabase) vigente, o `null` si no hay sesión.
 * Es el token que se adjunta como `Authorization: Bearer` en cada petición al
 * backend. supabase-js refresca automáticamente antes de expirar, por lo que
 * `getSession()` devuelve un token válido si la sesión sigue activa.
 */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * Fuerza un refresh de la sesión (usado en el reintento tras un 401 del backend)
 * y devuelve el nuevo Access_Token, o `null` si la sesión ya no es recuperable.
 */
export async function refreshAccessToken(): Promise<string | null> {
  const { data, error } = await supabase.auth.refreshSession();
  if (error) {
    return null;
  }
  return data.session?.access_token ?? null;
}

/**
 * Registro con correo/contraseña (`supabase.auth.signUp`). Según la config del
 * proyecto puede enviar un email de confirmación; en ese caso `session` puede
 * venir `null` hasta confirmar. Devuelve la sesión (o `null`).
 * @throws Error con el mensaje de Supabase si el registro falla.
 */
export async function signUpWithEmail(
  email: string,
  password: string,
): Promise<Session | null> {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) {
    throw new Error(error.message);
  }
  return data.session;
}

/**
 * Login con correo/contraseña (`supabase.auth.signInWithPassword`). Devuelve la
 * sesión con el `access_token` que se envía al backend.
 * @throws Error con el mensaje de Supabase si las credenciales son inválidas.
 */
export async function signInWithEmail(
  email: string,
  password: string,
): Promise<Session> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) {
    throw new Error(error.message);
  }
  if (!data.session) {
    throw new Error('Supabase no devolvió una sesión tras el login.');
  }
  return data.session;
}

/** Cierra la sesión en Supabase (`supabase.auth.signOut`). Best-effort. */
export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

/**
 * Cambia el correo de la cuenta en Supabase Auth (`supabase.auth.updateUser`).
 *
 * IMPORTANTE: el correo es un dato de autenticación gestionado por Supabase, NO
 * por el backend (`PATCH /me` no acepta `email`). Según la configuración del
 * proyecto, Supabase envía un email de confirmación al correo nuevo (y a veces
 * al antiguo); el cambio NO surte efecto hasta que el usuario confirma desde ese
 * enlace. Por eso la UI debe avisar "revisa tu correo para confirmar el cambio".
 *
 * @throws Error con el mensaje de Supabase si el correo es inválido o ya existe.
 */
export async function updateEmail(email: string): Promise<void> {
  const normalizado = email.trim().toLowerCase();
  const { error } = await supabase.auth.updateUser({ email: normalizado });
  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Suscribe un callback a los cambios de estado de sesión de Supabase
 * (login/logout/refresh de token). Devuelve una función para desuscribirse.
 * El wiring de la app la usa para mantener sincronizado el holder de token en
 * memoria (que alimenta `HttpClient.getAccessToken`) con la sesión de supabase.
 */
export function subscribeToAuthState(
  listener: (accessToken: string | null) => void,
): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    listener(session?.access_token ?? null);
  });
  return () => {
    data.subscription.unsubscribe();
  };
}
