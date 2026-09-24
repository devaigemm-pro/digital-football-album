// Agregado de repositorios (Unit of Work).
//
// Reúne un repositorio por entidad en una sola interfaz para inyectar la capa
// de persistencia completa en los servicios de dominio y mockearla de una vez
// en pruebas. Los futuros drivers de PostgreSQL y los test doubles en memoria
// implementan esta misma forma.
//
// Task 2.3 — Requirements: 5.4, 7.2, 8.2

import type {
  AlbumRepository,
  ClubRepository,
  ConfigAdminRepository,
  DireccionEnvioRepository,
  FotoRepository,
  MomentoRepository,
  PartidoOficialRepository,
  PedidoRepository,
  PlantillaAlbumRepository,
  RecuadroRepository,
  RefreshTokenRepository,
  RivalidadRepository,
  SuscripcionRepository,
  TemporadaRepository,
  UsuarioRepository,
} from './repositories.js';

/** Conjunto de repositorios tipados que compone la capa de persistencia. */
export interface Repositories {
  usuarios: UsuarioRepository;
  refreshTokens: RefreshTokenRepository;
  configAdmin: ConfigAdminRepository;
  plantillas: PlantillaAlbumRepository;
  clubes: ClubRepository;
  rivalidades: RivalidadRepository;
  suscripciones: SuscripcionRepository;
  temporadas: TemporadaRepository;
  partidos: PartidoOficialRepository;
  albumes: AlbumRepository;
  recuadros: RecuadroRepository;
  momentos: MomentoRepository;
  fotos: FotoRepository;
  direcciones: DireccionEnvioRepository;
  pedidos: PedidoRepository;
}
