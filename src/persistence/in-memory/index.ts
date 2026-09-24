// Barrel de las implementaciones en memoria (test doubles) de la persistencia.
//
// Task 2.3 — Requirements: 5.4, 7.2, 8.2

export { InMemoryRepository } from './base.js';
export {
  InMemoryAlbumRepository,
  InMemoryClubRepository,
  InMemoryConfigAdminRepository,
  InMemoryDireccionEnvioRepository,
  InMemoryFotoRepository,
  InMemoryMomentoRepository,
  InMemoryPartidoOficialRepository,
  InMemoryPedidoRepository,
  InMemoryPlantillaAlbumRepository,
  InMemoryRecuadroRepository,
  InMemoryRefreshTokenRepository,
  InMemoryRivalidadRepository,
  InMemorySuscripcionRepository,
  InMemoryTemporadaRepository,
  InMemoryUsuarioRepository,
} from './repositories.js';
export { createInMemoryRepositories } from './factory.js';
