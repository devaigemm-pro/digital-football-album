// Configuración administrativa (Config_Admin) (Req 14.5, 16).
//
// Barrel del servicio que fija la Fecha_Límite_Cierre por Temporada/liga y
// sincroniza `Temporada.fechaLimiteCierre` con el valor administrativo
// (Task 16.1 — Requirements: 14.5, 16 (config admin)).

export {
  ConfigAdminService,
  TemporadaNoEncontradaError,
  FechaLimiteInvalidaError,
} from './config-admin-service.js';
export type {
  ConfigAdminServiceDeps,
  SetFechaLimiteCierreResultado,
} from './config-admin-service.js';
