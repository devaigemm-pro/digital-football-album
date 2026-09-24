/**
 * Pruebas unitarias del punto único de entitlements (Task 6.3 — Requirements: 3.6, 3.7).
 *
 * Cubren la regla de gating derivada EXCLUSIVAMENTE del plan (Property 2):
 *  - Plan_Premium habilita ambos derechos (Digital Cards internacionales + holograma).
 *  - Plan_Básico deshabilita ambos derechos.
 *  - Sin suscripción se aplica el gating más restrictivo (deny), equivalente a Básico.
 *  - `entitlementsForPlan` (helper puro) y `getEntitlements` (con repositorio)
 *    producen el mismo resultado; ningún dato distinto del plan altera la decisión.
 */
import { describe, it, expect } from 'vitest';
import type { Suscripcion, UUID } from '../../domain/types.js';
import { InMemorySuscripcionRepository } from '../../persistence/in-memory/repositories.js';
import { EntitlementsService, entitlementsForPlan } from './entitlements.js';

const USUARIO_ID = '11111111-1111-4111-8111-111111111111' as UUID;
const SUSCRIPCION_ID = '22222222-2222-4222-8222-222222222222' as UUID;

function makeSuscripcion(
  plan: Suscripcion['plan'],
  overrides: Partial<Suscripcion> = {},
): Suscripcion {
  return {
    id: SUSCRIPCION_ID,
    usuarioId: USUARIO_ID,
    plan,
    estado: 'ACTIVA',
    vigenciaHasta: '2026-01-01',
    revenueCatId: 'rc-abc',
    ...overrides,
  };
}

function makeService(seed: readonly Suscripcion[] = []): EntitlementsService {
  const repo = new InMemorySuscripcionRepository(seed);
  return new EntitlementsService({ suscripciones: repo });
}

describe('entitlementsForPlan', () => {
  it('habilita ambos derechos con Plan_Premium (Req 3.7)', () => {
    expect(entitlementsForPlan('PREMIUM')).toEqual({
      digitalCardsInternacional: true,
      holograma: true,
    });
  });

  it('deshabilita ambos derechos con Plan_Básico (Req 3.6)', () => {
    expect(entitlementsForPlan('BASICO')).toEqual({
      digitalCardsInternacional: false,
      holograma: false,
    });
  });

  it('devuelve un objeto nuevo en cada llamada (no comparte estado mutable)', () => {
    const a = entitlementsForPlan('PREMIUM');
    const b = entitlementsForPlan('PREMIUM');
    expect(a).not.toBe(b);
    a.holograma = false;
    expect(entitlementsForPlan('PREMIUM').holograma).toBe(true);
  });
});

describe('EntitlementsService.getEntitlements', () => {
  it('Premium habilita Digital Cards internacionales y holograma (Req 3.7)', async () => {
    const service = makeService([makeSuscripcion('PREMIUM')]);

    const entitlements = await service.getEntitlements(USUARIO_ID);

    expect(entitlements).toEqual({
      digitalCardsInternacional: true,
      holograma: true,
    });
  });

  it('Básico deshabilita Digital Cards internacionales y holograma (Req 3.6)', async () => {
    const service = makeService([makeSuscripcion('BASICO')]);

    const entitlements = await service.getEntitlements(USUARIO_ID);

    expect(entitlements).toEqual({
      digitalCardsInternacional: false,
      holograma: false,
    });
  });

  it('sin suscripción aplica el gating más restrictivo (deny)', async () => {
    const service = makeService();

    const entitlements = await service.getEntitlements(USUARIO_ID);

    expect(entitlements).toEqual({
      digitalCardsInternacional: false,
      holograma: false,
    });
  });

  it('deriva del plan con independencia del estado o la vigencia de la suscripción', async () => {
    // Suscripción Premium vencida y fuera de vigencia: el derecho se decide por
    // el plan, no por otros campos (derivación exclusiva del plan — Req 3.6, 3.7).
    const service = makeService([
      makeSuscripcion('PREMIUM', {
        estado: 'VENCIDA',
        vigenciaHasta: '2000-01-01',
      }),
    ]);

    const entitlements = await service.getEntitlements(USUARIO_ID);

    expect(entitlements).toEqual(entitlementsForPlan('PREMIUM'));
  });
});
