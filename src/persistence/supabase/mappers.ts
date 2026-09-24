// Mapeo entre filas de la base (snake_case) y entidades del dominio (camelCase).
//
// El dominio (src/domain/types.ts) usa camelCase y objetos tipados para los
// campos JSON; el esquema de Postgres usa snake_case y `jsonb`. Estos mappers
// son funciones puras que traducen en ambos sentidos, aislando al resto del
// driver de la forma física de las tablas.
//
// Cada mapper expone:
//   - `fromRow`: fila de la DB -> entidad de dominio.
//   - `toRow`:   entidad de dominio (o parche) -> objeto de columnas para la DB.
// `toRow` acepta parciales para servir tanto a `create` como a `update`.

import type {
  ActivosVisuales,
  Album,
  CamposDireccion,
  Club,
  ConfigAdmin,
  DatosFiscalesMinimos,
  DireccionEnvio,
  EventoPartido,
  Foto,
  JugadorAlineacion,
  Momento,
  PaletaColores,
  PartidoOficial,
  Pedido,
  PlantillaAlbum,
  Recuadro,
  RefreshToken,
  ResultadoPartido,
  Rivalidad,
  Suscripcion,
  Temporada,
  Usuario,
} from '../../domain/types.js';
import type { Database } from '../../types/database.js';

type Tables = Database['public']['Tables'];
type Row<K extends keyof Tables> = Tables[K]['Row'];

/** Descriptor de mapeo para una entidad de dominio `T` sobre la tabla `K`. */
export interface EntityMapper<T, K extends keyof Tables> {
  /** Nombre de la tabla en Postgres. */
  readonly table: K;
  /** Nombre de la entidad (para mensajes de error). */
  readonly entityName: string;
  /** Fila de la DB -> entidad de dominio. */
  fromRow(row: Row<K>): T;
  /** Entidad o parche de dominio -> columnas de la DB (solo campos presentes). */
  toRow(patch: Partial<T>): Record<string, unknown>;
}

// Helpers para omitir claves ausentes en `toRow` (respetar parches parciales).
function set(out: Record<string, unknown>, column: string, value: unknown): void {
  if (value !== undefined) out[column] = value;
}

// ---------------------------------------------------------------------------
// Club
// ---------------------------------------------------------------------------
export const clubMapper: EntityMapper<Club, 'clubs'> = {
  table: 'clubs',
  entityName: 'Club',
  fromRow: (r) => ({
    id: r.id,
    nombre: r.nombre,
    paletaColores: r.paleta_colores as unknown as PaletaColores,
    escudoUrl: r.escudo_url,
    activosVisuales: r.activos_visuales as unknown as ActivosVisuales,
  }),
  toRow: (p) => {
    const out: Record<string, unknown> = {};
    set(out, 'id', p.id);
    set(out, 'nombre', p.nombre);
    set(out, 'paleta_colores', p.paletaColores);
    set(out, 'escudo_url', p.escudoUrl);
    set(out, 'activos_visuales', p.activosVisuales);
    return out;
  },
};

// ---------------------------------------------------------------------------
// Rivalidad
// ---------------------------------------------------------------------------
export const rivalidadMapper: EntityMapper<Rivalidad, 'rivalidades'> = {
  table: 'rivalidades',
  entityName: 'Rivalidad',
  fromRow: (r) => ({ id: r.id, clubId: r.club_id, rivalNombre: r.rival_nombre }),
  toRow: (p) => {
    const out: Record<string, unknown> = {};
    set(out, 'id', p.id);
    set(out, 'club_id', p.clubId);
    set(out, 'rival_nombre', p.rivalNombre);
    return out;
  },
};

