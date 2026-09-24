// Punto único de entitlements (gating por plan) del Servicio_Suscripción (Req 3.6, 3.7).
//
// Implementa el contrato lógico de design.md ("Servicio_Suscripción"):
//   - `GET /entitlements` → getEntitlements(usuarioId):
//     `{ digitalCardsInternacional, holograma }`, el punto único de decisión de
//     gating consultado por el Generador_Cards (Digital Cards internacionales,
//     Req 12.3, 12.4) y el Print_Engine (efecto holograma, Req 18.5, 18.6).
//
// Regla (Property 2 del diseño): ambos derechos están habilitados si y solo si
// el plan es Premium, y deshabilitados si el plan es Básico. La decisión se
// deriva EXCLUSIVAMENTE del plan de la suscripción; ningún otro dato (estado,
// vigencia, clasificación del partido, etc.) participa en el cálculo. La
// clasificación Clásico/Internacional la aplica quien consume estos derechos, no
// este punto de decisión.
//
// Decisión de diseño — ausencia de suscripción: si el usuario aún no tiene
// suscripción se aplica el gating más restrictivo (deny), equivalente a
// Plan_Básico: ambos derechos en `false`. Es la opción segura por defecto, ya
// que sin plan confirmado no procede habilitar funciones premium.
//
// La dependencia de persistencia (repositorio de suscripciones) se inyecta para
// poder ejercitar el punto de decisión con los dobles en memoria.
//
// Task 6.3 — Requirements: 3.6, 3.7

import type { PlanSuscripcion, UUID } from '../../domain/types.js';
import type { SuscripcionRepository } from '../../persistence/repositories.js';

/**
 * Derechos (entitlements) derivados del plan (Req 3.6, 3.7). Ambos habilitan
 * funciones premium: la generación de Digital Cards de Partidos_Internacionales
 * y el efecto holograma en stickers de Clásicos/Partidos_Internacionales.
 */
export interface Entitlements {
  /** Habilita Digital Cards de Partidos_Internacionales (Req 12.3, 12.4). */
  digitalCardsInternacional: boolean;
  /** Habilita el efecto holograma en stickers premium (Req 18.5, 18.6). */
  holograma: boolean;
}

/** Derechos denegados: gating más restrictivo (Plan_Básico o sin suscripción). */
const ENTITLEMENTS_DENEGADOS: Readonly<Entitlements> = Object.freeze({
  digitalCardsInternacional: false,
  holograma: false,
});

/** Derechos habilitados: Plan_Premium desbloquea ambas funciones. */
const ENTITLEMENTS_PREMIUM: Readonly<Entitlements> = Object.freeze({
  digitalCardsInternacional: true,
  holograma: true,
});

/**
 * Helper puro: deriva los derechos EXCLUSIVAMENTE del plan (Property 2). Ambos
 * derechos son `true` si y solo si `plan === 'PREMIUM'`, y `false` para
 * `'BASICO'`. Reutilizable por cualquier componente que ya conozca el plan sin
 * tener que consultar el repositorio.
 */
export function entitlementsForPlan(plan: PlanSuscripcion): Entitlements {
  return plan === 'PREMIUM' ? { ...ENTITLEMENTS_PREMIUM } : { ...ENTITLEMENTS_DENEGADOS };
}

/** Dependencias inyectadas del punto de entitlements. */
export interface EntitlementsServiceDeps {
  suscripciones: SuscripcionRepository;
}

/**
 * Punto único de decisión de gating por plan (Req 3.6, 3.7). Cualquier función
 * premium (Digital Cards internacionales, holograma) debe consultar aquí sus
 * derechos en lugar de inspeccionar el plan por su cuenta, garantizando una
 * regla de gating consistente en todo el sistema.
 */
export class EntitlementsService {
  private readonly suscripciones: SuscripcionRepository;

  constructor(deps: EntitlementsServiceDeps) {
    this.suscripciones = deps.suscripciones;
  }

  /**
   * Devuelve los derechos del usuario derivados exclusivamente del plan de su
   * suscripción (Req 3.6, 3.7). Si el usuario no tiene suscripción, aplica el
   * gating más restrictivo (ambos derechos en `false`), equivalente a
   * Plan_Básico.
   */
  async getEntitlements(usuarioId: UUID): Promise<Entitlements> {
    const suscripcion = await this.suscripciones.findByUsuarioId(usuarioId);
    if (suscripcion === null) {
      return { ...ENTITLEMENTS_DENEGADOS };
    }
    return entitlementsForPlan(suscripcion.plan);
  }
}
