// Cierre de Temporada y disparo del Print_Engine (Req 16.1–16.5).
//
// Barrel del servicio que cierra la Temporada (automáticamente al alcanzar la
// Fecha_Límite_Cierre o de forma anticipada confirmada por el usuario) y
// dispara la generación de los archivos de impresión mediante el Print_Engine
// (Task 16.2 — Requirements: 16.1, 16.2, 16.3, 16.4, 16.5).

export {
  TemporadaClosingService,
  TemporadaNoEncontradaError,
  TemporadaNoActivaError,
  FechaLimiteNoAlcanzadaError,
} from './temporada-closing-service.js';
export type {
  PrintEngineTrigger,
  PrintEngineTriggerInput,
  MotivoCierre,
  CierreResultado,
  TemporadaClosingServiceDeps,
} from './temporada-closing-service.js';
