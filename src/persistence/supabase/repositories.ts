// Implementaciones de los repositorios por entidad sobre Supabase.
//
// Cada clase hereda el CRUD genérico de `SupabaseRepository` (con su mapper) e
// implementa los métodos de consulta de su interfaz según las relaciones del ER,
// usando `runMany`/`runMaybe` para mapear filas al dominio.

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
import { SupabaseRepository } from './base.js';
import type { TypedSupabaseClient } from './client.js';
import * as m from './mappers.js';

export class SupabaseUsuarioRepository
  extends SupabaseRepository<Usuario, 'usuarios'>
  implements UsuarioRepository
{
  constructor(client: TypedSupabaseClient) {
    super(client, m.usuarioMapper);
  }
  findByEmail(email: string): Promise<Usuario | null> {
    return this.runMaybe((q) => q.eq('email', email).maybeSingle());
  }
  findByClubId(clubId: UUID): Promise<Usuario[]> {
    return this.runMany((q) => q.eq('club_id', clubId));
  }
}

export class SupabaseRefreshTokenRepository
  extends SupabaseRepository<RefreshToken, 'refresh_tokens'>
  implements RefreshTokenRepository
{
  constructor(client: TypedSupabaseClient) {
    super(client, m.refreshTokenMapper);
  }
  findByUsuarioId(usuarioId: UUID): Promise<RefreshToken[]> {
    return this.runMany((q) => q.eq('usuario_id', usuarioId));
  }
  findByTokenHash(tokenHash: string): Promise<RefreshToken | null> {
    return this.runMaybe((q) => q.eq('token_hash', tokenHash).maybeSingle());
  }
  findByFamiliaId(familiaId: UUID): Promise<RefreshToken[]> {
    return this.runMany((q) => q.eq('familia_id', familiaId));
  }
}

export class SupabaseConfigAdminRepository
  extends SupabaseRepository<ConfigAdmin, 'config_admin'>
  implements ConfigAdminRepository
{
  constructor(client: TypedSupabaseClient) {
    super(client, m.configAdminMapper);
  }
  findByTemporadaId(temporadaId: UUID): Promise<ConfigAdmin | null> {
    return this.runMaybe((q) => q.eq('temporada_id', temporadaId).maybeSingle());
  }
}

export class SupabasePlantillaAlbumRepository
  extends SupabaseRepository<PlantillaAlbum, 'plantillas_album'>
  implements PlantillaAlbumRepository
{
  constructor(client: TypedSupabaseClient) {
    super(client, m.plantillaMapper);
  }
  findByClubId(clubId: UUID): Promise<PlantillaAlbum[]> {
    return this.runMany((q) => q.eq('club_id', clubId));
  }
}

export class SupabaseClubRepository
  extends SupabaseRepository<Club, 'clubs'>
  implements ClubRepository
{
  constructor(client: TypedSupabaseClient) {
    super(client, m.clubMapper);
  }
}

export class SupabaseRivalidadRepository
  extends SupabaseRepository<Rivalidad, 'rivalidades'>
  implements RivalidadRepository
{
  constructor(client: TypedSupabaseClient) {
    super(client, m.rivalidadMapper);
  }
  findByClubId(clubId: UUID): Promise<Rivalidad[]> {
    return this.runMany((q) => q.eq('club_id', clubId));
  }
}

export class SupabaseSuscripcionRepository
  extends SupabaseRepository<Suscripcion, 'suscripciones'>
  implements SuscripcionRepository
{
  constructor(client: TypedSupabaseClient) {
    super(client, m.suscripcionMapper);
  }
  findByUsuarioId(usuarioId: UUID): Promise<Suscripcion | null> {
    return this.runMaybe((q) => q.eq('usuario_id', usuarioId).maybeSingle());
  }
  findByRevenueCatId(revenueCatId: string): Promise<Suscripcion | null> {
    return this.runMaybe((q) => q.eq('revenue_cat_id', revenueCatId).maybeSingle());
  }
}

export class SupabaseTemporadaRepository
  extends SupabaseRepository<Temporada, 'temporadas'>
  implements TemporadaRepository
{
  constructor(client: TypedSupabaseClient) {
    super(client, m.temporadaMapper);
  }
  findByUsuarioId(usuarioId: UUID): Promise<Temporada[]> {
    return this.runMany((q) => q.eq('usuario_id', usuarioId));
  }
  findActivasByUsuarioId(usuarioId: UUID): Promise<Temporada[]> {
    return this.runMany((q) => q.eq('usuario_id', usuarioId).eq('estado', 'ACTIVA'));
  }
}

