// Capa de dominio: tipos, interfaces y enums del modelo de datos.
//
// Este módulo traduce la sección "Data Models" del design.md (diagrama ER y
// reglas de entidad) a tipos TypeScript. Los identificadores se modelan como
// UUID (alias de string) y las marcas de tiempo como ISO 8601 (alias de string)
// para mantener el dominio puro e independiente del driver de persistencia.
//
// Requirements: 4.1, 4.2, 5.5, 9.5, 14.5

/** Identificador único universal (UUID v4) representado como string. */
export type UUID = string;

/** Marca de tiempo ISO 8601 (p. ej. "2025-05-01T10:00:00.000Z"). */
export type ISODateTime = string;

/** Fecha ISO 8601 sin hora (p. ej. "2025-05-01"). */
export type ISODate = string;

/** Zona horaria IANA (p. ej. "America/Bogota"). Ancla la hora local de recordatorios (Req 14). */
export type ZonaHoraria = string;

// ---------------------------------------------------------------------------
// Enums de estado (string literal unions)
// ---------------------------------------------------------------------------
//
// Se usan uniones de literales de string en lugar de `enum` de TS por su mejor
// interoperabilidad con datos serializados (JSON/persistencia), su borrado
// completo en tiempo de compilación y su compatibilidad con `isolatedModules`.

/** Proveedor de autenticación multiproveedor (Req 1.1). */
export type ProveedorAuth = 'apple' | 'google' | 'email';

/**
 * Estado del ciclo de vida de la Temporada (Req 16).
 * Ver el diagrama de estados del design.md.
 */
export type EstadoTemporada =
  'CONFIGURACION' | 'ACTIVA' | 'CERRADA' | 'IMPRESION' | 'LISTA' | 'ENVIADA' | 'FALLIDA';

/** Estado de un Partido_Oficial según la API deportiva (Req 9). */
export type EstadoPartido = 'PROGRAMADO' | 'EN_CURSO' | 'FINALIZADO';

/**
 * Tipo de competición de un Partido_Oficial. Excluye amistosos: solo los
 * partidos oficiales (liga/copa/internacional) generan Recuadro (Req 4.2).
 */
export type TipoCompeticion = 'LIGA' | 'COPA_NACIONAL' | 'INTERNACIONAL';

/** Plan de suscripción del usuario (Req 3.1). */
export type PlanSuscripcion = 'BASICO' | 'PREMIUM';

/** Estado de la suscripción; en fallo de pago se conserva el estado previo (Req 3.5). */
export type EstadoSuscripcion = 'ACTIVA' | 'EN_GRACIA' | 'VENCIDA';

/**
 * Estado del recordatorio recurrente de un Recuadro vacío (Req 14).
 * Se detiene al asignar Foto_Principal o al silenciar/descartar.
 */
export type EstadoRecordatorio = 'ACTIVO' | 'DETENIDO_POR_FOTO' | 'SILENCIADO';

/** Estado de asociación de una Foto con la ficha del partido (Req 9.5). */
export type EstadoAsociacionFoto = 'ASOCIADA' | 'PENDIENTE_ASOCIACION';

/** Estado del Pedido del kit físico impreso (Req 15, 18). */
export type EstadoPedido = 'PENDIENTE' | 'EN_IMPRESION' | 'LISTA' | 'FALLIDA' | 'ENVIADA';

/** Contexto de asistencia de un Momento (Req 6.1). */
export type ContextoAsistencia = 'EN_VIVO_LOCAL' | 'EN_VIVO_VISITA' | 'TRANSMISION';

/** Sub-modalidad válida solo cuando el contexto es Transmisión (Req 6.4). */
export type SubModalidadTransmision = 'TELEVISION' | 'BAR' | 'STREAMING';

// ---------------------------------------------------------------------------
// Tipos auxiliares para campos JSON del diagrama ER
// ---------------------------------------------------------------------------

