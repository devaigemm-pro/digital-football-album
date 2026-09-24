// Adaptador NATIVO de compartición — implementa el `NativeSharePort`
// (declarado en `app/src/share/native-share-bridge-adapter.ts`) usando
// `react-native-share`.
//
// Importa una librería nativa (`react-native-share`), por lo que es `.tsx` y
// queda EXCLUIDO del typecheck de `app/tsconfig.json`; se compila con Metro.
//
// Cada método recibe la `DigitalCard` seleccionada y comparte su binario
// (`card.objectKey`, referencia al asset de la card) en la plataforma destino
// (Req 6.1/6.2, backend Req 13.2):
//   - Instagram Stories → `Share.shareSingle` con `social: Social.InstagramStories`
//     y la card como `backgroundImage`.
//   - WhatsApp          → `Share.shareSingle` con `social: Social.WHATSAPP`.
//   - X (Twitter)       → `Share.open` (hoja de compartir; el usuario elige X).
//   - TikTok            → `Share.open` (no hay social dedicado; hoja del sistema).
//
// `objectKey` debe resolverse a una URL/URI accesible por el share sheet. En la
// generación de la card el backend expone una URL del asset; aquí se usa tal
// cual como `url`. El `appId` de Instagram Stories se toma de un placeholder
// documentado (debe configurarse con el App ID de Facebook de la app).

import Share, { Social } from 'react-native-share';

import type { NativeSharePort } from '../../share/native-share-bridge-adapter';
import type { DigitalCard } from '../../viewmodels';

/**
 * App ID de Facebook requerido por Instagram Stories (`shareSingle`). Debe
 * sustituirse por el App ID real de la app (configurable). Se centraliza aquí
 * para no dispersar el valor.
 */
const FACEBOOK_APP_ID = '';

/** Deriva la URL/URI del asset de la card a compartir. */
function cardUrl(card: DigitalCard): string {
  return card.objectKey;
}

/** MIME de la card según su formato, para hints del share sheet. */
function cardMimeType(card: DigitalCard): string {
  return card.formato === 'JPEG' ? 'image/jpeg' : 'image/png';
}

/**
 * Implementación del puerto nativo de compartición sobre `react-native-share`.
 * Sin estado; se instancia una vez y se inyecta en `NativeShareBridgeAdapter`.
 */
export class ReactNativeSharePort implements NativeSharePort {
  /** Publica la card como fondo de una Instagram Story (Req 6.2). */
  async shareToInstagramStories(card: DigitalCard): Promise<void> {
    await Share.shareSingle({
      social: Social.InstagramStories,
      appId: FACEBOOK_APP_ID,
      backgroundImage: cardUrl(card),
    });
  }

  /** Comparte la card por WhatsApp (Req 6.2). */
  async shareToWhatsApp(card: DigitalCard): Promise<void> {
    await Share.shareSingle({
      social: Social.Whatsapp,
      url: cardUrl(card),
      type: cardMimeType(card),
    });
  }

  /** Abre la hoja de compartir para publicar la card en X (Req 6.2). */
  async shareToX(card: DigitalCard): Promise<void> {
    await Share.open({
      url: cardUrl(card),
      type: cardMimeType(card),
    });
  }

  /** Abre la hoja de compartir para publicar la card en TikTok (Req 6.2). */
  async shareToTikTok(card: DigitalCard): Promise<void> {
    await Share.open({
      url: cardUrl(card),
      type: cardMimeType(card),
    });
  }
}

/** Instancia lista para inyectar en `NativeShareBridgeAdapter`. */
export const reactNativeSharePort = new ReactNativeSharePort();

export default reactNativeSharePort;
