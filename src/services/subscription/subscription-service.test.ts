/**
 * Pruebas unitarias del SubscriptionService (Task 6.1 — Requirements: 3.1, 3.2, 3.3, 3.4).
 *
 * Cubren:
 *  - getSubscription: catálogo de planes (Básico $39.99 / Premium $79.99) y
 *    suscripción actual (null cuando no existe, la vigente cuando existe).
 *  - purchase: activación de suscripción nueva y renovación de la existente tras
 *    validar el recibo IAP; rechazo de recibo inválido y de plan que no coincide.
 *  - upgrade: cambio Básico→Premium tras confirmar el pago; rechazos cuando no
 *    hay suscripción, cuando ya es Premium y cuando el recibo no acredita Premium.
 */
import { describe, it, expect } from 'vitest';
import type { PlanSuscripcion, Suscripcion, UUID } from '../../domain/types.js';
import { InMemorySuscripcionRepository } from '../../persistence/in-memory/repositories.js';
import type {
  IAPReceipt,
  IAPReceiptValidator,
  IAPValidationResult,
} from './iap-receipt-validator.js';
import { PLAN_CATALOGO } from './plan-catalog.js';
import { SubscriptionService, SubscriptionError } from './subscription-service.js';

const USUARIO_ID = '11111111-1111-4111-8111-111111111111' as UUID;
const SUSCRIPCION_ID = '22222222-2222-4222-8222-222222222222' as UUID;
const NUEVO_ID = '33333333-3333-4333-8333-333333333333' as UUID;

const RECEIPT_APP_STORE: IAPReceipt = {
  plataforma: 'APP_STORE',
  receipt: 'recibo-opaco-app-store',
};

/**
 * Doble determinista del validador de recibos IAP. Se configura con un resultado
 * fijo, permitiendo probar caminos válidos e inválidos sin I/O externa.
 */
class FakeIAPValidator implements IAPReceiptValidator {
  public recibidos: IAPReceipt[] = [];

  constructor(private readonly resultado: IAPValidationResult) {}

  validar(receipt: IAPReceipt): Promise<IAPValidationResult> {
    this.recibidos.push(receipt);
    return Promise.resolve(this.resultado);
  }
}

function validador(resultado: IAPValidationResult): FakeIAPValidator {
  return new FakeIAPValidator(resultado);
}

function ok(
  plan: PlanSuscripcion,
  vigenciaHasta = '2026-01-01',
  revenueCatId = 'rc-abc',
): IAPValidationResult {
  return { ok: true, plan, vigenciaHasta, revenueCatId };
}

function makeSuscripcion(plan: PlanSuscripcion, overrides: Partial<Suscripcion> = {}): Suscripcion {
  return {
    id: SUSCRIPCION_ID,
    usuarioId: USUARIO_ID,
    plan,
    estado: 'ACTIVA',
    vigenciaHasta: '2025-01-01',
    revenueCatId: 'rc-original',
    ...overrides,
  };
}

function makeService(
  iap: IAPReceiptValidator,
  seed: readonly Suscripcion[] = [],
): { service: SubscriptionService; repo: InMemorySuscripcionRepository } {
  const repo = new InMemorySuscripcionRepository(seed);
  const service = new SubscriptionService({
    suscripciones: repo,
    iapValidator: iap,
    newId: () => NUEVO_ID,
  });
  return { service, repo };
}

describe('SubscriptionService.getSubscription', () => {
  it('expone el catálogo de planes Básico $39.99/año y Premium $79.99/año (Req 3.1)', async () => {
    const { service } = makeService(validador(ok('BASICO')));

    const vista = await service.getSubscription(USUARIO_ID);

    expect(vista.catalogo).toHaveLength(2);
    const basico = vista.catalogo.find((p) => p.plan === 'BASICO');
    const premium = vista.catalogo.find((p) => p.plan === 'PREMIUM');
    expect(basico?.precioAnual).toBe(39.99);
    expect(basico?.moneda).toBe('USD');
    expect(premium?.precioAnual).toBe(79.99);
    expect(premium?.moneda).toBe('USD');
  });

  it('devuelve suscripcion null cuando el usuario aún no tiene ninguna', async () => {
    const { service } = makeService(validador(ok('BASICO')));

    const vista = await service.getSubscription(USUARIO_ID);

    expect(vista.suscripcion).toBeNull();
  });

  it('devuelve la suscripción vigente cuando existe', async () => {
    const suscripcion = makeSuscripcion('PREMIUM');
    const { service } = makeService(validador(ok('PREMIUM')), [suscripcion]);

    const vista = await service.getSubscription(USUARIO_ID);

    expect(vista.suscripcion).toEqual(suscripcion);
  });
});

