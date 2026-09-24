// Servicio_Suscripción: catálogo de planes y compra/upgrade vía IAP (Req 3).
//
// Implementa los contratos lógicos de design.md ("Servicio_Suscripción"):
//   - `GET /subscription`  → getSubscription(usuarioId): plan actual, estado,
//     vigencia y catálogo de planes disponibles (Req 3.1).
//   - `POST /subscription/purchase` → purchase(usuarioId, planId, receipt):
//     valida el recibo IAP (App Store / Google Play) y activa/renueva el plan
//     (Req 3.2, 3.3).
//   - `POST /subscription/upgrade`  → upgrade(usuarioId, receipt): aplica el
//     cambio Plan_Básico → Plan_Premium tras confirmar el pago (Req 3.4).
//
// El procesamiento de webhooks de RevenueCat (Req 3.3, 3.5) y el punto único de
// entitlements (Req 3.6, 3.7) son tareas separadas (6.2 y 6.3) y NO se
// implementan aquí.
//
// Toda dependencia con I/O o no determinismo (repositorio de suscripciones,
// validación de recibos IAP, generación de ids) se inyecta para poder ejercitar
// el servicio con los dobles en memoria de la capa de persistencia.
//
// Task 6.1 — Requirements: 3.1, 3.2, 3.3, 3.4

import type { PlanSuscripcion, Suscripcion, UUID } from '../../domain/types.js';
import type { SuscripcionRepository } from '../../persistence/repositories.js';
import type { IAPReceipt, IAPReceiptValidator } from './iap-receipt-validator.js';
import { listarCatalogo, type PlanCatalogoEntrada } from './plan-catalog.js';

/** Códigos de error del Servicio_Suscripción. */
export type SubscriptionErrorCode =
  'INVALID_RECEIPT' | 'PLAN_MISMATCH' | 'NO_SUBSCRIPTION' | 'ALREADY_PREMIUM';

/**
 * Error del Servicio_Suscripción con código estable. La capa API mapea
 * `INVALID_RECEIPT`/`PLAN_MISMATCH` a `402/400` y `NO_SUBSCRIPTION` a `404`.
 */
export class SubscriptionError extends Error {
  constructor(
    public readonly code: SubscriptionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SubscriptionError';
  }
}

/**
 * Vista de la suscripción del usuario devuelta por `getSubscription`: la
 * suscripción actual (o `null` si aún no tiene) y el catálogo de planes
 * disponibles (Req 3.1).
 */
export interface SubscriptionView {
  suscripcion: Suscripcion | null;
  catalogo: readonly PlanCatalogoEntrada[];
}

/** Generador de UUID inyectable para el id de suscripciones nuevas. */
export type IdGenerator = () => UUID;

/** Dependencias inyectadas del servicio. */
export interface SubscriptionServiceDeps {
  suscripciones: SuscripcionRepository;
  /** Validador de recibos IAP (App Store / Google Play), mockeable en pruebas. */
  iapValidator: IAPReceiptValidator;
  /** Generador de ids; por defecto `crypto.randomUUID`. */
  newId?: IdGenerator;
}

export class SubscriptionService {
  private readonly suscripciones: SuscripcionRepository;
  private readonly iapValidator: IAPReceiptValidator;
  private readonly newId: IdGenerator;

  constructor(deps: SubscriptionServiceDeps) {
    this.suscripciones = deps.suscripciones;
    this.iapValidator = deps.iapValidator;
    this.newId = deps.newId ?? (() => crypto.randomUUID());
  }

  /**
   * Devuelve la suscripción actual del usuario (plan, estado, vigencia) junto al
   * catálogo de planes disponibles (Req 3.1). Si el usuario aún no tiene
   * suscripción, `suscripcion` es `null` y el catálogo permite iniciar la compra.
   */
  async getSubscription(usuarioId: UUID): Promise<SubscriptionView> {
    const suscripcion = await this.suscripciones.findByUsuarioId(usuarioId);
    return { suscripcion, catalogo: listarCatalogo() };
  }

