// Factoría de un conjunto completo de repositorios en memoria (Unit of Work).
//
// Facilita el arranque de pruebas de dominio puro y de servicios: una sola
// llamada devuelve todos los repositorios listos para inyectar, sin PostgreSQL.
//
// Task 2.3 — Requirements: 5.4, 7.2, 8.2

import type { Repositories } from '../unit-of-work.js';
import {
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

/**
 * Crea un `Repositories` respaldado por implementaciones en memoria. Cada
 * repositorio arranca vacío; sembrar datos mediante `create` o los constructores
 * concretos si se requiere estado inicial.
 */
export function createInMemoryRepositories(): Repositories {
  return {
    usuarios: new InMemoryUsuarioRepository(),
    refreshTokens: new InMemoryRefreshTokenRepository(),
    configAdmin: new InMemoryConfigAdminRepository(),
    plantillas: new InMemoryPlantillaAlbumRepository(),
    clubes: new InMemoryClubRepository(),
    rivalidades: new InMemoryRivalidadRepository(),
    suscripciones: new InMemorySuscripcionRepository(),
    temporadas: new InMemoryTemporadaRepository(),
    partidos: new InMemoryPartidoOficialRepository(),
    albumes: new InMemoryAlbumRepository(),
    recuadros: new InMemoryRecuadroRepository(),
    momentos: new InMemoryMomentoRepository(),
    fotos: new InMemoryFotoRepository(),
    direcciones: new InMemoryDireccionEnvioRepository(),
    pedidos: new InMemoryPedidoRepository(),
  };
}
