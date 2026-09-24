/**
 * Pruebas unitarias del RevenueCatWebhookHandler (Task 6.2 — Requirements: 3.3, 3.5).
 *
 * Cubren, con dobles en memoria:
 *  - Firma válida vs. inválida (rechazo sin efecto sobre el estado).
 *  - Idempotencia por `eventId` (los duplicados no reaplican el cambio).
 *  - Tolerancia a eventos fuera de orden (un evento antiguo no revierte el
 *    estado más nuevo, resuelto por marca de tiempo).
 *  - Pago recurrente OK → activa/renueva (Req 3.3).
 *  - Fallo de pago → conserva el estado previo y notifica (Req 3.5).
 *
 * Para ejercitar la verificación real de firma (HMAC de secreto compartido) el
 * verificador de las pruebas calcula un HMAC-SHA256 del cuerpo crudo, como haría
 * la implementación de producción.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import type { Suscripcion, UUID } from '../../domain/types.js';
import { InMemorySuscripcionRepository } from '../../persistence/in-memory/repositories.js';
import {
  RevenueCatWebhookHandler,
  InMemoryProcessedEventStore,
  InMemoryLastEventTimestampStore,
  type Notifier,
  type RevenueCatEvent,
  type WebhookSignatureVerifier,
} from './revenuecat-webhook.js';

const USUARIO_ID = '11111111-1111-4111-8111-111111111111' as UUID;
const SUSCRIPCION_ID = '22222222-2222-4222-8222-222222222222' as UUID;
const REVENUECAT_ID = 'rc-sub-abc';
const SECRETO = 'secreto-compartido-revenuecat';

/**
 * Verificador de firma HMAC-SHA256 con secreto compartido, equivalente al de
 * producción: la firma válida es el HMAC hex del cuerpo crudo.
 */
class HmacSignatureVerifier implements WebhookSignatureVerifier {
  constructor(private readonly secreto: string) {}

  firmar(rawBody: string): string {
    return createHmac('sha256', this.secreto).update(rawBody).digest('hex');
  }

  verificar(rawBody: string, signature: string): boolean {
    const esperada = this.firmar(rawBody);
    if (esperada.length !== signature.length) {
      return false;
    }
    return timingSafeEqual(Buffer.from(esperada), Buffer.from(signature));
  }
}

/** Notificador doble que registra las notificaciones de fallo de pago emitidas. */
class RecordingNotifier implements Notifier {
  public notificaciones: Array<{ suscripcion: Suscripcion; evento: RevenueCatEvent }> = [];

  notificarFalloPago(suscripcion: Suscripcion, evento: RevenueCatEvent): Promise<void> {
    this.notificaciones.push({ suscripcion, evento });
    return Promise.resolve();
  }
}

function makeSuscripcion(overrides: Partial<Suscripcion> = {}): Suscripcion {
  return {
    id: SUSCRIPCION_ID,
    usuarioId: USUARIO_ID,
    plan: 'PREMIUM',
    estado: 'ACTIVA',
    vigenciaHasta: '2025-06-01',
    revenueCatId: REVENUECAT_ID,
    ...overrides,
  };
}

function makeEvent(overrides: Partial<RevenueCatEvent> = {}): RevenueCatEvent {
  return {
    eventId: 'evt-1',
    type: 'RENEWAL',
    revenueCatId: REVENUECAT_ID,
    eventTimestamp: '2025-05-01T10:00:00.000Z',
    vigenciaHasta: '2026-05-01',
    ...overrides,
  };
}

function setup(seed: readonly Suscripcion[] = [makeSuscripcion()]): {
  handler: RevenueCatWebhookHandler;
  repo: InMemorySuscripcionRepository;
  verifier: HmacSignatureVerifier;
  notifier: RecordingNotifier;
  processed: InMemoryProcessedEventStore;
} {
  const repo = new InMemorySuscripcionRepository(seed);
  const verifier = new HmacSignatureVerifier(SECRETO);
  const notifier = new RecordingNotifier();
  const processed = new InMemoryProcessedEventStore();
  const handler = new RevenueCatWebhookHandler({
    suscripciones: repo,
    signatureVerifier: verifier,
    processedEvents: processed,
    lastEventTimestamps: new InMemoryLastEventTimestampStore(),
    notifier,
  });
  return { handler, repo, verifier, notifier, processed };
}

/** Serializa el evento como cuerpo crudo y devuelve su firma HMAC válida. */
function firmado(
  verifier: HmacSignatureVerifier,
  evento: RevenueCatEvent,
): { rawBody: string; signature: string } {
  const rawBody = JSON.stringify({ event: evento });
  return { rawBody, signature: verifier.firmar(rawBody) };
}

describe('RevenueCatWebhookHandler — verificación de firma', () => {
  it('rechaza el evento con firma inválida sin modificar el estado', async () => {
    const { handler, repo } = setup();
    const evento = makeEvent();
    const rawBody = JSON.stringify({ event: evento });

    const resultado = await handler.handle(rawBody, 'firma-invalida', evento);

    expect(resultado.outcome).toBe('INVALID_SIGNATURE');
    const persistida = await repo.findByRevenueCatId(REVENUECAT_ID);
    expect(persistida?.estado).toBe('ACTIVA');
    expect(persistida?.vigenciaHasta).toBe('2025-06-01');
  });

  it('acepta el evento con firma HMAC válida', async () => {
    const { handler, verifier } = setup();
    const evento = makeEvent();
    const { rawBody, signature } = firmado(verifier, evento);

    const resultado = await handler.handle(rawBody, signature, evento);

    expect(resultado.outcome).toBe('RENEWED');
  });
});

