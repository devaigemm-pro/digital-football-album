// Adaptador HTTP del `PushRegistrationClient` (Servicio_Notificaciones).
//
// Backend deployado (docs/FRONTEND_INTEGRATION.md · §7): las notificaciones push
// (registro de Token_Push, silenciado de recordatorios) NO están disponibles
// todavía. Se conservan los métodos del contrato `PushRegistrationClient` para
// no romper la interfaz, pero lanzan `NotAvailableError` en lugar de llamar a
// rutas inexistentes. La UI de Notificaciones se oculta.
//
// TypeScript PURO: no importa `react-native`.

import type {
  PushRegistrationClient,
  RegisterPushTokenInput,
} from '../notifications';
import { NotAvailableError } from '../net/errors';
import { type SendFn } from './http-adapter-utils';

/**
 * Adaptador HTTP concreto del `PushRegistrationClient`. NO operativo en el
 * backend deployado: todos los métodos lanzan `NotAvailableError` (§7).
 */
export class HttpPushRegistrationClient implements PushRegistrationClient {
  // Acepta la `SendFn` por consistencia con los demás adaptadores (y para no
  // cambiar el sitio de construcción), pero no la usa: no hay endpoints reales.
  constructor(_send: SendFn) {}

  /**
   * NO disponible: registro de Token_Push no expuesto (§7).
   * @throws {NotAvailableError}
   */
  async registerPushToken(_input: RegisterPushTokenInput): Promise<void> {
    throw new NotAvailableError('registro de token push (POST /notificaciones/token)');
  }

  /**
   * NO disponible: silenciado de recordatorios no expuesto (§7).
   * @throws {NotAvailableError}
   */
  async muteRecuadroReminder(_recuadroId: string): Promise<void> {
    throw new NotAvailableError(
      'silenciar recordatorios (POST /notificaciones/recuadros/{id}/silenciar)',
    );
  }
}
