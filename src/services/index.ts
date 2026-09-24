// Capa de servicios: lógica de negocio (Autenticación, Suscripción, Momentos,
// Datos Deportivos, Clasificador, Álbum, Cards, Notificaciones, Envío, Print Engine).

// Servicio_Autenticación (Task 3.1 — Req 1.1, 1.2, 1.3, 1.4).
export * from './auth/index.js';

// Clasificador de Partidos (Task 9.1 — Req 10.1, 10.2, 10.3, 10.4).
export * from './classifier/index.js';

// Servicio_Suscripción (Task 6.1 — Req 3.1, 3.2, 3.3, 3.4).
export * from './subscription/index.js';

// Generador_Cards (Task 13.1 — Req 12.1, 12.2, 12.3, 12.4).
export * from './cards/index.js';

// Configuración administrativa (Config_Admin) (Task 16.1 — Req 14.5, 16).
export * from './admin/index.js';

// Motor_Momentos (Task 11.1 — Req 5.1, 5.2, 5.3, 5.4).
// Se reexporta bajo un espacio de nombres (`momentos`) para evitar colisiones de
// nombres compartidos con otros módulos (p. ej. `ObjectStorage`, `IdGenerator`).
export * as momentos from './momentos/index.js';

// Cierre de Temporada y disparo del Print_Engine (Task 16.2 — Req 16.1–16.5).
// Se reexporta bajo un espacio de nombres (`closing`) para evitar la colisión
// del error compartido `TemporadaNoEncontradaError` con `./admin/index.js`.
export * as closing from './closing/index.js';

// Servicio_Notificaciones anclado a hora local (Task 18.1/18.2 — Req 14, 15.3).
// Se reexporta bajo un espacio de nombres (`notifications`) para evitar
// colisiones de nombres compartidos (p. ej. `Clock`) con otros módulos.
export * as notifications from './notifications/index.js';

// Motor_Album — previsualización del álbum coleccionable (Task 12.1 — Req 11.1,
// 11.2, 11.3). Se reexporta bajo un espacio de nombres (`album`) para evitar
// colisiones de nombres compartidos con otros módulos.
export * as album from './album/index.js';

// Seguridad y privacidad transversales (Task 20.1 — Req 5.8, 6.2, 6.3, 20.2, 20.3, 20.4).
// Se reexporta bajo un espacio de nombres (`security`) para evitar colisiones de
// nombres compartidos (p. ej. errores/config) con otros módulos de servicios.
export * as security from './security/index.js';

// Servicio_Envío: dirección de envío, pedido y tracking (Task 19.1 — Req 15.1, 15.2, 15.4).
// Se reexporta bajo un espacio de nombres (`shipping`) para evitar la colisión
// del error compartido `TemporadaNoEncontradaError` (también en `./closing`) y
// del tipo `IdGenerator` con otros módulos.
export * as shipping from './shipping/index.js';

// Print_Engine (Task 15.1–15.5 — Req 16.5, 17, 18, 19.1).
// Se reexporta bajo un espacio de nombres (`printEngine`) para evitar colisiones
// de nombres compartidos (p. ej. `Clock`, errores de dominio) con otros módulos.
export * as printEngine from './print-engine/index.js';
