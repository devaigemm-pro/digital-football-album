// Servicio_Notificaciones anclado a hora local (Req 14, 15.3).
//
// Barrel del módulo de notificaciones push basadas en estado y ancladas a la
// zona horaria del usuario:
//   - Task 18.1 (Req 14.1–14.4): recordatorios recurrentes de Recuadro vacío
//     (inicial + reenvío ~24h a la hora de envío local) con condiciones de paro
//     (Foto_Principal asignada / silenciado o descartado).
//   - Task 18.2 (Req 14.6, 15.3): recordatorios de cierre escalonados
//     (30/15/7/1 día en hora local) y aviso de Dirección_Envío válida faltante.

export {
  NotificationService,
  InMemoryRecordatorioTracker,
  systemClock,
} from './notification-service.js';
export type {
  NotificationServiceDeps,
  Clock,
  RecordatorioTracker,
} from './notification-service.js';

export type { PushNotifier, NotificacionPush, TipoNotificacion } from './push-notifier.js';

export {
  decidirRecordatorioRecuadro,
  decidirRecordatorioCierre,
  HORA_ENVIO_POR_DEFECTO,
  OFFSETS_CIERRE_DIAS,
  DIAS_APROXIMACION_CIERRE,
} from './reminder-rules.js';
export type {
  DecisionRecuadro,
  DecisionCierre,
  EstadoRecuadroRecordatorio,
} from './reminder-rules.js';

export {
  toLocalParts,
  civilDayNumber,
  localCivilDayNumber,
  localDaysUntil,
  isWithinSendHour,
} from './local-time.js';
export type { LocalDateTimeParts } from './local-time.js';
