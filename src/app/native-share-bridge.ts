// NativeShareBridge — puente a la compartición nativa de redes (Req 13.1, 13.2).
//
// La App_Móvil ofrece publicar la Digital_Card seleccionada directamente en
// Instagram Stories, WhatsApp, X y TikTok (Req 13.1) e invoca la integración
// nativa de cada plataforma con esa card (Req 13.2; design.md ·
// "Generador_Cards" · "Compartir"). La invocación nativa (deep links / SDKs de
// cada red, específicos de iOS/Android) es I/O de plataforma; siguiendo el
// patrón de aislamiento del diseño se abstrae detrás de esta interfaz,
// mockeable en pruebas y adaptada por la plataforma en producción.
//
// Task 21.2 — Requirements: 13.1, 13.2

import type { DigitalCard } from './backend-clients.js';

/**
 * Plataformas de redes sociales a las que la app puede publicar directamente
 * (Req 13.1). El conjunto es cerrado y coincide con el diseño: Instagram
 * Stories, WhatsApp, X y TikTok.
 */
export type SharePlatform = 'INSTAGRAM_STORIES' | 'WHATSAPP' | 'X' | 'TIKTOK';

/** Lista de las plataformas soportadas, en el orden de presentación en la UI (Req 13.1). */
export const SHARE_PLATFORMS: readonly SharePlatform[] = [
  'INSTAGRAM_STORIES',
  'WHATSAPP',
  'X',
  'TIKTOK',
] as const;

/**
 * Puente hacia las integraciones nativas de compartición (Req 13.2). Cada método
 * invoca la integración nativa de una plataforma con la Digital_Card indicada.
 * La implementación real es específica de la plataforma; en pruebas se sustituye
 * por un doble que registra las invocaciones.
 */
export interface NativeShareBridge {
  /** Publica la card en Instagram Stories (Req 13.2). */
  shareToInstagramStories(card: DigitalCard): Promise<void>;
  /** Comparte la card por WhatsApp (Req 13.2). */
  shareToWhatsApp(card: DigitalCard): Promise<void>;
  /** Publica la card en X (Req 13.2). */
  shareToX(card: DigitalCard): Promise<void>;
  /** Publica la card en TikTok (Req 13.2). */
  shareToTikTok(card: DigitalCard): Promise<void>;
}
