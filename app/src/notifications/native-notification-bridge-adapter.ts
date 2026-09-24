// NativeNotificationBridgeAdapter — implementación (STUB documentado) del
// contrato `NativeNotificationBridge` para las notificaciones push nativas.
//
// Task 30.3 — Requirements: 26.1, 26.2, 26.3, 26.5
// (design.md · Integraciones → "Push: APNs/FCM para el Token_Push (Req 26)";
//  "Push (Req 26): registro del Token_Push (APNs/FCM) en el backend y renderizado
//  de los recordatorios recibidos").
//
// La solicitud del permiso de notificaciones, la obtención del Token_Push de
// APNs/FCM y el renderizado del recordatorio en el sistema son I/O de plataforma
// (específicos de iOS/Android, vía librerías como `@react-native-firebase/
// messaging`, `@notifee/react-native` o `PushNotificationIOS`). Siguiendo el
// patrón de aislamiento del diseño (igual que `NativeShareBridgeAdapter`), ese
// I/O NO se importa aquí a nivel de módulo: este adaptador NO importa
// `react-native` ni ningún módulo nativo en el nivel superior, para que
// TYPECHEQUE bajo `app/tsconfig.json` (que aún no tiene el toolchain de RN
// instalado). En su lugar, depende de un PUERTO NATIVO INYECTADO
// (`NativePushPort`) que la app cablea en producción con la implementación real.
//
// Producción (fuera de este entorno): un archivo de wiring del cliente crea el
// `NativePushPort` sobre las APIs reales, por ejemplo:
//
//   import messaging from '@react-native-firebase/messaging';
//   import notifee, { AuthorizationStatus } from '@notifee/react-native';
//
//   const port: NativePushPort = {
//     requestPermission: async () => {
//       const settings = await notifee.requestPermission();
//       return settings.authorizationStatus === AuthorizationStatus.AUTHORIZED
//         ? 'concedido'
//         : settings.authorizationStatus === AuthorizationStatus.DENIED
//           ? 'denegado'
//           : 'no_determinado';
//     },
//     getPushToken: async () => (await messaging().getToken()) ?? null,
//     displayNotification: async ({ titulo, cuerpo }) => {
//       await notifee.displayNotification({ title: titulo, body: cuerpo });
//     },
//   };
//   const bridge = new NativeNotificationBridgeAdapter(port);
//
// Ese archivo de wiring es un `.tsx`/`.ts` que SÍ importa los módulos nativos y
// se compila con el toolchain del cliente; este adaptador permanece agnóstico y
// testable.

import type {
  EstadoPermisoPush,
  NativeNotificationBridge,
  RenderedReminder,
} from './push-registration-presenter';

/**
 * Contenido plano que el puerto nativo necesita para mostrar una notificación.
 * Se extrae del `RenderedReminder` para no acoplar el puerto a la forma completa
 * del recordatorio del presentador.
 */
export interface NativeDisplayInput {
  readonly titulo: string;
  readonly cuerpo: string;
  /** Recuadro asociado (deep link / acción de silenciar), o `null`. */
  readonly recuadroId: string | null;
}

/**
 * Puerto del módulo nativo de notificaciones INYECTADO en el adaptador. Cada
 * método realiza la operación nativa real (permiso / token / display). Es la
 * única frontera de I/O de plataforma; lo implementa el wiring del cliente sobre
 * APNs/FCM (`@react-native-firebase/messaging`, `@notifee/react-native`, …) en
 * producción y un doble en pruebas, manteniendo este archivo sin `react-native`.
 */
export interface NativePushPort {
  /** Solicita al SO el permiso de notificaciones (Req 26.1, 26.5). */
  requestPermission(): Promise<EstadoPermisoPush>;
  /** Obtiene el Token_Push de APNs/FCM, o `null` si no se pudo emitir (Req 26.1). */
  getPushToken(): Promise<string | null>;
  /** Muestra la notificación en el sistema (Req 26.2, 26.3). */
  displayNotification(input: NativeDisplayInput): Promise<void>;
}

/**
 * Adaptador que implementa el contrato `NativeNotificationBridge` que consume el
 * `PushRegistrationPresenter`. Traduce cada método del bridge a la operación
 * nativa correspondiente delegando en el `NativePushPort` inyectado. Mantener
 * este adaptador detrás del puerto lo hace agnóstico de React Native y verificable.
 */
export class NativeNotificationBridgeAdapter
  implements NativeNotificationBridge
{
  /**
   * @param port Módulo nativo de notificaciones inyectado. En producción envuelve
   *   las APIs reales de APNs/FCM; en pruebas, un doble que registra las llamadas.
   */
  constructor(private readonly port: NativePushPort) {}

  /** Solicita el permiso de notificaciones vía el puerto nativo (Req 26.1, 26.5). */
  requestPermission(): Promise<EstadoPermisoPush> {
    return this.port.requestPermission();
  }

  /** Obtiene el Token_Push de APNs/FCM vía el puerto nativo (Req 26.1). */
  getPushToken(): Promise<string | null> {
    return this.port.getPushToken();
  }

  /** Muestra el recordatorio en el sistema vía el puerto nativo (Req 26.2, 26.3). */
  presentReminder(reminder: RenderedReminder): Promise<void> {
    return this.port.displayNotification({
      titulo: reminder.titulo,
      cuerpo: reminder.cuerpo,
      recuadroId: reminder.recuadroId,
    });
  }
}