/** Paleta de colores del Club para personalización visual (Req 2.1). */
export interface PaletaColores {
  primario: string;
  secundario: string;
  acento?: string;
}

/** Activos visuales del Club (estadio, camisetas, etc.) (Req 2.1). */
export interface ActivosVisuales {
  estadioUrls: string[];
  camisetaUrls: string[];
}

/** Resultado final de un Partido_Oficial finalizado (Req 9.3). */
export interface ResultadoPartido {
  golesLocal: number;
  golesVisita: number;
}

/** Jugador de la alineación inicial disponible (Req 8.1, 9.3). */
export interface JugadorAlineacion {
  id: string;
  nombre: string;
}

/** Evento clave del partido (gol, tarjeta, etc.) (Req 9.3). */
export interface EventoPartido {
  minuto: number;
  tipo: string;
  descripcion?: string;
}

/** Campos de una Dirección_Envío (Req 15.1). */
export interface CamposDireccion {
  nombre: string;
  linea1: string;
  linea2?: string;
  ciudad: string;
  region: string;
  codigoPostal: string;
  pais: string;
  telefono?: string;
}

/** Mínimo legal/fiscal conservado tras un borrado de cuenta (Req 20). */
export interface DatosFiscalesMinimos {
  numeroFactura: string;
  fechaEmision: ISODate;
  totalPagado: number;
  moneda: string;
}

// ---------------------------------------------------------------------------
// Entidades del dominio (diagrama ER)
// ---------------------------------------------------------------------------

/**
 * Usuario (hincha). Cuenta multiproveedor (Req 1); `clubId` determina la
 * personalización (Req 2); `zonaHoraria` ancla la hora local de recordatorios
 * (Req 14). El cambio de `clubId` está restringido con Temporada ACTIVA (Req 2.3).
 */
export interface Usuario {
  id: UUID;
  proveedorAuth: ProveedorAuth;
  email: string;
  clubId: UUID | null;
  zonaHoraria: ZonaHoraria;
}

/**
 * Refresh_Token por sesión. `familiaId` agrupa la cadena de rotación;
 * `rotado`/`revocado` permiten invalidar la reutilización y el logout (Req 1, 20).
 */
export interface RefreshToken {
  id: UUID;
  usuarioId: UUID;
  tokenHash: string;
  familiaId: UUID;
  expiraEn: ISODateTime;
  rotado: boolean;
  revocado: boolean;
}

/**
 * Config_Admin: configuración administrativa por Temporada/liga fijada por un
 * operador. Contiene la `fechaLimiteCierre` (Req 14.5, 16). No la calcula el
 * sistema ni el usuario final.
 */
export interface ConfigAdmin {
  id: UUID;
  temporadaId: UUID;
  liga: string;
  fechaLimiteCierre: ISODateTime;
  operadorId: UUID;
}

/**
 * Plantilla_Album: define, por Club, las dimensiones físicas del Recuadro,
 * usadas para calcular de forma verificable el DPI resultante (Req 19.1).
 */
export interface PlantillaAlbum {
  id: UUID;
  clubId: UUID;
  recuadroAnchoMm: number;
  recuadroAltoMm: number;
}

/** Club seleccionado por el usuario; su identidad visual personaliza la app (Req 2). */
export interface Club {
  id: UUID;
  nombre: string;
  paletaColores: PaletaColores;
  escudoUrl: string;
  activosVisuales: ActivosVisuales;
}

/** Rivalidad predefinida de un Club; alimenta la clasificación de Clásicos (Req 10.2). */
export interface Rivalidad {
  id: UUID;
  clubId: UUID;
  rivalNombre: string;
}

/**
 * Suscripción: `plan` y `estado`; en fallo de pago se conserva el estado previo
 * (Req 3.5). El estado se actualiza desde webhooks de RevenueCat.
 */
