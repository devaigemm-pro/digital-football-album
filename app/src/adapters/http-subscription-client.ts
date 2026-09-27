// Adaptador HTTP del `SubscriptionClient` (Servicio_Suscripción).
//
// Backend deployado (docs/FRONTEND_INTEGRATION.md):
//   - `GET /me/entitlements` → `{ digitalCardsInternacional, holograma }`.
//
// El resto de operaciones de suscripción/IAP (catálogo, compra, upgrade) NO
// están disponibles todavía (docs · §7). Se conservan los métodos del contrato
// `SubscriptionClient` para no romper la interfaz, pero lanzan `NotAvailableError`
// en lugar de llamar a rutas inexistentes. La UI de suscripción se oculta.
//
// El cliente refleja los entitlements EXACTAMENTE como los devuelve el Sistema
// (Req 25.5): no recalcula ni deriva nada.
//
// TypeScript PURO: no importa `react-native`.

import type {
  Entitlements,
  IapReceipt,
  PlanId,
  SubscriptionClient,
  SubscriptionView,
  Suscripcion,
} from '../subscription';
import { NotAvailableError } from '../net/errors';
import { buildRequest, readOkBody, type SendFn } from './http-adapter-utils';

/**
 * Adaptador HTTP concreto del `SubscriptionClient`. Autenticado.
 *
 * Solo `getEntitlements` está soportado por el backend deployado; el resto de
 * métodos lanzan `NotAvailableError` (IAP/suscripción no expuestos aún, §7).
 */
export class HttpSubscriptionClient implements SubscriptionClient {
  constructor(private readonly send: SendFn) {}

  /**
   * NO disponible: no hay endpoint de catálogo/estado de suscripción (§7).
   * @throws {NotAvailableError}
   */
  async getSubscription(): Promise<SubscriptionView> {
    throw new NotAvailableError('estado de suscripción (GET /subscription)');
  }

  /**
   * NO disponible: la validación de compras IAP no está expuesta (§7).
   * @throws {NotAvailableError}
   */
  async purchase(_planId: PlanId, _receipt: IapReceipt): Promise<Suscripcion> {
    throw new NotAvailableError('compra de suscripción (POST /subscription/purchase)');
  }

  /**
   * NO disponible: el upgrade a Premium vía IAP no está expuesto (§7).
   * @throws {NotAvailableError}
   */
  async upgrade(_receipt: IapReceipt): Promise<Suscripcion> {
    throw new NotAvailableError('upgrade de suscripción (POST /subscription/upgrade)');
  }

  /**
   * `GET /me/entitlements`: derechos decididos por el Sistema (Req 25.4, 25.5).
   * ÚNICA operación de suscripción soportada por el backend deployado.
   */
  async getEntitlements(): Promise<Entitlements> {
    const response = await this.send<Entitlements>(
      buildRequest('GET', '/me/entitlements'),
    );
    return readOkBody(response, 'GET /me/entitlements');
  }
}
