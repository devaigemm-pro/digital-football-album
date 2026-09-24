// Cierre anticipado de la Temporada (cliente) — flujo de cierre confirmado del
// lado de la app.
//
// Task 30.4 — Requirements: 10.1, 10.2, 10.3, 10.4
// (SRS Req 16 — cierre de Temporada: confirmación opcional de fotos listas
//  (16.1), informe de Recuadros sin Foto_Principal antes del cierre (16.2),
//  cierre anticipado confirmado con disparo de impresión (16.4) y Recuadros
//  vacíos mantenidos en la impresión (16.5)).
//
// Punto de entrada de la capa de lógica pura (framework-agnóstica). La pantalla
// `CierreTemporadaScreen.tsx` importa desde aquí. El adaptador HTTP de producción
// implementa `SeasonCloseClient` (reutiliza `GET /album/{temporadaId}/preview`
// para los Recuadros faltantes y solicita el cierre anticipado al backend).
export {
  EarlyClosePresenter,
  FALTANTES_ERROR_DEFAULT,
  CIERRE_ERROR_DEFAULT,
} from './early-close-presenter';
export type {
  SeasonCloseClient,
  RecuadroFaltante,
  RecuadrosFaltantesData,
  TemporadaCierreData,
  RequestEarlyCloseParams,
  EarlyCloseResult,
  EarlyCloseState,
  EarlyCloseStateListener,
  FaltantesStatus,
  CierreStatus,
} from './early-close-presenter';
