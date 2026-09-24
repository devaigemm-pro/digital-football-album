// Servicio de Personalización / Selección de Club (Req 2).
//
// Barrel del servicio de selección y cambio de Club con la regla de bloqueo por
// Temporada ACTIVA (Task 7.1 — Requirements: 2.1, 2.2, 2.3).

export {
  ClubService,
  TemporadaActivaConflictError,
  UsuarioNoEncontradoError,
  ClubNoEncontradoError,
} from './club-service.js';
export type { IdentidadVisual, AsignarClubResultado } from './club-service.js';
