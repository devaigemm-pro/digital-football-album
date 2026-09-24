// Pruebas unitarias del SharePresenter (Task 29.3 — Requirements: 6.1, 6.2,
// 6.3, 6.4).
//
// TypeScript puro con un `NativeShareBridge` doble que registra las
// invocaciones: NO requieren React Native ni integración nativa real. Cubren:
//   - ofrece EXACTAMENTE las 4 plataformas (Instagram Stories, WhatsApp, X,
//     TikTok) en orden (Req 6.1);
//   - `share()` despacha al método correcto del bridge por plataforma,
//     parametrizado sobre las 4 (Req 6.2);
//   - captura el resultado de éxito en estado observable (Req 6.2, 6.3);
//   - captura un resultado de error cuando el bridge rechaza, SIN lanzar a la
//     UI (Req 6.3);
//   - una plataforma no soportada → `PlataformaNoSoportadaError` sin invocar el
//     bridge (Req 6.4).
//
// Usa el shim central de globales de Jest (app/src/testing/jest-globals.d.ts);
// NO se declaran globales por archivo.

import {
  PlataformaNoSoportadaError,
  SHARE_PLATFORMS,
  type DigitalCard,
  type NativeShareBridge,
  type SharePlatform,
} from '../viewmodels';
import {
  SHARE_ERROR_MESSAGE,
  SharePresenter,
  type ShareState,
} from './share-presenter';

const CARD: DigitalCard = { objectKey: 'cards/card-1.png', formato: 'PNG' };

/** Bridge doble que registra qué método se invocó y con qué card. */
class FakeNativeShareBridge implements NativeShareBridge {
  readonly calls: Array<{ metodo: SharePlatform; card: DigitalCard }> = [];

  shareToInstagramStories(card: DigitalCard): Promise<void> {
    this.calls.push({ metodo: 'INSTAGRAM_STORIES', card });
    return Promise.resolve();
  }
  shareToWhatsApp(card: DigitalCard): Promise<void> {
    this.calls.push({ metodo: 'WHATSAPP', card });
    return Promise.resolve();
  }
  shareToX(card: DigitalCard): Promise<void> {
    this.calls.push({ metodo: 'X', card });
    return Promise.resolve();
  }
  shareToTikTok(card: DigitalCard): Promise<void> {
    this.calls.push({ metodo: 'TIKTOK', card });
    return Promise.resolve();
  }
}

/** Bridge doble cuyos métodos SIEMPRE rechazan, para el camino de error. */
class RejectingNativeShareBridge implements NativeShareBridge {
  calls = 0;
  constructor(private readonly err: unknown) {}
  private fail(): Promise<void> {
    this.calls += 1;
    return Promise.reject(this.err);
  }
  shareToInstagramStories(): Promise<void> {
    return this.fail();
  }
  shareToWhatsApp(): Promise<void> {
    return this.fail();
  }
  shareToX(): Promise<void> {
    return this.fail();
  }
  shareToTikTok(): Promise<void> {
    return this.fail();
  }
}

describe('SharePresenter — plataformas ofrecidas (Req 6.1)', () => {
  it('ofrece exactamente Instagram Stories, WhatsApp, X y TikTok en orden', () => {
    const presenter = new SharePresenter(new FakeNativeShareBridge());

    expect(presenter.plataformasDisponibles).toEqual([
      'INSTAGRAM_STORIES',
      'WHATSAPP',
      'X',
      'TIKTOK',
    ]);
    expect(presenter.plataformasDisponibles).toHaveLength(4);
  });
});

describe('SharePresenter.share — despacho por plataforma (Req 6.2)', () => {
  // Método esperado del bridge para cada plataforma soportada.
  const METODO_ESPERADO: Record<SharePlatform, SharePlatform> = {
    INSTAGRAM_STORIES: 'INSTAGRAM_STORIES',
    WHATSAPP: 'WHATSAPP',
    X: 'X',
    TIKTOK: 'TIKTOK',
  };

  // Parametrizado sobre las 4 plataformas soportadas.
  for (const plataforma of SHARE_PLATFORMS) {
    it(`invoca el método nativo de ${plataforma}`, async () => {
      const bridge = new FakeNativeShareBridge();
      const presenter = new SharePresenter(bridge);

      await presenter.share(CARD, plataforma);

      expect(bridge.calls).toEqual([
        { metodo: METODO_ESPERADO[plataforma], card: CARD },
      ]);
    });
  }
});

describe('SharePresenter.share — captura de resultado (Req 6.2, 6.3)', () => {
  it('captura el éxito en el estado observable', async () => {
    const bridge = new FakeNativeShareBridge();
    const presenter = new SharePresenter(bridge);
    const observados: ShareState[] = [];
    presenter.subscribe((s) => observados.push(s));

    const resultado = await presenter.share(CARD, 'WHATSAPP');

    // Valor devuelto (awaitable) y estado observable coinciden en éxito.
    expect(resultado.status).toBe('success');
    expect(resultado.plataforma).toBe('WHATSAPP');
    expect(resultado.error).toBeNull();
    expect(presenter.getState().status).toBe('success');
    // Se observó la transición intermedia `sharing` antes del éxito.
    expect(observados.map((s) => s.status)).toEqual([
      'idle',
      'sharing',
      'success',
    ]);
  });

  it('captura el error cuando el bridge rechaza, sin lanzar a la UI', async () => {
    const bridge = new RejectingNativeShareBridge(new Error('cancelado por el usuario'));
    const presenter = new SharePresenter(bridge);

    // No lanza: el fallo nativo se captura como estado (Req 6.3).
    const resultado = await presenter.share(CARD, 'INSTAGRAM_STORIES');

    expect(bridge.calls).toBe(1);
    expect(resultado.status).toBe('error');
    expect(resultado.plataforma).toBe('INSTAGRAM_STORIES');
    expect(resultado.error).toBe('cancelado por el usuario');
    expect(presenter.getState().status).toBe('error');
  });

  it('usa un mensaje por defecto cuando el rechazo no es un Error legible', async () => {
    const bridge = new RejectingNativeShareBridge(undefined);
    const presenter = new SharePresenter(bridge);

    const resultado = await presenter.share(CARD, 'X');

    expect(resultado.status).toBe('error');
    expect(resultado.error).toBe(SHARE_ERROR_MESSAGE);
  });
});

describe('SharePresenter.share — plataforma no soportada (Req 6.4)', () => {
  it('rechaza con PlataformaNoSoportadaError sin invocar el bridge', async () => {
    const bridge = new FakeNativeShareBridge();
    const presenter = new SharePresenter(bridge);

    await expect(
      presenter.share(CARD, 'FACEBOOK' as unknown as SharePlatform),
    ).rejects.toBeInstanceOf(PlataformaNoSoportadaError);

    // Ningún método del bridge fue invocado (Req 6.4).
    expect(bridge.calls).toHaveLength(0);
    // El estado refleja el error de destino no soportado.
    expect(presenter.getState().status).toBe('error');
  });
});
