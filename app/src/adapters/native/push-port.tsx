// Adaptador NATIVO de notificaciones push — implementa el `NativePushPort`
// (declarado en `app/src/notifications/native-notification-bridge-adapter.ts`)
// usando `@react-native-firebase/messaging` (permiso + token FCM/APNs) y
// `@notifee/react-native` (presentación de la notificación local).
//
// Importa librerías nativas, por lo que es `.tsx` y queda EXCLUIDO del typecheck
// de `app/tsconfig.json`; se compila con Metro.
//
// Mapea al contrato del presentador de push:
//   - requestPermission() → EstadoPermisoPush ('concedido'|'denegado'|'no_determinado')
//   - getPushToken()      → string | null (token FCM)
//   - displayNotification({ titulo, cuerpo, recuadroId }) → muestra vía Notifee
// (Req 26.1, 26.2, 26.3, 26.5).

import messaging from '@react-native-firebase/messaging';
import notifee, {
  AndroidImportance,
  AuthorizationStatus,
} from '@notifee/react-native';

import type {
  NativeDisplayInput,
  NativePushPort,
} from '../../notifications/native-notification-bridge-adapter';
import type { EstadoPermisoPush } from '../../notifications';

/** Identificador del canal Android usado para los recordatorios (Req 26.2). */
const ANDROID_CHANNEL_ID = 'recordatorios';
const ANDROID_CHANNEL_NAME = 'Recordatorios del álbum';

/**
 * Traduce el `AuthorizationStatus` de Firebase Messaging al `EstadoPermisoPush`
 * del presentador:
 *   - AUTHORIZED / PROVISIONAL → 'concedido'
 *   - DENIED                   → 'denegado'
 *   - NOT_DETERMINED (u otros) → 'no_determinado'
 */
function mapAuthStatus(status: number): EstadoPermisoPush {
  switch (status) {
    case AuthorizationStatus.AUTHORIZED:
    case AuthorizationStatus.PROVISIONAL:
      return 'concedido';
    case AuthorizationStatus.DENIED:
      return 'denegado';
    default:
      return 'no_determinado';
  }
}

/**
 * Implementación del puerto nativo de push sobre Firebase Messaging + Notifee.
 * Sin estado observable propio; se inyecta en `NativeNotificationBridgeAdapter`.
 */
export class FirebaseNotifeePushPort implements NativePushPort {
  /** Solicita el permiso de notificaciones al SO (Req 26.1, 26.5). */
  async requestPermission(): Promise<EstadoPermisoPush> {
    const status = await messaging().requestPermission();
    return mapAuthStatus(status);
  }

  /**
   * Obtiene el Token_Push de FCM (que en iOS envuelve el token de APNs), o
   * `null` si no se pudo emitir (Req 26.1).
   */
  async getPushToken(): Promise<string | null> {
    try {
      const token = await messaging().getToken();
      return token && token.length > 0 ? token : null;
    } catch {
      return null;
    }
  }

  /**
   * Muestra el recordatorio en el sistema vía Notifee (Req 26.2, 26.3). Crea el
   * canal Android idempotentemente antes de mostrar. `recuadroId`, si viene, se
   * adjunta como dato para que el tap enrute al Recuadro correspondiente.
   */
  async displayNotification(input: NativeDisplayInput): Promise<void> {
    const channelId = await notifee.createChannel({
      id: ANDROID_CHANNEL_ID,
      name: ANDROID_CHANNEL_NAME,
      importance: AndroidImportance.HIGH,
    });

    await notifee.displayNotification({
      title: input.titulo,
      body: input.cuerpo,
      data: input.recuadroId ? { recuadroId: input.recuadroId } : {},
      android: {
        channelId,
        pressAction: { id: 'default' },
      },
    });
  }
}

/** Instancia lista para inyectar en `NativeNotificationBridgeAdapter`. */
export const firebaseNotifeePushPort = new FirebaseNotifeePushPort();

export default firebaseNotifeePushPort;
