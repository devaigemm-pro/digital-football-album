// Interfaces de repositorio tipadas por entidad del dominio.
//
// Cada interfaz extiende el contrato CRUD genérico `Repository<T>` y añade los
// métodos de consulta que implican las relaciones del diagrama ER (design.md).
// Los servicios de dominio dependen de estas interfaces, no de una
// implementación concreta, para poder mockearlas en pruebas de dominio puro.
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
} from '../domain/types.js';
import type { Repository } from './repository.js';

/** Usuario: raíz de la mayoría de las relaciones (Req 1, 2). */
export interface UsuarioRepository extends Repository<Usuario> {
  /** Usuario por correo (login/registro por email — Req 1.2, 1.4). */
  findByEmail(email: string): Promise<Usuario | null>;
  /** Usuarios que seleccionaron un Club dado (Req 2). */
  findByClubId(clubId: UUID): Promise<Usuario[]>;
}

/** Refresh_Token: sesión por tokens con rotación por familia (Req 1, 20). */
export interface RefreshTokenRepository extends Repository<RefreshToken> {
  /** Tokens de un usuario (para revocación en logout/borrado — Req 1.4, 20). */
  findByUsuarioId(usuarioId: UUID): Promise<RefreshToken[]>;
  /** Token por su hash (validación de refresh — Req 1). */
  findByTokenHash(tokenHash: string): Promise<RefreshToken | null>;
  /** Todos los tokens de una familia de rotación (invalidación ante robo — Req 1). */
  findByFamiliaId(familiaId: UUID): Promise<RefreshToken[]>;
}

/** Config_Admin: fecha límite de cierre por Temporada/liga (Req 14.5, 16). */
export interface ConfigAdminRepository extends Repository<ConfigAdmin> {
  /** Configuración administrativa de una Temporada (Req 16). */
  findByTemporadaId(temporadaId: UUID): Promise<ConfigAdmin | null>;
}

/** Plantilla_Album: dimensiones físicas del Recuadro por Club (Req 19.1). */
export interface PlantillaAlbumRepository extends Repository<PlantillaAlbum> {
  /** Plantillas definidas por un Club (Req 19.1). */
  findByClubId(clubId: UUID): Promise<PlantillaAlbum[]>;
}

/** Club: identidad visual seleccionable por el usuario (Req 2). */
export type ClubRepository = Repository<Club>;

/** Rivalidad: lista de rivalidades por Club para clasificar Clásicos (Req 10.2). */
export interface RivalidadRepository extends Repository<Rivalidad> {
  /** Rivalidades definidas por un Club (Req 10.2). */
  findByClubId(clubId: UUID): Promise<Rivalidad[]>;
}

/** Suscripción: plan y estado del usuario (Req 3). */
export interface SuscripcionRepository extends Repository<Suscripcion> {
  /** Suscripción de un usuario (gating por plan — Req 3.6, 3.7). */
  findByUsuarioId(usuarioId: UUID): Promise<Suscripcion | null>;
  /** Suscripción por identificador de RevenueCat (webhooks — Req 3.3, 3.5). */
  findByRevenueCatId(revenueCatId: string): Promise<Suscripcion | null>;
}

/** Temporada: ciclo de vida del álbum del usuario (Req 4, 16). */
export interface TemporadaRepository extends Repository<Temporada> {
  /** Temporadas de un usuario (Req 4). */
  findByUsuarioId(usuarioId: UUID): Promise<Temporada[]>;
  /**
   * Temporadas de un usuario en estado ACTIVA. Base de la regla de bloqueo de
   * cambio de Club con Temporada activa (Req 2.3).
   */
  findActivasByUsuarioId(usuarioId: UUID): Promise<Temporada[]>;
}

/** Partido_Oficial: derivado del fixture; 1:1 con Recuadro (Req 4, 9). */
export interface PartidoOficialRepository extends Repository<PartidoOficial> {
  /** Partidos de una Temporada (derivación/re-derivación del álbum — Req 4.1, 4.4). */
  findByTemporadaId(temporadaId: UUID): Promise<PartidoOficial[]>;
  /**
   * Partido por su identificador externo dentro de una Temporada. Soporta el
   * enlace único foto↔partido y la re-derivación idempotente (Req 4.4, 9.4).
   */
  findByPartidoExternoId(
    temporadaId: UUID,
    partidoExternoId: string,
  ): Promise<PartidoOficial | null>;
}

/** Album: un álbum por Temporada; agrupa los Recuadros (Req 4). */
export interface AlbumRepository extends Repository<Album> {
  /** Álbum de una Temporada (Req 4). */
  findByTemporadaId(temporadaId: UUID): Promise<Album | null>;
}

/** Recuadro: 1:1 con Partido_Oficial; clave de la biunivocidad con el sticker (Req 4, 5, 17, 18). */
export interface RecuadroRepository extends Repository<Recuadro> {
  /** Recuadros de un Álbum (previsualización e impresión — Req 11, 17). */
  findByAlbumId(albumId: UUID): Promise<Recuadro[]>;
  /** Recuadro del Partido_Oficial dado (biyección Partido↔Recuadro — Req 4.1). */
  findByPartidoOficialId(partidoOficialId: UUID): Promise<Recuadro | null>;
  /** Recuadros del Álbum sin Foto_Principal (recordatorios / vacíos — Req 11.3, 14). */
  findSinFotoPrincipalByAlbumId(albumId: UUID): Promise<Recuadro[]>;
  /** Recuadros del Álbum con Foto_Principal (candidatos a sticker — Req 18.1). */
  findConFotoPrincipalByAlbumId(albumId: UUID): Promise<Recuadro[]>;
}

/** Momento: 1:1 con Partido_Oficial; agrupa las fotos (Req 5, 6, 7, 8). */
export interface MomentoRepository extends Repository<Momento> {
  /** Momento del Partido_Oficial dado (agrupación de fotos — Req 5.4). */
  findByPartidoOficialId(partidoOficialId: UUID): Promise<Momento | null>;
}

/** Foto: agrupada en el Momento; solo la Foto_Principal se imprime (Req 5, 9). */
export interface FotoRepository extends Repository<Foto> {
  /**
   * Fotos agrupadas en un Momento. Base de la agrupación de todas las fotos
   * cargadas en el Momento del partido (Req 5.3, 5.4).
   */
  findByMomentoId(momentoId: UUID): Promise<Foto[]>;
  /** Fotos pendientes de asociación a un partido (Req 9.5). */
  findPendientesAsociacion(): Promise<Foto[]>;
}

/** Dirección_Envío: destino del kit físico, validada antes del cierre (Req 15). */
export interface DireccionEnvioRepository extends Repository<DireccionEnvio> {
  /** Dirección de envío de un usuario (Req 15.1). */
  findByUsuarioId(usuarioId: UUID): Promise<DireccionEnvio | null>;
}

/** Pedido: kit físico tras el cierre; conserva mínimo fiscal (Req 15, 18, 20). */
export interface PedidoRepository extends Repository<Pedido> {
  /** Pedido asociado a una Temporada (estado/tracking — Req 15.4). */
  findByTemporadaId(temporadaId: UUID): Promise<Pedido | null>;
}
