// Implementaciones en memoria de los repositorios por entidad.
//
// Son test doubles utilizables como sustitutos de los futuros drivers de
// PostgreSQL en pruebas de dominio puro (sin base de datos viva). Cada clase
// hereda el CRUD genérico de `InMemoryRepository` e implementa los métodos de
// consulta de su interfaz según las relaciones del ER.
//
// Task 2.3 — Requirements: 5.4, 7.2, 8.2

import type {
  Album,
  Club,
  ConfigAdmin,
  DireccionEnvio,
  Foto,
  Momento,
  PartidoOficial,
  Pedido,
  PlantillaAlbum,
  Recuadro,
  RefreshToken,
  Rivalidad,
  Suscripcion,
  Temporada,
  Usuario,
  UUID,
} from '../../domain/types.js';
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
} from '../repositories.js';
import { InMemoryRepository } from './base.js';

export class InMemoryUsuarioRepository
  extends InMemoryRepository<Usuario>
  implements UsuarioRepository
{
  constructor(seed: readonly Usuario[] = []) {
    super('Usuario', seed);
  }

  findByEmail(email: string): Promise<Usuario | null> {
    return Promise.resolve(this.findOne((u) => u.email === email));
  }

  findByClubId(clubId: UUID): Promise<Usuario[]> {
    return Promise.resolve(this.filter((u) => u.clubId === clubId));
  }
}

export class InMemoryRefreshTokenRepository
  extends InMemoryRepository<RefreshToken>
  implements RefreshTokenRepository
{
  constructor(seed: readonly RefreshToken[] = []) {
    super('RefreshToken', seed);
  }

  findByUsuarioId(usuarioId: UUID): Promise<RefreshToken[]> {
    return Promise.resolve(this.filter((t) => t.usuarioId === usuarioId));
  }

  findByTokenHash(tokenHash: string): Promise<RefreshToken | null> {
    return Promise.resolve(this.findOne((t) => t.tokenHash === tokenHash));
  }

  findByFamiliaId(familiaId: UUID): Promise<RefreshToken[]> {
    return Promise.resolve(this.filter((t) => t.familiaId === familiaId));
  }
}

export class InMemoryConfigAdminRepository
  extends InMemoryRepository<ConfigAdmin>
  implements ConfigAdminRepository
{
  constructor(seed: readonly ConfigAdmin[] = []) {
    super('ConfigAdmin', seed);
  }

  findByTemporadaId(temporadaId: UUID): Promise<ConfigAdmin | null> {
    return Promise.resolve(this.findOne((c) => c.temporadaId === temporadaId));
  }
}

export class InMemoryPlantillaAlbumRepository
  extends InMemoryRepository<PlantillaAlbum>
  implements PlantillaAlbumRepository
{
  constructor(seed: readonly PlantillaAlbum[] = []) {
    super('PlantillaAlbum', seed);
  }

  findByClubId(clubId: UUID): Promise<PlantillaAlbum[]> {
    return Promise.resolve(this.filter((p) => p.clubId === clubId));
  }
}

export class InMemoryClubRepository extends InMemoryRepository<Club> implements ClubRepository {
  constructor(seed: readonly Club[] = []) {
    super('Club', seed);
  }
}

export class InMemoryRivalidadRepository
  extends InMemoryRepository<Rivalidad>
  implements RivalidadRepository
{
  constructor(seed: readonly Rivalidad[] = []) {
    super('Rivalidad', seed);
  }

  findByClubId(clubId: UUID): Promise<Rivalidad[]> {
    return Promise.resolve(this.filter((r) => r.clubId === clubId));
  }
}

export class InMemorySuscripcionRepository
  extends InMemoryRepository<Suscripcion>
  implements SuscripcionRepository
{
  constructor(seed: readonly Suscripcion[] = []) {
    super('Suscripcion', seed);
  }

  findByUsuarioId(usuarioId: UUID): Promise<Suscripcion | null> {
    return Promise.resolve(this.findOne((s) => s.usuarioId === usuarioId));
  }

  findByRevenueCatId(revenueCatId: string): Promise<Suscripcion | null> {
    return Promise.resolve(this.findOne((s) => s.revenueCatId === revenueCatId));
  }
}