export interface Suscripcion {
  id: UUID;
  usuarioId: UUID;
  plan: PlanSuscripcion;
  estado: EstadoSuscripcion;
  vigenciaHasta: ISODate;
  revenueCatId: string;
}

/**
 * Temporada: su `estado` gobierna el ciclo de vida y su `fechaLimiteCierre`
 * (proveniente de Config_Admin) gobierna cierre (Req 16) y recordatorios (Req 14.6).
 */
export interface Temporada {
  id: UUID;
  usuarioId: UUID;
  clubId: UUID;
  temporadaExterna: string;
  estado: EstadoTemporada;
  fechaLimiteCierre: ISODateTime;
}

/**
 * Partido_Oficial: `tipoCompeticion` excluye amistosos (Req 4.2);
 * `esClasico`/`esInternacional` los fija el Clasificador (Req 10).
 */
export interface PartidoOficial {
  id: UUID;
  temporadaId: UUID;
  partidoExternoId: string;
  competicion: string;
  tipoCompeticion: TipoCompeticion;
  rival: string;
  fechaHora: ISODateTime;
  estado: EstadoPartido;
  esClasico: boolean;
  esInternacional: boolean;
  resultado: ResultadoPartido | null;
  alineacion: JugadorAlineacion[];
  eventos: EventoPartido[];
}

/** Album generado por la Temporada; contiene los Recuadros (Req 4). */
export interface Album {
  id: UUID;
  temporadaId: UUID;
}

/**
 * Recuadro: exactamente uno por Partido_Oficial (Req 4.1). `numero` es la clave
 * de correspondencia con el sticker (Req 17.4, 18.1); `fotoPrincipalId` a lo
 * sumo uno (Req 5.5); `anchoMm`/`altoMm` fijan el tamaño físico para el DPI (Req 19.1).
 */
export interface Recuadro {
  id: UUID;
  albumId: UUID;
  partidoOficialId: UUID;
  plantillaId: UUID;
  numero: number;
  anchoMm: number;
  altoMm: number;
  fotoPrincipalId: UUID | null;
  estadoRecordatorio: EstadoRecordatorio;
}

/**
 * Momento: contexto, notas y votación (Req 6, 7, 8); ligado 1:1 al Partido_Oficial.
 * `subModalidad` solo es válida cuando `contextoAsistencia = TRANSMISION` (Req 6.4).
 */
export interface Momento {
  id: UUID;
  partidoOficialId: UUID;
  contextoAsistencia: ContextoAsistencia;
  subModalidad: SubModalidadTransmision | null;
  geoVerificado: boolean;
  notas: string;
  jugadorDelPartido: string | null;
}

/**
 * Foto: `anchoPx`/`altoPx` combinados con las dimensiones físicas del Recuadro
 * permiten verificar los 300 DPI (Req 19.1); `estadoAsociacion` (Req 9.5);
 * solo la Foto_Principal se imprime (Req 5.6).
 */
export interface Foto {
  id: UUID;
  momentoId: UUID;
  objectKey: string;
  anchoPx: number;
  altoPx: number;
  estadoAsociacion: EstadoAsociacionFoto;
}

/** Dirección_Envío del kit físico; validada antes de la Fecha_Límite_Cierre (Req 15). */
export interface DireccionEnvio {
  id: UUID;
  usuarioId: UUID;
  campos: CamposDireccion;
  validada: boolean;
}

/**
 * Pedido: envío y tracking del kit físico (Req 15). `datosFiscalesMinimos` se
 * conserva tras un borrado de cuenta (Req 20); `intentosImpresion` cuenta los
 * reintentos del Print_Engine antes de marcar FALLIDA (Req 18.7, 18.8).
 */
export interface Pedido {
  id: UUID;
  temporadaId: UUID;
  estado: EstadoPedido;
  tracking: string | null;
  datosFiscalesMinimos: DatosFiscalesMinimos | null;
  intentosImpresion: number;
}
