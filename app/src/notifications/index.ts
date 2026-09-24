// Notificaciones push (cliente) — registro del Token_Push y renderizado de
// recordatorios del lado de la app.
//
// Task 30.3 — Requirements: 26.1, 26.2, 26.3, 26.4, 26.5
// (design.md · "Permisos, IAP, Push y Compartición (Req 24, 25, 26, 6/13)" →
//  "Push (Req 26): registro del Token_Push (APNs/FCM) en el backend y renderizado
//  de los recordatorios recibidos").
//
// Punto de entrada de la capa de lógica pura (framework-agnóstica). La pantalla
// `NotificacionesScreen.tsx` importa desde aquí. En producción se inyectan:
//   - un `NativeNotificationBridge` (vía `NativeNotificationBridgeAdapter` sobre
//     un `NativePushPort` de APNs/FCM), y
//   - un `PushRegistrationClient` (adaptador HTTP sobre `HttpClient`/
//     `SessionHttpClient`: `POST /notificaciones/token`,
//     `POST /notificaciones/recuadros/{id}/silenciar`).
export {
  PushRegistrationPresenter,
  renderNotification,
  RECUADRO_VACIO_TITULO,
  CIERRE_ESCALONADO_TITULO,
  REGISTRO_ERROR_DEFAULT,
  SILENCIAR_ERROR_DEFAULT,
  type NativeNotificationBridge,
  type PushRegistrationClient,
  type PushRegistrationConfig,
  type RegisterPushTokenInput,
  type PushPlatform,
  type EstadoPermisoPush,
  type PushNotification,
  type PushNotificationType,
  type RecuadroVacioNotification,
  type CierreEscalonadoNotification,
  type RenderedReminder,
  type PushRegistrationState,
  type PushRegistrationStateListener,
  type RegistroPushStatus,
} from './push-registration-presenter';

export {
  NativeNotificationBridgeAdapter,
  type NativePushPort,
  type NativeDisplayInput,
} from './native-notification-bridge-adapter';