  /**
   * Procesa la compra/renovación de un plan mediante IAP (Req 3.2, 3.3).
   *
   * Valida el recibo con la tienda (App Store / Google Play) vía el validador
   * inyectado; si es inválido rechaza con `INVALID_RECEIPT`. Si el plan validado
   * no coincide con el `planId` solicitado, rechaza con `PLAN_MISMATCH`. Con el
   * pago confirmado, activa la suscripción si el usuario no tenía ninguna o la
   * renueva (actualiza plan, estado `ACTIVA`, vigencia y `revenueCatId`) si ya
   * existía (Req 3.3).
   */
  async purchase(
    usuarioId: UUID,
    planId: PlanSuscripcion,
    receipt: IAPReceipt,
  ): Promise<Suscripcion> {
    const validado = await this.validarRecibo(receipt);

    if (validado.plan !== planId) {
      throw new SubscriptionError(
        'PLAN_MISMATCH',
        `El recibo corresponde al plan "${validado.plan}" y no al solicitado "${planId}"`,
      );
    }

    return this.activarORenovar(
      usuarioId,
      validado.plan,
      validado.vigenciaHasta,
      validado.revenueCatId,
    );
  }

  /**
   * Aplica el upgrade de Plan_Básico → Plan_Premium tras confirmar el pago
   * (Req 3.4).
   *
   * Requiere una suscripción existente (`NO_SUBSCRIPTION` si no la hay) que no
   * sea ya Premium (`ALREADY_PREMIUM` en ese caso). Valida el recibo IAP; si el
   * pago no acredita el plan Premium rechaza con `PLAN_MISMATCH`. Con el pago
   * confirmado, actualiza el plan a Premium, reactiva la suscripción y renueva la
   * vigencia y el `revenueCatId`.
   */
  async upgrade(usuarioId: UUID, receipt: IAPReceipt): Promise<Suscripcion> {
    const actual = await this.suscripciones.findByUsuarioId(usuarioId);
    if (actual === null) {
      throw new SubscriptionError(
        'NO_SUBSCRIPTION',
        'No existe una suscripción para actualizar; realice primero una compra',
      );
    }
    if (actual.plan === 'PREMIUM') {
      throw new SubscriptionError('ALREADY_PREMIUM', 'La suscripción ya es Plan_Premium');
    }

    const validado = await this.validarRecibo(receipt);
    if (validado.plan !== 'PREMIUM') {
      throw new SubscriptionError(
        'PLAN_MISMATCH',
        'El recibo del upgrade no acredita el pago del Plan_Premium',
      );
    }

    return this.suscripciones.update(actual.id, {
      plan: 'PREMIUM',
      estado: 'ACTIVA',
      vigenciaHasta: validado.vigenciaHasta,
      revenueCatId: validado.revenueCatId,
    });
  }

  /**
   * Valida el recibo IAP contra la tienda; lanza `INVALID_RECEIPT` si el
   * validador lo rechaza (Req 3.2).
   */
  private async validarRecibo(receipt: IAPReceipt) {
    const resultado = await this.iapValidator.validar(receipt);
    if (!resultado.ok) {
      throw new SubscriptionError('INVALID_RECEIPT', `Recibo IAP inválido: ${resultado.motivo}`);
    }
    return resultado;
  }

  /**
   * Activa una suscripción nueva o renueva la existente del usuario con el plan
   * validado, dejándola en estado `ACTIVA` (Req 3.3).
   */
  private async activarORenovar(
    usuarioId: UUID,
    plan: PlanSuscripcion,
    vigenciaHasta: string,
    revenueCatId: string,
  ): Promise<Suscripcion> {
    const existente = await this.suscripciones.findByUsuarioId(usuarioId);
    if (existente === null) {
      return this.suscripciones.create({
        id: this.newId(),
        usuarioId,
        plan,
        estado: 'ACTIVA',
        vigenciaHasta,
        revenueCatId,
      });
    }

    return this.suscripciones.update(existente.id, {
      plan,
      estado: 'ACTIVA',
      vigenciaHasta,
      revenueCatId,
    });
  }
}