export class SupabasePartidoOficialRepository
  extends SupabaseRepository<PartidoOficial, 'partidos_oficiales'>
  implements PartidoOficialRepository
{
  constructor(client: TypedSupabaseClient) {
    super(client, m.partidoMapper);
  }
  findByTemporadaId(temporadaId: UUID): Promise<PartidoOficial[]> {
    return this.runMany((q) => q.eq('temporada_id', temporadaId));
  }
  findByPartidoExternoId(
    temporadaId: UUID,
    partidoExternoId: string,
  ): Promise<PartidoOficial | null> {
    return this.runMaybe((q) =>
      q.eq('temporada_id', temporadaId).eq('partido_externo_id', partidoExternoId).maybeSingle(),
    );
  }
}

export class SupabaseAlbumRepository
  extends SupabaseRepository<Album, 'albums'>
  implements AlbumRepository
{
  constructor(client: TypedSupabaseClient) {
    super(client, m.albumMapper);
  }
  findByTemporadaId(temporadaId: UUID): Promise<Album | null> {
    return this.runMaybe((q) => q.eq('temporada_id', temporadaId).maybeSingle());
  }
}

export class SupabaseRecuadroRepository
  extends SupabaseRepository<Recuadro, 'recuadros'>
  implements RecuadroRepository
{
  constructor(client: TypedSupabaseClient) {
    super(client, m.recuadroMapper);
  }
  findByAlbumId(albumId: UUID): Promise<Recuadro[]> {
    return this.runMany((q) => q.eq('album_id', albumId));
  }
  findByPartidoOficialId(partidoOficialId: UUID): Promise<Recuadro | null> {
    return this.runMaybe((q) => q.eq('partido_oficial_id', partidoOficialId).maybeSingle());
  }
  findSinFotoPrincipalByAlbumId(albumId: UUID): Promise<Recuadro[]> {
    return this.runMany((q) => q.eq('album_id', albumId).is('foto_principal_id', null));
  }
  findConFotoPrincipalByAlbumId(albumId: UUID): Promise<Recuadro[]> {
    return this.runMany((q) => q.eq('album_id', albumId).not('foto_principal_id', 'is', null));
  }
}

export class SupabaseMomentoRepository
  extends SupabaseRepository<Momento, 'momentos'>
  implements MomentoRepository
{
  constructor(client: TypedSupabaseClient) {
    super(client, m.momentoMapper);
  }
  findByPartidoOficialId(partidoOficialId: UUID): Promise<Momento | null> {
    return this.runMaybe((q) => q.eq('partido_oficial_id', partidoOficialId).maybeSingle());
  }
}

export class SupabaseFotoRepository
  extends SupabaseRepository<Foto, 'fotos'>
  implements FotoRepository
{
  constructor(client: TypedSupabaseClient) {
    super(client, m.fotoMapper);
  }
  findByMomentoId(momentoId: UUID): Promise<Foto[]> {
    return this.runMany((q) => q.eq('momento_id', momentoId));
  }
  findPendientesAsociacion(): Promise<Foto[]> {
    return this.runMany((q) => q.eq('estado_asociacion', 'PENDIENTE_ASOCIACION'));
  }
}

export class SupabaseDireccionEnvioRepository
  extends SupabaseRepository<DireccionEnvio, 'direcciones_envio'>
  implements DireccionEnvioRepository
{
  constructor(client: TypedSupabaseClient) {
    super(client, m.direccionMapper);
  }
  findByUsuarioId(usuarioId: UUID): Promise<DireccionEnvio | null> {
    return this.runMaybe((q) => q.eq('usuario_id', usuarioId).maybeSingle());
  }
}

export class SupabasePedidoRepository
  extends SupabaseRepository<Pedido, 'pedidos'>
  implements PedidoRepository
{
  constructor(client: TypedSupabaseClient) {
    super(client, m.pedidoMapper);
  }
  findByTemporadaId(temporadaId: UUID): Promise<Pedido | null> {
    return this.runMaybe((q) => q.eq('temporada_id', temporadaId).maybeSingle());
  }
}
