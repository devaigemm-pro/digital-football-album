// Adaptador HTTP del `AuthClient` (Servicio_Autenticación).
//
// Task 26 (wiring) — Requirements: 22.1, 22.2, 22.6, 22.7, 22.8
//
// Implementa el contrato `AuthClient` (app/src/session/auth-session.ts) sobre el
// Módulo de red del cliente (`SendFn` de `HttpClient.send` o
// `SessionHttpClient.asSend()`). Endpoints (design.md · Endpoints):
//   - `POST /auth/login`    (público, authenticated:false) → { accessToken, refreshToken }
//   - `POST /auth/register` (público, authenticated:false) → { accessToken, refreshToken }
//   - `POST /auth/logout`   (body { refreshToken })
//   - `DELETE /cuenta`      (autenticada)
//
// Ante un login/registro no-2xx se lanza `AuthenticationError` (Req 22.3) para
// que el `AuthSessionPresenter` NO marque la sesión ni persista tokens.
//
// TypeScript PURO: solo `SendFn` (usa `fetch`) y tipos. No importa `react-native`.

import {
  AuthenticationError,
  type AuthClient,
  type AuthCredential,
} from '../session/auth-session';
import type { TokenPair } from '../net/session-client';
import { buildRequest, ensureOk, type SendFn } from './http-adapter-utils';

/**
 * Adaptador HTTP concreto del `AuthClient`. Se construye con la `SendFn` del
 * Módulo de red (típicamente `SessionHttpClient.asSend()` para login/registro
 * públicos, aunque el refresh no aplica a endpoints no autenticados).
 */
export class HttpAuthClient implements AuthClient {
  constructor(private readonly send: SendFn) {}

  /**
   * `POST /auth/login` con la credencial del proveedor (Req 22.1, 22.2). El
   * endpoint es público: `authenticated:false` (no adjunta Access_Token). Ante
   * un fallo no-2xx lanza {@link AuthenticationError} (Req 22.3).
   */
  async login(credential: AuthCredential): Promise<TokenPair> {
    return this.exchange('/auth/login', credential);
  }

  /**
   * `POST /auth/register` para crear una cuenta nueva (Req 22.1). Mismo mapeo y
   * manejo de errores que {@link login}.
   */
  async register(credential: AuthCredential): Promise<TokenPair> {
    return this.exchange('/auth/register', credential);
  }

  /**
   * `POST /auth/logout` con `{ refreshToken }` para invalidar el Refresh_Token en
   * el backend (Req 22.6). El endpoint no requiere Access_Token vigente; se envía
   * como público para evitar disparar el refresh ante un token ya expirado.
   */
  async logout(refreshToken: string): Promise<void> {
    const response = await this.send(
      buildRequest('POST', '/auth/logout', {
        body: { refreshToken },
        authenticated: false,
      }),
    );
    // El logout es best-effort en el presentador (que purga local aunque falle),
    // pero se valida el estado para propagar fallos reales del backend.
    ensureOk(response);
  }

  /**
   * `DELETE /cuenta`: borra la cuenta de forma permanente (Req 22.8). Es una
   * operación autenticada (adjunta el Access_Token vigente).
   */
  async deleteAccount(): Promise<void> {
    const response = await this.send(buildRequest('DELETE', '/cuenta'));
    ensureOk(response);
  }

  /**
   * Ejecuta un intercambio de credencial por par de tokens contra un endpoint de
   * autenticación público. Traduce cualquier fallo (no-2xx o par inválido) a
   * {@link AuthenticationError} sin exponer detalles del transporte (Req 22.3).
   */
  private async exchange(
    path: string,
    credential: AuthCredential,
  ): Promise<TokenPair> {
    const response = await this.send<Partial<TokenPair>>(
      buildRequest('POST', path, {
        body: credential,
        authenticated: false,
      }),
    );

    if (response.status < 200 || response.status >= 300) {
      throw new AuthenticationError(
        extractAuthMessage(response.body),
      );
    }

    const body = response.body;
    if (
      !body ||
      typeof body.accessToken !== 'string' ||
      typeof body.refreshToken !== 'string'
    ) {
      throw new AuthenticationError(
        'El Servicio_Autenticación no devolvió un par de tokens válido.',
      );
    }
    return { accessToken: body.accessToken, refreshToken: body.refreshToken };
  }
}

/**
 * Extrae un mensaje legible del cuerpo de error de autenticación, con respaldo.
 */
function extractAuthMessage(body: unknown): string {
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    const message = record['message'] ?? record['error'];
    if (typeof message === 'string' && message.trim() !== '') {
      return message;
    }
  }
  return 'No se pudo iniciar sesión. Verifica tus credenciales e inténtalo de nuevo.';
}
