// Adaptador HTTP del `SubscriptionClient` (Servicio_Suscripción).
//
// Task 30.1 (wiring) — Requirements: 25.1, 25.2, 25.3, 25.4, 25.5
//
// Implementa el contrato `SubscriptionClient`
// (app/src/subscription/subscription-presenter.ts) sobre el Módulo de red:
//   - `GET  /subscription`           → `SubscriptionView` (suscripción + catálogo)
//   - `POST /subscription/purchase`  body `{ planId, receipt }` → `Suscripcion`
//   - `POST /subscription/upgrade`   body `{ receipt }`         → `Suscripcion`
//   - `GET  /entitlements`           → `Entitlements`
//
// El cliente refleja el estado/derechos EXACTAMENTE como los devuelve el Sistema
// (Req 25.5): el adaptador NO recalcula ni deriva nada, solo mapea la respuesta.
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
import { buildRequest, readOkBody, type SendFn } from './http-adapter-utils';

/**
 * Adaptador HTTP concreto del `SubscriptionClient`. Autenticado.
 */
export class HttpSubscriptionClient implements SubscriptionClient {
  constructor(private readonly send: SendFn) {}

  /** `GET /subscription`: plan actual, estado y catálogo disponible (Req 25.1). */
  async getSubscription(): Promise<SubscriptionView> {
    const response = await this.send<SubscriptionView>(
      buildRequest('GET', '/subscription'),
    );
    return readOkBody(response, 'GET /subscription');
  }

  /**
   * `POST /subscription/purchase` con `{ planId, receipt }` (Req 25.2). Devuelve
   * la `Suscripcion` resultante que el presentador refleja sin recalcular.
   */
  async purchase(planId: PlanId, receipt: IapReceipt): Promise<Suscripcion> {
    const response = await this.send<Suscripcion>(
      buildRequest('POST', '/subscription/purchase', {
        body: { planId, receipt },
      }),
    );
    return readOkBody(response, 'POST /subscription/purchase');
  }

  /**
   * `POST /subscription/upgrade` con `{ receipt }` (Req 25.3). Devuelve la
   * `Suscripcion` actualizada a Plan_Premium.
   */
  async upgrade(receipt: IapReceipt): Promise<Suscripcion> {
    const response = await this.send<Suscripcion>(
      buildRequest('POST', '/subscription/upgrade', { body: { receipt } }),
    );
    return readOkBody(response, 'POST /subscription/upgrade');
  }

  /** `GET /entitlements`: derechos decididos por el Sistema (Req 25.4, 25.5). */
  async getEntitlements(): Promise<Entitlements> {
    const response = await this.send<Entitlements>(
      buildRequest('GET', '/entitlements'),
    );
    return readOkBody(response, 'GET /entitlements');
  }
}