export class InMemoryTemporadaRepository
  extends InMemoryRepository<Temporada>
  implements TemporadaRepository
{
  constructor(seed: readonly Temporada[] = []) {
    super('Temporada', seed);
  }

  findByUsuarioId(usuarioId: UUID): Promise<Temporada[]> {
    return Promise.resolve(this.filter((t) => t.usuarioId === usuarioId));
  }

  findActivasByUsuarioId(usuarioId: UUID): Promise<Temporada[]> {
    return Promise.resolve(this.filter((t) => t.usuarioId === usuarioId && t.estado === 'ACTIVA'));
  }
}

export class InMemoryPartidoOficialRepository
  extends InMemoryRepository<PartidoOficial>
  implements PartidoOficialRepository
{
  constructor(seed: readonly PartidoOficial[] = []) {
    super('PartidoOficial', seed);
  }

  findByTemporadaId(temporadaId: UUID): Promise<PartidoOficial[]> {
    return Promise.resolve(this.filter((p) => p.temporadaId === temporadaId));
  }

  findByPartidoExternoId(
    temporadaId: UUID,
    partidoExternoId: string,
  ): Promise<PartidoOficial | null> {
    return Promise.resolve(
      this.findOne((p) => p.temporadaId === temporadaId && p.partidoExternoId === partidoExternoId),
    );
  }
}

export class InMemoryAlbumRepository extends InMemoryRepository<Album> implements AlbumRepository {
  constructor(seed: readonly Album[] = []) {
    super('Album', seed);
  }

  findByTemporadaId(temporadaId: UUID): Promise<Album | null> {
    return Promise.resolve(this.findOne((a) => a.temporadaId === temporadaId));
  }
}

export class InMemoryRecuadroRepository
  extends InMemoryRepository<Recuadro>
  implements RecuadroRepository
{
  constructor(seed: readonly Recuadro[] = []) {
    super('Recuadro', seed);
  }

  findByAlbumId(albumId: UUID): Promise<Recuadro[]> {
    return Promise.resolve(this.filter((r) => r.albumId === albumId));
  }

  findByPartidoOficialId(partidoOficialId: UUID): Promise<Recuadro | null> {
    return Promise.resolve(this.findOne((r) => r.partidoOficialId === partidoOficialId));
  }

  findSinFotoPrincipalByAlbumId(albumId: UUID): Promise<Recuadro[]> {
    return Promise.resolve(this.filter((r) => r.albumId === albumId && r.fotoPrincipalId === null));
  }

  findConFotoPrincipalByAlbumId(albumId: UUID): Promise<Recuadro[]> {
    return Promise.resolve(this.filter((r) => r.albumId === albumId && r.fotoPrincipalId !== null));
  }
}

export class InMemoryMomentoRepository
  extends InMemoryRepository<Momento>
  implements MomentoRepository
{
  constructor(seed: readonly Momento[] = []) {
    super('Momento', seed);
  }

  findByPartidoOficialId(partidoOficialId: UUID): Promise<Momento | null> {
    return Promise.resolve(this.findOne((m) => m.partidoOficialId === partidoOficialId));
  }
}

export class InMemoryFotoRepository extends InMemoryRepository<Foto> implements FotoRepository {
  constructor(seed: readonly Foto[] = []) {
    super('Foto', seed);
  }

  findByMomentoId(momentoId: UUID): Promise<Foto[]> {
    return Promise.resolve(this.filter((f) => f.momentoId === momentoId));
  }

  findPendientesAsociacion(): Promise<Foto[]> {
    return Promise.resolve(this.filter((f) => f.estadoAsociacion === 'PENDIENTE_ASOCIACION'));
  }
}

export class InMemoryDireccionEnvioRepository
  extends InMemoryRepository<DireccionEnvio>
  implements DireccionEnvioRepository
{
  constructor(seed: readonly DireccionEnvio[] = []) {
    super('DireccionEnvio', seed);
  }

  findByUsuarioId(usuarioId: UUID): Promise<DireccionEnvio | null> {
    return Promise.resolve(this.findOne((d) => d.usuarioId === usuarioId));
  }
}

export class InMemoryPedidoRepository
  extends InMemoryRepository<Pedido>
  implements PedidoRepository
{
  constructor(seed: readonly Pedido[] = []) {
    super('Pedido', seed);
  }

  findByTemporadaId(temporadaId: UUID): Promise<Pedido | null> {
    return Promise.resolve(this.findOne((p) => p.temporadaId === temporadaId));
  }
}