// ---------------------------------------------------------------------------
// PlantillaAlbum
// ---------------------------------------------------------------------------
export const plantillaMapper: EntityMapper<PlantillaAlbum, 'plantillas_album'> = {
  table: 'plantillas_album',
  entityName: 'PlantillaAlbum',
  fromRow: (r) => ({
    id: r.id,
    clubId: r.club_id,
    recuadroAnchoMm: Number(r.recuadro_ancho_mm),
    recuadroAltoMm: Number(r.recuadro_alto_mm),
  }),
  toRow: (p) => {
    const out: Record<string, unknown> = {};
    set(out, 'id', p.id);
    set(out, 'club_id', p.clubId);
    set(out, 'recuadro_ancho_mm', p.recuadroAnchoMm);
    set(out, 'recuadro_alto_mm', p.recuadroAltoMm);
    return out;
  },
};

// ---------------------------------------------------------------------------
// Usuario
// ---------------------------------------------------------------------------
export const usuarioMapper: EntityMapper<Usuario, 'usuarios'> = {
  table: 'usuarios',
  entityName: 'Usuario',
  fromRow: (r) => ({
    id: r.id,
    proveedorAuth: r.proveedor_auth,
    email: r.email,
    clubId: r.club_id,
    zonaHoraria: r.zona_horaria,
  }),
  toRow: (p) => {
    const out: Record<string, unknown> = {};
    set(out, 'id', p.id);
    set(out, 'proveedor_auth', p.proveedorAuth);
    set(out, 'email', p.email);
    set(out, 'club_id', p.clubId);
    set(out, 'zona_horaria', p.zonaHoraria);
    return out;
  },
};

// ---------------------------------------------------------------------------
// RefreshToken
// ---------------------------------------------------------------------------
export const refreshTokenMapper: EntityMapper<RefreshToken, 'refresh_tokens'> = {
  table: 'refresh_tokens',
  entityName: 'RefreshToken',
  fromRow: (r) => ({
    id: r.id,
    usuarioId: r.usuario_id,
    tokenHash: r.token_hash,
    familiaId: r.familia_id,
    expiraEn: r.expira_en,
    rotado: r.rotado,
    revocado: r.revocado,
  }),
  toRow: (p) => {
    const out: Record<string, unknown> = {};
    set(out, 'id', p.id);
    set(out, 'usuario_id', p.usuarioId);
    set(out, 'token_hash', p.tokenHash);
    set(out, 'familia_id', p.familiaId);
    set(out, 'expira_en', p.expiraEn);
    set(out, 'rotado', p.rotado);
    set(out, 'revocado', p.revocado);
    return out;
  },
};

// ---------------------------------------------------------------------------
// Suscripcion
// ---------------------------------------------------------------------------
export const suscripcionMapper: EntityMapper<Suscripcion, 'suscripciones'> = {
  table: 'suscripciones',
  entityName: 'Suscripcion',
  fromRow: (r) => ({
    id: r.id,
    usuarioId: r.usuario_id,
    plan: r.plan,
    estado: r.estado,
    vigenciaHasta: r.vigencia_hasta,
    revenueCatId: r.revenue_cat_id,
  }),
  toRow: (p) => {
    const out: Record<string, unknown> = {};
    set(out, 'id', p.id);
    set(out, 'usuario_id', p.usuarioId);
    set(out, 'plan', p.plan);
    set(out, 'estado', p.estado);
    set(out, 'vigencia_hasta', p.vigenciaHasta);
    set(out, 'revenue_cat_id', p.revenueCatId);
    return out;
  },
};

// ---------------------------------------------------------------------------
// Temporada
// ---------------------------------------------------------------------------
export const temporadaMapper: EntityMapper<Temporada, 'temporadas'> = {
  table: 'temporadas',
  entityName: 'Temporada',
  fromRow: (r) => ({
    id: r.id,
    usuarioId: r.usuario_id,
    clubId: r.club_id,
    temporadaExterna: r.temporada_externa,
    estado: r.estado,
    fechaLimiteCierre: r.fecha_limite_cierre,
  }),
  toRow: (p) => {
    const out: Record<string, unknown> = {};
    set(out, 'id', p.id);
    set(out, 'usuario_id', p.usuarioId);
    set(out, 'club_id', p.clubId);
    set(out, 'temporada_externa', p.temporadaExterna);
    set(out, 'estado', p.estado);
    set(out, 'fecha_limite_cierre', p.fechaLimiteCierre);
    return out;
  },
};

