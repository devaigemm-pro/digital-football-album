// ShareViewModel — compartición nativa de la Digital_Card (Req 13.1, 13.2).
//
// Modela, del lado de la presentación, la opción de compartir de la App_Móvil:
// ofrece las plataformas soportadas (Instagram Stories / WhatsApp / X / TikTok —
// Req 13.1) y, al elegir una, invoca la integración nativa correspondiente con
// la Digital_Card seleccionada (Req 13.2; design.md · "Generador_Cards" ·
// "Compartir"). El despacho a la integración nativa concreta se delega en el
// `NativeShareBridge` inyectado, de modo que el view-model es framework-agnóstico
// y unit-testable con un bridge doble.
//
// Task 21.2 — Requirements: 13.1, 13.2

import type { DigitalCard } from './backend-clients.js';
import type { NativeShareBridge, SharePlatform } from './native-share-bridge.js';
import { SHARE_PLATFORMS } from './native-share-bridge.js';

/**
 * Se lanza cuando se solicita compartir a una plataforma no soportada. La UI no
 * debería permitirlo (solo ofrece `SHARE_PLATFORMS`), pero la guarda mantiene la
 * invariante del conjunto cerrado de destinos (Req 13.1).
 */
export class PlataformaNoSoportadaError extends Error {
  constructor(public readonly plataforma: string) {
    super(`Plataforma de compartición no soportada: "${plataforma}"`);
    this.name = 'PlataformaNoSoportadaError';
  }
}

/**
 * View-model de compartición. Presenta las plataformas disponibles e invoca la
 * integración nativa correcta para la card seleccionada (Req 13.1, 13.2).
 */
export class ShareViewModel {
  constructor(private readonly bridge: NativeShareBridge) {}

  /**
   * Plataformas ofrecidas al usuario para compartir (Req 13.1): Instagram
   * Stories, WhatsApp, X y TikTok, en orden de presentación.
   */
  get plataformasDisponibles(): readonly SharePlatform[] {
    return SHARE_PLATFORMS;
  }

  /**
   * Comparte la `card` a la `plataforma` seleccionada invocando la integración
   * nativa correspondiente (Req 13.2). Enruta cada plataforma a su método del
   * `NativeShareBridge`; una plataforma fuera del conjunto soportado lanza
   * `PlataformaNoSoportadaError` sin invocar el bridge.
   *
   * @param card Digital_Card seleccionada a publicar/compartir.
   * @param plataforma Destino elegido por el usuario.
   * @throws PlataformaNoSoportadaError si la plataforma no está soportada.
   */
  async shareCard(card: DigitalCard, plataforma: SharePlatform): Promise<void> {
    switch (plataforma) {
      case 'INSTAGRAM_STORIES':
        await this.bridge.shareToInstagramStories(card);
        return;
      case 'WHATSAPP':
        await this.bridge.shareToWhatsApp(card);
        return;
      case 'X':
        await this.bridge.shareToX(card);
        return;
      case 'TIKTOK':
        await this.bridge.shareToTikTok(card);
        return;
      default:
        // `plataforma` es `never` aquí si el `switch` es exhaustivo; la guarda
        // protege ante valores fuera del tipo en tiempo de ejecución.
        throw new PlataformaNoSoportadaError(plataforma);
    }
  }
}