describe('SubscriptionService.purchase', () => {
  it('activa una suscripción nueva (ACTIVA) tras validar el recibo IAP (Req 3.2, 3.3)', async () => {
    const iap = validador(ok('BASICO', '2026-06-30', 'rc-nueva'));
    const { service, repo } = makeService(iap);

    const suscripcion = await service.purchase(USUARIO_ID, 'BASICO', RECEIPT_APP_STORE);

    expect(suscripcion.id).toBe(NUEVO_ID);
    expect(suscripcion.usuarioId).toBe(USUARIO_ID);
    expect(suscripcion.plan).toBe('BASICO');
    expect(suscripcion.estado).toBe('ACTIVA');
    expect(suscripcion.vigenciaHasta).toBe('2026-06-30');
    expect(suscripcion.revenueCatId).toBe('rc-nueva');
    // Se persistió y el recibo se envió al validador.
    expect(await repo.count()).toBe(1);
    expect(iap.recibidos).toEqual([RECEIPT_APP_STORE]);
  });

  it('renueva la suscripción existente sin crear una nueva (Req 3.3)', async () => {
    const existente = makeSuscripcion('BASICO', {
      estado: 'VENCIDA',
      vigenciaHasta: '2025-01-01',
    });
    const iap = validador(ok('BASICO', '2026-01-01', 'rc-renovada'));
    const { service, repo } = makeService(iap, [existente]);

    const renovada = await service.purchase(USUARIO_ID, 'BASICO', RECEIPT_APP_STORE);

    expect(renovada.id).toBe(SUSCRIPCION_ID);
    expect(renovada.estado).toBe('ACTIVA');
    expect(renovada.vigenciaHasta).toBe('2026-01-01');
    expect(renovada.revenueCatId).toBe('rc-renovada');
    expect(await repo.count()).toBe(1);
  });

  it('rechaza con INVALID_RECEIPT cuando el validador rechaza el recibo (Req 3.2)', async () => {
    const iap = validador({ ok: false, motivo: 'recibo caducado' });
    const { service, repo } = makeService(iap);

    await expect(service.purchase(USUARIO_ID, 'BASICO', RECEIPT_APP_STORE)).rejects.toMatchObject({
      code: 'INVALID_RECEIPT',
    });
    await expect(service.purchase(USUARIO_ID, 'BASICO', RECEIPT_APP_STORE)).rejects.toBeInstanceOf(
      SubscriptionError,
    );
    // No se activó ninguna suscripción.
    expect(await repo.count()).toBe(0);
  });

  it('rechaza con PLAN_MISMATCH cuando el recibo no corresponde al plan solicitado', async () => {
    const iap = validador(ok('BASICO'));
    const { service, repo } = makeService(iap);

    await expect(service.purchase(USUARIO_ID, 'PREMIUM', RECEIPT_APP_STORE)).rejects.toMatchObject({
      code: 'PLAN_MISMATCH',
    });
    expect(await repo.count()).toBe(0);
  });
});

describe('SubscriptionService.upgrade', () => {
  it('aplica el cambio Básico→Premium tras confirmar el pago (Req 3.4)', async () => {
    const existente = makeSuscripcion('BASICO');
    const iap = validador(ok('PREMIUM', '2026-12-31', 'rc-premium'));
    const { service, repo } = makeService(iap, [existente]);

    const actualizada = await service.upgrade(USUARIO_ID, RECEIPT_APP_STORE);

    expect(actualizada.id).toBe(SUSCRIPCION_ID);
    expect(actualizada.plan).toBe('PREMIUM');
    expect(actualizada.estado).toBe('ACTIVA');
    expect(actualizada.vigenciaHasta).toBe('2026-12-31');
    expect(actualizada.revenueCatId).toBe('rc-premium');
    // No se creó una suscripción adicional.
    expect(await repo.count()).toBe(1);
  });

  it('rechaza con NO_SUBSCRIPTION cuando el usuario no tiene suscripción', async () => {
    const iap = validador(ok('PREMIUM'));
    const { service } = makeService(iap);

    await expect(service.upgrade(USUARIO_ID, RECEIPT_APP_STORE)).rejects.toMatchObject({
      code: 'NO_SUBSCRIPTION',
    });
  });

  it('rechaza con ALREADY_PREMIUM cuando la suscripción ya es Premium', async () => {
    const iap = validador(ok('PREMIUM'));
    const { service } = makeService(iap, [makeSuscripcion('PREMIUM')]);

    await expect(service.upgrade(USUARIO_ID, RECEIPT_APP_STORE)).rejects.toMatchObject({
      code: 'ALREADY_PREMIUM',
    });
  });

  it('rechaza con PLAN_MISMATCH cuando el recibo no acredita el Plan_Premium', async () => {
    const iap = validador(ok('BASICO'));
    const { service, repo } = makeService(iap, [makeSuscripcion('BASICO')]);

    await expect(service.upgrade(USUARIO_ID, RECEIPT_APP_STORE)).rejects.toMatchObject({
      code: 'PLAN_MISMATCH',
    });
    // La suscripción sigue siendo Básico (no se modificó).
    const persistida = await repo.findByUsuarioId(USUARIO_ID);
    expect(persistida?.plan).toBe('BASICO');
  });

  it('rechaza con INVALID_RECEIPT cuando el validador rechaza el recibo del upgrade (Req 3.2)', async () => {
    const iap = validador({ ok: false, motivo: 'firma inválida' });
    const { service, repo } = makeService(iap, [makeSuscripcion('BASICO')]);

    await expect(service.upgrade(USUARIO_ID, RECEIPT_APP_STORE)).rejects.toMatchObject({
      code: 'INVALID_RECEIPT',
    });
    const persistida = await repo.findByUsuarioId(USUARIO_ID);
    expect(persistida?.plan).toBe('BASICO');
  });
});

describe('PLAN_CATALOGO', () => {
  it('contiene exactamente los dos planes del Req 3.1 con sus precios', () => {
    expect(PLAN_CATALOGO.BASICO.precioAnual).toBe(39.99);
    expect(PLAN_CATALOGO.PREMIUM.precioAnual).toBe(79.99);
  });
});
