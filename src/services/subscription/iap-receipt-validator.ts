// Validación de recibos de compra dentro de la app (IAP).
//
// La compra y el upgrade de suscripción se procesan mediante las compras dentro
// de la app de App Store / Google Play (Req 3.2, 3.4). La verificación real de
// un recibo es I/O externa y específica de cada tienda (validar el recibo contra
// los servidores de Apple/Google o vía RevenueCat). Aquí se abstrae detrás de
// una interfaz `IAPReceiptValidator` para que el `SubscriptionService` sea puro
// y testeable con dobles en memoria.
//
// Task 6.1 — Requirements: 3.1, 3.2, 3.3, 3.4

import type { ISODate, PlanSuscripcion } from '../../domain/types.js';

/** Tienda de compras dentro de la app que emitió el recibo (Req 3.2). */
export type IAPPlataforma = 'APP_STORE' | 'GOOGLE_PLAY';

/**
 * Recibo IAP a validar: identifica la plataforma y transporta el token/recibo
 * opaco emitido por la tienda. El `SubscriptionService` no interpreta el
 * `receipt`; lo delega íntegro al validador.
 */
export interface IAPReceipt {
  plataforma: IAPPlataforma;
  /** Recibo/token opaco emitido por App Store o Google Play. */
  receipt: string;
}

/**
 * Resultado de validar un recibo IAP contra la tienda correspondiente.
 *
 * En caso válido incluye el plan comprado, la fecha hasta la que la compra queda
 * vigente (renovación anual — Req 3.1) y el identificador estable de la
 * suscripción en RevenueCat/tienda, usado para conciliar webhooks posteriores
 * (Req 3.3). En caso inválido indica el motivo del rechazo.
 */
export type IAPValidationResult =
  | {
      ok: true;
      plan: PlanSuscripcion;
      vigenciaHasta: ISODate;
      revenueCatId: string;
    }
  | { ok: false; motivo: string };

/**
 * Contrato de validación de recibos IAP. Las implementaciones concretas
 * (App Store / Google Play, directas o vía RevenueCat) validan el recibo contra
 * la tienda; en pruebas se inyecta un doble determinista.
 *
 * Devuelve `{ ok: false, motivo }` cuando el recibo es inválido, lo que el
 * servicio traduce a un rechazo de la compra/upgrade.
 */
export interface IAPReceiptValidator {
  validar(receipt: IAPReceipt): Promise<IAPValidationResult>;
}