// ---------------------------------------------------------------------------
// ConfigAdmin
// ---------------------------------------------------------------------------
export const configAdminMapper: EntityMapper<ConfigAdmin, 'config_admin'> = {
  table: 'config_admin',
  entityName: 'ConfigAdmin',
  fromRow: (r) => ({
    id: r.id,
    temporadaId: r.temporada_id,
    liga: r.liga,
    fechaLimiteCierre: r.fecha_limite_cierre,
    operadorId: r.operador_id,
  }),
  toRow: (p) => {
    const out: Record<string, unknown> = {};
    set(out, 'id', p.id);
    set(out, 'temporada_id', p.temporadaId);
    set(out, 'liga', p.liga);
    set(out, 'fecha_limite_cierre', p.fechaLimiteCierre);
    set(out, 'operador_id', p.operadorId);
    return out;
  },
};

// ---------------------------------------------------------------------------
// PartidoOficial
// ---------------------------------------------------------------------------
export const partidoMapper: EntityMapper<PartidoOficial, 'partidos_oficiales'> = {
  table: 'partidos_oficiales',
  entityName: 'PartidoOficial',
  fromRow: (r) => ({
    id: r.id,
    temporadaId: r.temporada_id,
    partidoExternoId: r.partido_externo_id,
    competicion: r.competicion,
    tipoCompeticion: r.tipo_competicion,
    rival: r.rival,
    fechaHora: r.fecha_hora,
    estado: r.estado,
    esClasico: r.es_clasico,
    esInternacional: r.es_internacional,
    resultado: (r.resultado as unknown as ResultadoPartido | null) ?? null,
    alineacion: (r.alineacion as unknown as JugadorAlineacion[]) ?? [],
    eventos: (r.eventos as unknown as EventoPartido[]) ?? [],
  }),
  toRow: (p) => {
    const out: Record<string, unknown> = {};
    set(out, 'id', p.id);
    set(out, 'temporada_id', p.temporadaId);
    set(out, 'partido_externo_id', p.partidoExternoId);
    set(out, 'competicion', p.competicion);
    set(out, 'tipo_competicion', p.tipoCompeticion);
    set(out, 'rival', p.rival);
    set(out, 'fecha_hora', p.fechaHora);
    set(out, 'estado', p.estado);
    set(out, 'es_clasico', p.esClasico);
    set(out, 'es_internacional', p.esInternacional);
    set(out, 'resultado', p.resultado);
    set(out, 'alineacion', p.alineacion);
    set(out, 'eventos', p.eventos);
    return out;
  },
};

// ---------------------------------------------------------------------------
// Album
// ---------------------------------------------------------------------------
export const albumMapper: EntityMapper<Album, 'albums'> = {
  table: 'albums',
  entityName: 'Album',
  fromRow: (r) => ({ id: r.id, temporadaId: r.temporada_id }),
  toRow: (p) => {
    const out: Record<string, unknown> = {};
    set(out, 'id', p.id);
    set(out, 'temporada_id', p.temporadaId);
    return out;
  },
};

// ---------------------------------------------------------------------------
// Recuadro
// ---------------------------------------------------------------------------
export const recuadroMapper: EntityMapper<Recuadro, 'recuadros'> = {
  table: 'recuadros',
  entityName: 'Recuadro',
  fromRow: (r) => ({
    id: r.id,
    albumId: r.album_id,
    partidoOficialId: r.partido_oficial_id,
    plantillaId: r.plantilla_id,
    numero: r.numero,
    anchoMm: Number(r.ancho_mm),
    altoMm: Number(r.alto_mm),
    fotoPrincipalId: r.foto_principal_id,
    estadoRecordatorio: r.estado_recordatorio,
  }),
  toRow: (p) => {
    const out: Record<string, unknown> = {};
    set(out, 'id', p.id);
    set(out, 'album_id', p.albumId);
    set(out, 'partido_oficial_id', p.partidoOficialId);
    set(out, 'plantilla_id', p.plantillaId);
    set(out, 'numero', p.numero);
    set(out, 'ancho_mm', p.anchoMm);
    set(out, 'alto_mm', p.altoMm);
    set(out, 'foto_principal_id', p.fotoPrincipalId);
    set(out, 'estado_recordatorio', p.estadoRecordatorio);
    return out;
  },
};

