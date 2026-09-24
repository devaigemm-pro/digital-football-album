// Adaptador HTTP del `PushRegistrationClient` (Servicio_Notificaciones).
//
// Task 30.3 (wiring) — Requirements: 26.1, 26.4
//
// Implementa el contrato `PushRegistrationClient`
// (app/src/notifications/push-registration-presenter.ts) sobre el Módulo de red:
//   - `POST /notificaciones/token`                          body { token, platform }
//   - `POST /notificaciones/recuadros/{recuadroId}/silenciar`
//
// El adaptador solo mapea la petición/respuesta; la cadencia y las reglas de
// envío las decide el backend (Req 14). Errores de red/backend se propagan vía
// el mapeo central para que el presentador los refleje sin lanzar a la UI.
//
// TypeScript PURO: no importa `react-native`.

import type {
  PushRegistrationClient,
  RegisterPushTokenInput,
} from '../notifications';
import { buildRequest, ensureOk, type SendFn } from './http-adapter-utils';

/**
 * Adaptador HTTP concreto del `PushRegistrationClient`. Autenticado.
 */
export class HttpPushRegistrationClient implements PushRegistrationClient {
  constructor(private readonly send: SendFn) {}

  /**
   * `POST /notificaciones/token` con `{ token, platform }` (Req 26.1). Registra
   * el Token_Push del dispositivo en el Sistema.
   */
  async registerPushToken(input: RegisterPushTokenInput): Promise<void> {
    const response = await this.send(
      buildRequest('POST', '/notificaciones/token', {
        body: { token: input.token, platform: input.platform },
      }),
    );
    ensureOk(response);
  }

  /**
   * `POST /notificaciones/recuadros/{recuadroId}/silenciar` (Req 26.4). Comunica
   * al Sistema la solicitud de silenciar los recordatorios de un Recuadro.
   */
  async muteRecuadroReminder(recuadroId: string): Promise<void> {
    const response = await this.send(
      buildRequest(
        'POST',
        `/notificaciones/recuadros/${encodeURIComponent(recuadroId)}/silenciar`,
      ),
    );
    ensureOk(response);
  }
}
