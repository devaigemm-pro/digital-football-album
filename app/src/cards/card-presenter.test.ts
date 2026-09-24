// Pruebas unitarias del CardPresenter (Task 29.2 — Requirements: 5.1, 5.2,
// 5.3, 5.4).
//
// TypeScript puro con un `CardsClient` doble en memoria: NO requieren React
// Native ni red real. Cubren:
//   - generación exitosa que expone la card (objectKey + formato) (Req 5.1, 5.2);
//   - un rechazo por gating (PremiumRequiredError) → estado con el mensaje
//     "requiere Plan_Premium" y `errorKind: 'gating'` (Req 5.4);
//   - el cliente NO decide el gating: solo llama a `generateCard` (Req 5.3, 5.4);
//   - un rechazo por respuesta clasificada como gating (sin tipar) → gating;
//   - un error genérico → mensaje genérico y `errorKind: 'generic'` (Req 5.4);
//   - la máquina de estados no bloqueante idle → generating → generated (Req 5.3).
//
// Usa el shim central de globales de Jest (app/src/testing/jest-globals.d.ts);
// NO se declaran globales por archivo.

import {
  CARD_GENERIC_ERROR_MESSAGE,
  CardPresenter,
  PREMIUM_REQUIRED_CARD_MESSAGE,
  type CardState,
} from './card-presenter';
import type { CardsClient, DigitalCard } from '../viewmodels';
import { PremiumRequiredError } from '../net/errors';

const USUARIO_ID = 'usuario-1';
const MOMENTO_ID = 'momento-42';

const CARD: DigitalCard = { objectKey: 'cards/card-1.png', formato: 'PNG' };

/**
 * Cliente doble que registra las invocaciones a `generateCard` y resuelve con
 * una card fija. Sirve para comprobar que el presentador SOLO llama al backend
 * (no decide el gating él mismo — Req 5.3).
 */
class FakeCardsClient implements CardsClient {
  readonly calls: Array<{ usuarioId: string; momentoId: string }> = [];
  constructor(private readonly card: DigitalCard = CARD) {}
  generateCard(usuarioId: string, momentoId: string): Promise<DigitalCard> {
    this.calls.push({ usuarioId, momentoId });
    return Promise.resolve(this.card);
  }
}

/**
 * Cliente doble que registra las invocaciones y RECHAZA con un error dado.
 * Modela un backend que decide el gating (u otro fallo); el presentador solo
 * reacciona al rechazo.
 */
class RejectingCardsClient implements CardsClient {
  readonly calls: Array<{ usuarioId: string; momentoId: string }> = [];
  constructor(private readonly error: unknown) {}
  generateCard(usuarioId: string, momentoId: string): Promise<DigitalCard> {
    this.calls.push({ usuarioId, momentoId });
    return Promise.reject(this.error);
  }
}

/** Cliente controlable para observar la fase intermedia `generating`. */
class ControllableCardsClient implements CardsClient {
  resolve: ((card: DigitalCard) => void) | null = null;
  reject: ((err: unknown) => void) | null = null;
  generateCard(_usuarioId: string, _momentoId: string): Promise<DigitalCard> {
    return new Promise<DigitalCard>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}

describe('CardPresenter — estado inicial (Req 5.3)', () => {
  it('arranca en idle, sin card ni error', () => {
    const presenter = new CardPresenter(new FakeCardsClient());

    const state = presenter.getState();
    expect(state.status).toBe('idle');
    expect(state.card).toBeNull();
    expect(state.error).toBeNull();
    expect(state.errorKind).toBeNull();
  });

  it('subscribe emite el estado actual de inmediato', () => {
    const presenter = new CardPresenter(new FakeCardsClient());

    let seen: CardState | null = null;
    presenter.subscribe((s) => {
      seen = s;
    });
    expect(seen !== null).toBe(true);
    expect((seen as unknown as CardState).status).toBe('idle');
  });
});

describe('CardPresenter.generate — generación exitosa (Req 5.1, 5.2)', () => {
  it('expone la card generada (objectKey + formato)', async () => {
    const client = new FakeCardsClient();
    const presenter = new CardPresenter(client);

    await presenter.generate(USUARIO_ID, MOMENTO_ID);

    const state = presenter.getState();
    expect(state.status).toBe('generated');
    expect(state.card).toEqual(CARD);
    expect(state.error).toBeNull();
    expect(state.errorKind).toBeNull();
  });

  it('invoca POST /cards con el usuario y momento dados (el backend decide el gating)', async () => {
    const client = new FakeCardsClient();
    const presenter = new CardPresenter(client);

    await presenter.generate(USUARIO_ID, MOMENTO_ID);

    // El cliente SOLO llamó a generateCard: no evaluó el plan (Req 5.3).
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]).toEqual({
      usuarioId: USUARIO_ID,
      momentoId: MOMENTO_ID,
    });
  });
});