// ---------------------------------------------------------------------------
// Momento
// ---------------------------------------------------------------------------
export const momentoMapper: EntityMapper<Momento, 'momentos'> = {
  table: 'momentos',
  entityName: 'Momento',
  fromRow: (r) => ({
    id: r.id,
    partidoOficialId: r.partido_oficial_id,
    contextoAsistencia: r.contexto_asistencia,
    subModalidad: r.sub_modalidad,
    geoVerificado: r.geo_verificado,
    notas: r.notas,
    jugadorDelPartido: r.jugador_del_partido,
  }),
  toRow: (p) => {
    const out: Record<string, unknown> = {};
    set(out, 'id', p.id);
    set(out, 'partido_oficial_id', p.partidoOficialId);
    set(out, 'contexto_asistencia', p.contextoAsistencia);
    set(out, 'sub_modalidad', p.subModalidad);
    set(out, 'geo_verificado', p.geoVerificado);
    set(out, 'notas', p.notas);
    set(out, 'jugador_del_partido', p.jugadorDelPartido);
    return out;
  },
};

// ---------------------------------------------------------------------------
// Foto
// ---------------------------------------------------------------------------
export const fotoMapper: EntityMapper<Foto, 'fotos'> = {
  table: 'fotos',
  entityName: 'Foto',
  fromRow: (r) => ({
    id: r.id,
    momentoId: r.momento_id,
    objectKey: r.object_key,
    anchoPx: r.ancho_px,
    altoPx: r.alto_px,
    estadoAsociacion: r.estado_asociacion,
  }),
  toRow: (p) => {
    const out: Record<string, unknown> = {};
    set(out, 'id', p.id);
    set(out, 'momento_id', p.momentoId);
    set(out, 'object_key', p.objectKey);
    set(out, 'ancho_px', p.anchoPx);
    set(out, 'alto_px', p.altoPx);
    set(out, 'estado_asociacion', p.estadoAsociacion);
    return out;
  },
};

// ---------------------------------------------------------------------------
// DireccionEnvio
// ---------------------------------------------------------------------------
export const direccionMapper: EntityMapper<DireccionEnvio, 'direcciones_envio'> = {
  table: 'direcciones_envio',
  entityName: 'DireccionEnvio',
  fromRow: (r) => ({
    id: r.id,
    usuarioId: r.usuario_id,
    campos: r.campos as unknown as CamposDireccion,
    validada: r.validada,
  }),
  toRow: (p) => {
    const out: Record<string, unknown> = {};
    set(out, 'id', p.id);
    set(out, 'usuario_id', p.usuarioId);
    set(out, 'campos', p.campos);
    set(out, 'validada', p.validada);
    return out;
  },
};

// ---------------------------------------------------------------------------
// Pedido
// ---------------------------------------------------------------------------
export const pedidoMapper: EntityMapper<Pedido, 'pedidos'> = {
  table: 'pedidos',
  entityName: 'Pedido',
  fromRow: (r) => ({
    id: r.id,
    temporadaId: r.temporada_id,
    estado: r.estado,
    tracking: r.tracking,
    datosFiscalesMinimos:
      (r.datos_fiscales_minimos as unknown as DatosFiscalesMinimos | null) ?? null,
    intentosImpresion: r.intentos_impresion,
  }),
  toRow: (p) => {
    const out: Record<string, unknown> = {};
    set(out, 'id', p.id);
    set(out, 'temporada_id', p.temporadaId);
    set(out, 'estado', p.estado);
    set(out, 'tracking', p.tracking);
    set(out, 'datos_fiscales_minimos', p.datosFiscalesMinimos);
    set(out, 'intentos_impresion', p.intentosImpresion);
    return out;
  },
};
