// NativeShareBridgeAdapter — implementación (STUB documentado) del contrato
// `NativeShareBridge` para la compartición nativa a redes sociales.
//
// Task 29.3 — Requirements: 6.1, 6.2, 6.3, 6.4
// (backend Req 13.2 — invocar la integración nativa de cada plataforma con la
//  Digital_Card seleccionada).
//
// La invocación nativa real es I/O de plataforma (deep links / share sheets /
// SDKs de cada red, específicos de iOS/Android): abrir la cámara de Instagram
// Stories con el asset, el share sheet de WhatsApp/X, o el compositor de TikTok.
// Siguiendo el patrón de aislamiento del diseño, ese I/O NO se importa aquí a
// nivel de módulo: este adaptador NO importa `react-native` en el nivel superior
// para que TYPECHEQUE bajo `app/tsconfig.json` (que aún no tiene el toolchain de
// RN instalado). En su lugar, el adaptador depende de un MÓDULO NATIVO INYECTADO
// (`NativeSharePort`) que la app cablea en producción con la implementación real
// (React Native `Share`, `Linking` para deep links, o módulos nativos de cada
// red). En pruebas se inyecta un doble.
//
// Producción (fuera de este entorno): un archivo de wiring del cliente crea el
// `NativeSharePort` sobre las APIs reales de React Native, p. ej.:
//
//   import { Linking, Share } from 'react-native';
//   const port: NativeSharePort = {
//     shareToInstagramStories: async ({ objectKey }) => {
//       // Deep link de Instagram Stories con el asset de fondo.
//       await Linking.openURL(`instagram-stories://share?...=${objectKey}`);
//     },
//     shareToWhatsApp: async ({ objectKey }) => {
//       await Share.share({ url: objectKey });          // hoja de compartir
//     },
//     shareToX: async ({ objectKey }) => {
//       await Linking.openURL(`twitter://post?...=${objectKey}`);
//     },
//     shareToTikTok: async ({ objectKey }) => {
//       await Linking.openURL(`tiktok://share?...=${objectKey}`);
//     },
//   };
//   const bridge = new NativeShareBridgeAdapter(port);
//
// Ese archivo de wiring es un `.tsx`/`.ts` que SÍ importa `react-native` y se
// compila con el toolchain del cliente; este adaptador permanece agnóstico y
// testable.

import type { DigitalCard, NativeShareBridge } from '../viewmodels';

/**
 * Puerto del módulo nativo de compartición INYECTADO en el adaptador. Cada
 * método realiza la invocación nativa real (deep link / share sheet / SDK) de
 * una plataforma con la Digital_Card. Es la única frontera de I/O de plataforma;
 * lo implementa el wiring del cliente sobre React Native (`Share`/`Linking`) en
 * producción y un doble en pruebas, manteniendo este archivo sin `react-native`.
 */
export interface NativeSharePort {
  /** Abre Instagram Stories con la card (deep link / módulo nativo). */
  shareToInstagramStories(card: DigitalCard): Promise<void>;
  /** Abre la hoja de compartir de WhatsApp con la card. */
  shareToWhatsApp(card: DigitalCard): Promise<void>;
  /** Abre el compositor de X (Twitter) con la card. */
  shareToX(card: DigitalCard): Promise<void>;
  /** Abre el compositor de TikTok con la card. */
  shareToTikTok(card: DigitalCard): Promise<void>;
}

/**
 * Adaptador que implementa el contrato `NativeShareBridge` que consume el
 * `ShareViewModel` (y, a través de él, el `SharePresenter`). Traduce cada método
 * del bridge a la invocación nativa correspondiente delegando en el
 * `NativeSharePort` inyectado (Req 6.2). Mantener este adaptador detrás del
 * puerto lo hace agnóstico de React Native y verificable.
 */
export class NativeShareBridgeAdapter implements NativeShareBridge {
  /**
   * @param port Módulo nativo de compartición inyectado. En producción envuelve
   *   las APIs reales de React Native; en pruebas, un doble que registra las
   *   invocaciones.
   */
  constructor(private readonly port: NativeSharePort) {}

  /** Publica la card en Instagram Stories vía el puerto nativo (Req 6.2). */
  shareToInstagramStories(card: DigitalCard): Promise<void> {
    return this.port.shareToInstagramStories(card);
  }

  /** Comparte la card por WhatsApp vía el puerto nativo (Req 6.2). */
  shareToWhatsApp(card: DigitalCard): Promise<void> {
    return this.port.shareToWhatsApp(card);
  }

  /** Publica la card en X (Twitter) vía el puerto nativo (Req 6.2). */
  shareToX(card: DigitalCard): Promise<void> {
    return this.port.shareToX(card);
  }

  /** Publica la card en TikTok vía el puerto nativo (Req 6.2). */
  shareToTikTok(card: DigitalCard): Promise<void> {
    return this.port.shareToTikTok(card);
  }
}
