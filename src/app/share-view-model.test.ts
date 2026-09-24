/**
 * Pruebas unitarias del ShareViewModel (Task 21.2 — Requirements: 13.1, 13.2).
 *
 * Cubren:
 *  - Se ofrecen las 4 plataformas soportadas (Req 13.1).
 *  - `shareCard` invoca el método nativo correcto para cada plataforma con la
 *    Digital_Card seleccionada, y solo ese método (Req 13.2).
 *  - Property: para cada plataforma soportada, se invoca exactamente su bridge.
 *  - Una plataforma no soportada lanza error sin invocar el bridge.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { DigitalCard } from './backend-clients.js';
import type { NativeShareBridge, SharePlatform } from './native-share-bridge.js';
import { SHARE_PLATFORMS } from './native-share-bridge.js';
import { PlataformaNoSoportadaError, ShareViewModel } from './share-view-model.js';

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

const card: DigitalCard = { objectKey: 'cards/card-1.png', formato: 'PNG' };

describe('ShareViewModel — plataformas ofrecidas (Req 13.1)', () => {
  it('ofrece Instagram Stories, WhatsApp, X y TikTok', () => {
    const vm = new ShareViewModel(new FakeNativeShareBridge());
    expect(vm.plataformasDisponibles).toEqual(['INSTAGRAM_STORIES', 'WHATSAPP', 'X', 'TIKTOK']);
  });
});

describe('ShareViewModel.shareCard — despacho por plataforma (Req 13.2)', () => {
  it('invoca Instagram Stories', async () => {
    const bridge = new FakeNativeShareBridge();
    await new ShareViewModel(bridge).shareCard(card, 'INSTAGRAM_STORIES');
    expect(bridge.calls).toEqual([{ metodo: 'INSTAGRAM_STORIES', card }]);
  });

  it('invoca WhatsApp', async () => {
    const bridge = new FakeNativeShareBridge();
    await new ShareViewModel(bridge).shareCard(card, 'WHATSAPP');
    expect(bridge.calls).toEqual([{ metodo: 'WHATSAPP', card }]);
  });

  it('invoca X', async () => {
    const bridge = new FakeNativeShareBridge();
    await new ShareViewModel(bridge).shareCard(card, 'X');
    expect(bridge.calls).toEqual([{ metodo: 'X', card }]);
  });

  it('invoca TikTok', async () => {
    const bridge = new FakeNativeShareBridge();
    await new ShareViewModel(bridge).shareCard(card, 'TIKTOK');
    expect(bridge.calls).toEqual([{ metodo: 'TIKTOK', card }]);
  });

  it('para cada plataforma soportada invoca exactamente su bridge (Req 13.2)', async () => {
    // Feature: digital-football-album, despacho de compartición por plataforma (Req 13.2)
    await fc.assert(
      fc.asyncProperty(fc.constantFrom<SharePlatform>(...SHARE_PLATFORMS), async (plataforma) => {
        const bridge = new FakeNativeShareBridge();
        await new ShareViewModel(bridge).shareCard(card, plataforma);
        return (
          bridge.calls.length === 1 &&
          bridge.calls[0]?.metodo === plataforma &&
          bridge.calls[0]?.card === card
        );
      }),
      { numRuns: 100 },
    );
  });

  it('rechaza una plataforma no soportada sin invocar el bridge', async () => {
    const bridge = new FakeNativeShareBridge();
    const vm = new ShareViewModel(bridge);
    await expect(vm.shareCard(card, 'FACEBOOK' as unknown as SharePlatform)).rejects.toBeInstanceOf(
      PlataformaNoSoportadaError,
    );
    expect(bridge.calls).toHaveLength(0);
  });
});