describe('RevenueCatWebhookHandler — idempotencia por eventId', () => {
  it('no reaplica un evento duplicado (mismo eventId)', async () => {
    const { handler, repo, verifier } = setup();
    const primero = makeEvent({ eventId: 'evt-dup', vigenciaHasta: '2026-01-01' });
    const firma1 = firmado(verifier, primero);

    const r1 = await handler.handle(firma1.rawBody, firma1.signature, primero);
    expect(r1.outcome).toBe('RENEWED');

    // Reintento de RevenueCat: mismo eventId con distinta vigencia; no debe
    // reaplicarse.
    const duplicado = makeEvent({ eventId: 'evt-dup', vigenciaHasta: '2099-01-01' });
    const firma2 = firmado(verifier, duplicado);
    const r2 = await handler.handle(firma2.rawBody, firma2.signature, duplicado);

    expect(r2.outcome).toBe('DUPLICATE');
    const persistida = await repo.findByRevenueCatId(REVENUECAT_ID);
    expect(persistida?.vigenciaHasta).toBe('2026-01-01');
  });
});

describe('RevenueCatWebhookHandler — tolerancia a eventos fuera de orden', () => {
  it('un evento antiguo que llega tarde no revierte el estado más nuevo', async () => {
    const { handler, repo, verifier } = setup();

    const nuevo = makeEvent({
      eventId: 'evt-nuevo',
      eventTimestamp: '2025-05-10T00:00:00.000Z',
      vigenciaHasta: '2026-05-10',
    });
    const fNuevo = firmado(verifier, nuevo);
    const rNuevo = await handler.handle(fNuevo.rawBody, fNuevo.signature, nuevo);
    expect(rNuevo.outcome).toBe('RENEWED');
    expect(rNuevo.suscripcion?.vigenciaHasta).toBe('2026-05-10');

    // Evento antiguo (marca anterior) que llega después: no debe revertir.
    const antiguo = makeEvent({
      eventId: 'evt-antiguo',
      eventTimestamp: '2025-05-01T00:00:00.000Z',
      vigenciaHasta: '2025-06-01',
    });
    const fAntiguo = firmado(verifier, antiguo);
    const rAntiguo = await handler.handle(fAntiguo.rawBody, fAntiguo.signature, antiguo);

    expect(rAntiguo.outcome).toBe('STALE');
    const persistida = await repo.findByRevenueCatId(REVENUECAT_ID);
    expect(persistida?.vigenciaHasta).toBe('2026-05-10');
  });
});

describe('RevenueCatWebhookHandler — pago recurrente correcto (Req 3.3)', () => {
  it('activa/renueva la suscripción con la nueva vigencia', async () => {
    const { handler, repo, verifier } = setup([
      makeSuscripcion({ estado: 'EN_GRACIA', vigenciaHasta: '2025-01-01' }),
    ]);
    const evento = makeEvent({ type: 'RENEWAL', vigenciaHasta: '2026-05-01' });
    const { rawBody, signature } = firmado(verifier, evento);

    const resultado = await handler.handle(rawBody, signature, evento);

    expect(resultado.outcome).toBe('RENEWED');
    const persistida = await repo.findByRevenueCatId(REVENUECAT_ID);
    expect(persistida?.estado).toBe('ACTIVA');
    expect(persistida?.vigenciaHasta).toBe('2026-05-01');
  });

  it('devuelve NO_SUBSCRIPTION cuando el revenueCatId no concilia', async () => {
    const { handler, verifier } = setup([]);
    const evento = makeEvent({ revenueCatId: 'rc-desconocido' });
    const { rawBody, signature } = firmado(verifier, evento);

    const resultado = await handler.handle(rawBody, signature, evento);

    expect(resultado.outcome).toBe('NO_SUBSCRIPTION');
    expect(resultado.suscripcion).toBeNull();
  });
});

describe('RevenueCatWebhookHandler — fallo de pago (Req 3.5)', () => {
  it('conserva el estado previo y notifica al usuario', async () => {
    const previa = makeSuscripcion({ estado: 'ACTIVA', vigenciaHasta: '2025-06-01' });
    const { handler, repo, verifier, notifier } = setup([previa]);
    const evento = makeEvent({ eventId: 'evt-fallo', type: 'BILLING_ISSUE' });
    const { rawBody, signature } = firmado(verifier, evento);

    const resultado = await handler.handle(rawBody, signature, evento);

    expect(resultado.outcome).toBe('PAYMENT_FAILED');
    // El estado NO cambia: mismo plan, estado y vigencia.
    const persistida = await repo.findByRevenueCatId(REVENUECAT_ID);
    expect(persistida).toEqual(previa);
    // Se notificó exactamente una vez con la suscripción preservada.
    expect(notifier.notificaciones).toHaveLength(1);
    expect(notifier.notificaciones[0]?.suscripcion.estado).toBe('ACTIVA');
    expect(notifier.notificaciones[0]?.evento.eventId).toBe('evt-fallo');
  });

  it('no notifica ni cambia el estado si la firma del fallo es inválida', async () => {
    const previa = makeSuscripcion();
    const { handler, repo, notifier } = setup([previa]);
    const evento = makeEvent({ eventId: 'evt-fallo', type: 'BILLING_ISSUE' });
    const rawBody = JSON.stringify({ event: evento });

    const resultado = await handler.handle(rawBody, 'no-valida', evento);

    expect(resultado.outcome).toBe('INVALID_SIGNATURE');
    expect(notifier.notificaciones).toHaveLength(0);
    const persistida = await repo.findByRevenueCatId(REVENUECAT_ID);
    expect(persistida).toEqual(previa);
  });
});
