// Catálogo de planes de suscripción (Req 3.1).
//
// El Servicio_Suscripción ofrece dos planes anuales: Plan_Básico a $39.99/año
// (funciones digitales limitadas) y Plan_Premium a $79.99/año (desbloquea
// Digital Cards de encuentros internacionales y stickers con efecto holograma
// para Clásicos y Partidos_Internacionales). El catálogo es la fuente de verdad
// de los precios y la descripción de cada plan.
//
// Task 6.1 — Requirements: 3.1

import type { PlanSuscripcion } from '../../domain/types.js';

/** Entrada del catálogo: precio anual y descripción de un plan (Req 3.1). */
export interface PlanCatalogoEntrada {
  plan: PlanSuscripcion;
  /** Precio anual en la moneda del catálogo. */
  precioAnual: number;
  /** Moneda ISO 4217 del precio (p. ej. "USD"). */
  moneda: string;
  descripcion: string;
}

/** Moneda del catálogo de planes (los precios del Req 3.1 están en USD). */
export const MONEDA_CATALOGO = 'USD';

/**
 * Catálogo de planes indexado por `PlanSuscripcion`. Contiene exactamente los
 * dos planes del Req 3.1: Básico ($39.99/año) y Premium ($79.99/año).
 */
export const PLAN_CATALOGO: Readonly<Record<PlanSuscripcion, PlanCatalogoEntrada>> = Object.freeze({
  BASICO: {
    plan: 'BASICO',
    precioAnual: 39.99,
    moneda: MONEDA_CATALOGO,
    descripcion:
      'Plan Básico anual: funciones digitales limitadas (sin Digital Cards ' +
      'internacionales ni stickers con efecto holograma).',
  },
  PREMIUM: {
    plan: 'PREMIUM',
    precioAnual: 79.99,
    moneda: MONEDA_CATALOGO,
    descripcion:
      'Plan Premium anual: desbloquea Digital Cards de Partidos ' +
      'Internacionales y stickers con efecto holograma para Clásicos y ' +
      'Partidos Internacionales.',
  },
});

/** Devuelve el catálogo completo como lista (para exponer en `GET /subscription`). */
export function listarCatalogo(): readonly PlanCatalogoEntrada[] {
  return Object.values(PLAN_CATALOGO);
}

/** Devuelve la entrada de catálogo de un plan (Req 3.1). */
export function obtenerPlan(plan: PlanSuscripcion): PlanCatalogoEntrada {
  return PLAN_CATALOGO[plan];
}
