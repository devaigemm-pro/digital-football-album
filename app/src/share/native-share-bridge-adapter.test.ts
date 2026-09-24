// Pruebas unitarias del NativeShareBridgeAdapter (Task 29.3 — Requirements:
// 6.1, 6.2, 6.3, 6.4).
//
// TypeScript puro con un `NativeSharePort` doble que registra las invocaciones:
// verifican que el adaptador traduce cada método del contrato `NativeShareBridge`
// a la invocación nativa correcta del puerto inyectado (Req 6.2), sin importar
// `react-native`. El adaptador es el que enlaza el `SharePresenter`/`ShareViewModel`
// con la integración nativa real de cada plataforma en producción.
//
// Usa el shim central de globales de Jest (app/src/testing/jest-globals.d.ts).

import type { DigitalCard, SharePlatform } from '../viewmodels';
import { SHARE_PLATFORMS } from '../viewmodels';
import {
  NativeShareBridgeAdapter,
  type NativeSharePort,
} from './native-share-bridge-adapter';

const CARD: DigitalCard = { objectKey: 'cards/card-1.png', formato: 'PNG' };

/** Puerto nativo doble que registra qué método se invocó y con qué card. */
class FakeNativeSharePort implements NativeSharePort {
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

/** Invoca en el adaptador el método correspondiente a una plataforma. */
function invocar(
  adapter: NativeShareBridgeAdapter,
  plataforma: SharePlatform,
  card: DigitalCard,
): Promise<void> {
  switch (plataforma) {
    case 'INSTAGRAM_STORIES':
      return adapter.shareToInstagramStories(card);
    case 'WHATSAPP':
      return adapter.shareToWhatsApp(card);
    case 'X':
      return adapter.shareToX(card);
    case 'TIKTOK':
      return adapter.shareToTikTok(card);
    default:
      return Promise.reject(new Error(`plataforma inesperada: ${String(plataforma)}`));
  }
}

describe('NativeShareBridgeAdapter — delega en el puerto nativo (Req 6.2)', () => {
  // Parametrizado sobre las 4 plataformas soportadas.
  for (const plataforma of SHARE_PLATFORMS) {
    it(`enruta ${plataforma} al método nativo correspondiente`, async () => {
      const port = new FakeNativeSharePort();
      const adapter = new NativeShareBridgeAdapter(port);

      await invocar(adapter, plataforma, CARD);

      expect(port.calls).toEqual([{ metodo: plataforma, card: CARD }]);
    });
  }

  it('propaga el rechazo del puerto nativo (fallo de plataforma)', async () => {
    const boom = new Error('deep link no disponible');
    const port: NativeSharePort = {
      shareToInstagramStories: () => Promise.reject(boom),
      shareToWhatsApp: () => Promise.resolve(),
      shareToX: () => Promise.resolve(),
      shareToTikTok: () => Promise.resolve(),
    };
    const adapter = new NativeShareBridgeAdapter(port);

    await expect(adapter.shareToInstagramStories(CARD)).rejects.toThrow(
      'deep link no disponible',
    );
  });
});