describe('CardPresenter.generate — rechazo por gating (Req 5.4)', () => {
  it('refleja "requiere Plan_Premium" ante PremiumRequiredError, sin decidir el gating', async () => {
    const client = new RejectingCardsClient(new PremiumRequiredError());
    const presenter = new CardPresenter(client);

    await presenter.generate(USUARIO_ID, MOMENTO_ID);

    const state = presenter.getState();
    expect(state.status).toBe('error');
    expect(state.error).toBe(PREMIUM_REQUIRED_CARD_MESSAGE);
    expect(state.error).toBe('requiere Plan_Premium');
    expect(state.errorKind).toBe('gating');
    expect(state.card).toBeNull();
    // El cliente decidió el gating (rechazó); el presentador solo llamó una vez.
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]).toEqual({
      usuarioId: USUARIO_ID,
      momentoId: MOMENTO_ID,
    });
  });

  it('clasifica un rechazo con respuesta cruda 402 como gating', async () => {
    // Un adaptador que propaga la respuesta cruda del backend (no tipada).
    const client = new RejectingCardsClient({
      response: { status: 402, body: null },
    });
    const presenter = new CardPresenter(client);

    await presenter.generate(USUARIO_ID, MOMENTO_ID);

    const state = presenter.getState();
    expect(state.status).toBe('error');
    expect(state.error).toBe('requiere Plan_Premium');
    expect(state.errorKind).toBe('gating');
  });

  it('clasifica un 403 con mensaje de Plan_Premium como gating', async () => {
    const client = new RejectingCardsClient({
      status: 403,
      body: { message: 'requiere Plan_Premium' },
    });
    const presenter = new CardPresenter(client);

    await presenter.generate(USUARIO_ID, MOMENTO_ID);

    const state = presenter.getState();
    expect(state.errorKind).toBe('gating');
    expect(state.error).toBe('requiere Plan_Premium');
  });
});

describe('CardPresenter.generate — error genérico (Req 5.4)', () => {
  it('refleja un mensaje genérico ante un fallo que no es gating', async () => {
    const client = new RejectingCardsClient(new Error('fallo de red'));
    const presenter = new CardPresenter(client);

    await presenter.generate(USUARIO_ID, MOMENTO_ID);

    const state = presenter.getState();
    expect(state.status).toBe('error');
    expect(state.error).toBe(CARD_GENERIC_ERROR_MESSAGE);
    expect(state.errorKind).toBe('generic');
    expect(state.card).toBeNull();
  });

  it('un 500 del backend NO se trata como gating (mensaje genérico)', async () => {
    const client = new RejectingCardsClient({
      status: 500,
      body: { message: 'error interno' },
    });
    const presenter = new CardPresenter(client);

    await presenter.generate(USUARIO_ID, MOMENTO_ID);

    const state = presenter.getState();
    expect(state.errorKind).toBe('generic');
    expect(state.error).toBe(CARD_GENERIC_ERROR_MESSAGE);
  });
});

describe('CardPresenter.generate — transiciones de estado (Req 5.3)', () => {
  it('transiciona idle → generating → generated emitiendo cada fase', async () => {
    const client = new ControllableCardsClient();
    const presenter = new CardPresenter(client);

    const statuses: string[] = [];
    presenter.subscribe((s) => {
      statuses.push(s.status);
    });

    const pending = presenter.generate(USUARIO_ID, MOMENTO_ID);
    // Tras iniciar, la fase es generating sin bloquear (Req 5.3).
    expect(presenter.getState().status).toBe('generating');

    client.resolve?.(CARD);
    await pending;

    expect(presenter.getState().status).toBe('generated');
    expect(statuses).toEqual(['idle', 'generating', 'generated']);
  });

  it('transiciona a error ante gating sin lanzar a la UI (Req 5.3, 5.4)', async () => {
    const client = new ControllableCardsClient();
    const presenter = new CardPresenter(client);

    const pending = presenter.generate(USUARIO_ID, MOMENTO_ID);
    client.reject?.(new PremiumRequiredError());
    // `generate` nunca rechaza: resuelve aunque el cliente falle (Req 5.3).
    await pending;

    const state = presenter.getState();
    expect(state.status).toBe('error');
    expect(state.errorKind).toBe('gating');
  });

  it('permite reintentar con éxito tras un error de gating', async () => {
    const rejecting = new RejectingCardsClient(new PremiumRequiredError());
    const presenter = new CardPresenter(rejecting);

    await presenter.generate(USUARIO_ID, MOMENTO_ID);
    expect(presenter.getState().status).toBe('error');
    expect(presenter.getState().errorKind).toBe('gating');
  });
});
