// Adaptador `AuthClient` respaldado por Supabase Auth — puente NATIVO (.tsx).
//
// docs/FRONTEND_INTEGRATION.md · §2: el backend NO expone login/registro/refresh.
// La autenticación se hace DIRECTAMENTE contra Supabase Auth con supabase-js.
// Este adaptador implementa el contrato `AuthClient` que ya consume el
// `AuthSessionPresenter` (app/src/session/auth-session.ts), de modo que la capa
// de presentación de sesión no cambia.
//
// DISEÑO (por qué mapear a `TokenPair`):
//   - `AuthClient.login/register` deben devolver un `TokenPair
//     {accessToken, refreshToken}`. Supabase entrega ambos en su `Session`
//     (`access_token`, `refresh_token`), así que se mapean 1:1.
//   - El `refreshToken` mapeado NO se usa contra `POST /auth/refresh` (endpoint
//     inexistente). El refresh REAL lo hace supabase-js de forma transparente
//     (autoRefreshToken); en el wiring, el holder de Access_Token se sincroniza
//     vía `onAuthStateChange` y el reintento tras 401 llama a
//     `refreshAccessToken()` de la capa Supabase (NO a este `refreshToken`).
//   - `logout` cierra la sesión en Supabase (`signOut`), ignorando el
//     `refreshToken` recibido (Supabase gestiona su propia sesión persistida).
//   - `deleteAccount` NO está disponible en el backend deployado → lanza
//     `NotAvailableError` (la UI de borrado de cuenta se oculta/deshabilita).
//
// SOLO correo/contraseña: el flujo documentado es email/password. Las
// credenciales Apple/Google se rechazan aquí con `AuthenticationError` (los
// botones sociales se ocultan en el LoginScreen para esta build de prod-test).
//
// ⚠️ `.tsx` porque depende de `supabase-client.tsx` (que importa supabase-js).

import {
  AuthenticationError,
  type AuthClient,
  type AuthCredential,
} from '../session/auth-session';
import type { TokenPair } from '../net/session-client';
import { NotAvailableError } from '../net/errors';
import {
  signInWithEmail,
  signUpWithEmail,
  signOut,
} from './supabase-client';

/**
 * Implementación de `AuthClient` sobre Supabase Auth. No recibe `SendFn`: no
 * habla con el backend para autenticar (solo Supabase).
 */
export class SupabaseAuthClient implements AuthClient {
  /** Login con correo/contraseña contra Supabase (Req 22.1, 22.2). */
  async login(credential: AuthCredential): Promise<TokenPair> {
    const { email, password } = this.requireEmailCredential(credential);
    try {
      const session = await signInWithEmail(email, password);
      return this.toTokenPair(session.access_token, session.refresh_token);
    } catch (error) {
      throw this.toAuthError(error);
    }
  }

  /**
   * Registro con correo/contraseña contra Supabase (Req 22.1). Si el proyecto
   * exige confirmación por email, `signUp` puede no devolver sesión; en ese caso
   * se informa con un `AuthenticationError` explicativo (el usuario debe
   * confirmar antes de iniciar sesión).
   */
  async register(credential: AuthCredential): Promise<TokenPair> {
    const { email, password } = this.requireEmailCredential(credential);
    let session;
    try {
      session = await signUpWithEmail(email, password);
    } catch (error) {
      throw this.toAuthError(error);
    }
    if (!session) {
      throw new AuthenticationError(
        'Registro creado. Revisa tu correo para confirmar la cuenta antes de iniciar sesión.',
      );
    }
    return this.toTokenPair(session.access_token, session.refresh_token);
  }

  /**
   * Cierra la sesión en Supabase (`signOut`). El `refreshToken` recibido del
   * presentador se ignora: Supabase gestiona su propia sesión persistida.
   */
  async logout(_refreshToken: string): Promise<void> {
    await signOut();
  }

  /**
   * `DELETE /cuenta` NO existe en el backend deployado
   * (docs/FRONTEND_INTEGRATION.md §7) → operación no disponible. La UI de borrado
   * de cuenta debe estar oculta/deshabilitada.
   */
  async deleteAccount(): Promise<void> {
    throw new NotAvailableError('borrado de cuenta (DELETE /cuenta)');
  }

  /** Exige credencial de correo/contraseña; rechaza Apple/Google. */
  private requireEmailCredential(credential: AuthCredential): {
    email: string;
    password: string;
  } {
    if (credential.provider !== 'email') {
      throw new AuthenticationError(
        'Solo se admite inicio de sesión con correo y contraseña en esta versión.',
      );
    }
    return { email: credential.email, password: credential.password };
  }

  /** Valida y mapea los tokens de Supabase a un `TokenPair`. */
  private toTokenPair(
    accessToken: string | undefined,
    refreshToken: string | undefined,
  ): TokenPair {
    if (!accessToken || !refreshToken) {
      throw new AuthenticationError(
        'Supabase no devolvió un par de tokens válido.',
      );
    }
    return { accessToken, refreshToken };
  }

  /** Normaliza un error de Supabase a `AuthenticationError`. */
  private toAuthError(error: unknown): AuthenticationError {
    if (error instanceof AuthenticationError) {
      return error;
    }
    const message =
      error instanceof Error
        ? error.message
        : 'No se pudo iniciar sesión. Verifica tus credenciales.';
    return new AuthenticationError(message, error);
  }
}
