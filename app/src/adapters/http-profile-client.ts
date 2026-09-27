// Adaptador HTTP del perfil del usuario y de los partidos de la temporada.
//
// Backend deployado (docs/FRONTEND_INTEGRATION.md):
//   `GET /me`                        → perfil: usuario + club + temporada activa
//   `GET /temporadas/:id/partidos`   → partidos de la temporada, enriquecidos con
//                                      el número de recuadro y si tienen foto
//                                      principal (para listar las "láminas").
//
// Es el cliente que permite a la app descubrir el `temporadaId` (del perfil) y
// los `partidoId` (de la lista de partidos) que necesitan el álbum y la captura.
// Antes no existían estos endpoints y el flujo se quedaba en placeholders.
//
// TypeScript PURO: no importa `react-native`; typechea bajo `app/tsconfig.json`.

import { buildRequest, readOkBody, type SendFn } from './http-adapter-utils';
import type {
  ClubActivosVisuales,
  ClubPaletaColores,
} from './http-clubs-catalog-client';

/** Estado del ciclo de vida de la Temporada (unión de literales del backend). */
export type EstadoTemporada =
  | 'CONFIGURACION'
  | 'ACTIVA'
  | 'CERRADA'
  | 'IMPRESION'
  | 'LISTA'
  | 'ENVIADA'
  | 'FALLIDA';

/** Tipo de competición de un partido oficial (excluye amistosos). */
export type TipoCompeticion = 'LIGA' | 'COPA_NACIONAL' | 'INTERNACIONAL';

/** Estado de un partido según la API deportiva. */
export type EstadoPartido = 'PROGRAMADO' | 'EN_CURSO' | 'FINALIZADO';

/** Sexo declarado en el perfil. */
export type Sexo = 'MASCULINO' | 'FEMENINO' | 'OTRO' | 'PREFIERO_NO_DECIR';

/** Datos del usuario devueltos por `GET /me` (perfil ampliado). */
export interface PerfilUsuario {
  readonly id: string;
  readonly email: string;
  readonly clubId: string | null;
  readonly zonaHoraria: string;
  readonly nombre: string | null;
  readonly alias: string | null;
  readonly fechaNacimiento: string | null;
  readonly sexo: Sexo | null;
  readonly avatarUrl: string | null;
}

/** Parche de actualización de perfil (`PATCH /me`). */
export interface ActualizarPerfilInput {
  readonly nombre?: string;
  readonly alias?: string;
  readonly fechaNacimiento?: string;
  readonly sexo?: Sexo;
  readonly avatarUrl?: string;
  readonly zonaHoraria?: string;
}

/** Club del perfil (misma forma que el catálogo, con `id`). */
export interface PerfilClub {
  readonly id: string;
  readonly nombre: string;
  readonly paletaColores: ClubPaletaColores;
  readonly escudoUrl: string;
  readonly activosVisuales: ClubActivosVisuales;
}

/** Temporada del usuario (perfil / listado). */
export interface Temporada {
  readonly id: string;
  readonly usuarioId: string;
  readonly clubId: string;
  readonly temporadaExterna: string;
  readonly estado: EstadoTemporada;
  readonly fechaLimiteCierre: string;
}

/** Perfil completo del usuario autenticado (`GET /me`). */
export interface Perfil {
  readonly usuario: PerfilUsuario;
  readonly club: PerfilClub | null;
  readonly temporadaActiva: Temporada | null;
}

/** Resultado final de un partido finalizado. */
export interface ResultadoPartido {
  readonly golesLocal: number;
  readonly golesVisita: number;
}

/**
 * Partido de la temporada enriquecido con datos del recuadro/lámina, tal como lo
 * devuelve `GET /temporadas/:id/partidos`.
 */
export interface PartidoLamina {
  readonly partidoId: string;
  readonly rival: string;
  readonly competicion: string;
  readonly tipoCompeticion: TipoCompeticion;
  readonly fechaHora: string;
  readonly estado: EstadoPartido;
  readonly esClasico: boolean;
  readonly esInternacional: boolean;
  readonly resultado: ResultadoPartido | null;
  /** Número del recuadro/sticker (o `null` si aún no hay recuadro derivado). */
  readonly numeroRecuadro: number | null;
  /** `true` si el recuadro ya tiene foto principal (lámina montada). */
  readonly tieneFotoPrincipal: boolean;
}

/** Respuesta de `GET /temporadas/:id/partidos`. */
interface PartidosResponse {
  readonly temporadaId: string;
  readonly partidos: readonly PartidoLamina[];
}

/** Goleador de un partido (detalle). */
export interface Goleador {
  readonly minuto: number;
  readonly jugador: string;
  readonly equipo: string;
}

/** Jugador de una formación. */
export interface JugadorFormacion {
  readonly id: string;
  readonly nombre: string;
}

/** Formación de un equipo en el partido. */
export interface FormacionEquipo {
  readonly equipo: string;
  readonly formacion?: string;
  readonly titulares: readonly JugadorFormacion[];
}

/** Foto asociada al momento del partido. */
export interface FotoMomento {
  readonly id: string;
  readonly objectKey: string;
  readonly esPrincipal: boolean;
}

/** Detalle completo de un partido/lámina (`GET /partidos/:partidoId`). */
export interface PartidoDetalle {
  readonly partidoId: string;
  readonly rival: string;
  readonly competicion: string;
  readonly fechaHora: string;
  readonly estado: EstadoPartido;
  readonly esClasico: boolean;
  readonly esInternacional: boolean;
  readonly resultado: ResultadoPartido | null;
  readonly numeroRecuadro: number | null;
  /** Id del recuadro asociado (para fijar la Foto_Principal), o null si aún no existe. */
  readonly recuadroId: string | null;
  readonly momentoId: string | null;
  readonly notas: string;
  readonly jugadorDelPartido: string | null;
  readonly fotoPrincipalId: string | null;
  readonly fotos: readonly FotoMomento[];
  readonly goleadores: readonly Goleador[];
  readonly formaciones: readonly FormacionEquipo[];
}

/** Respuesta de `GET /me/temporadas`. */
interface TemporadasResponse {
  readonly temporadas: readonly Temporada[];
}

/** Resultado de `POST /me/temporada` (sincronización desde la API deportiva). */
export interface SyncTemporadaResult {
  readonly temporadaId: string;
  readonly albumId: string;
  readonly partidos: number;
  readonly recuadros: number;
}

/** Equipo real devuelto por la búsqueda (`GET /equipos?buscar=`). */
export interface EquipoBusqueda {
  readonly id: string;
  readonly nombre: string;
  readonly pais?: string;
  readonly escudoUrl?: string;
}

/** Liga real de un equipo (`GET /equipos/:id/ligas`). */
export interface LigaEquipo {
  readonly ligaId: string;
  readonly nombre: string;
  readonly tipo?: string;
  readonly temporadas: readonly number[];
}

/** Resultado de seleccionar el equipo real (`POST /me/equipo`). */
export interface SeleccionEquipoResult {
  readonly clubId: string;
  readonly nombre: string;
  readonly escudoUrl: string;
}

interface EquiposResponse {
  readonly equipos: readonly EquipoBusqueda[];
}

interface LigasResponse {
  readonly ligas: readonly LigaEquipo[];
}

/** País disponible (`GET /paises`). */
export interface Pais {
  readonly nombre: string;
  readonly codigo?: string;
  readonly banderaUrl?: string;
}

/** Liga/división de un país (`GET /paises/:pais/ligas`). */
export interface LigaPais {
  readonly ligaId: string;
  readonly nombre: string;
  readonly tipo?: string;
  readonly logoUrl?: string;
}

interface PaisesResponse {
  readonly paises: readonly Pais[];
}

interface LigasPaisResponse {
  readonly ligas: readonly LigaPais[];
}

/**
 * Contrato del cliente de perfil/partidos. Inyectable en las pantallas de
 * Perfil, Home/Álbum y la lista de partidos (láminas).
 */
export interface ProfileClient {
  /** `GET /me`: perfil del usuario (usuario + club + temporada activa). */
  getPerfil(): Promise<Perfil>;
  /** `GET /me/temporadas`: temporadas del usuario. */
  listTemporadas(): Promise<readonly Temporada[]>;
  /** `GET /temporadas/:id/partidos`: partidos (láminas) de la temporada. */
  listPartidos(temporadaId: string): Promise<readonly PartidoLamina[]>;
  /**
   * `POST /me/temporada`: crea/sincroniza la Temporada del usuario desde la API
   * deportiva. `temporadaExterna` con formato "<leagueId>:<season>".
   */
  syncTemporada(temporadaExterna: string): Promise<SyncTemporadaResult>;
  /** `GET /equipos?buscar=`: busca equipos reales por nombre (onboarding). */
  buscarEquipos(query: string): Promise<readonly EquipoBusqueda[]>;
  /** `GET /equipos/:id/ligas?season=`: ligas del equipo para una temporada. */
  ligasDeEquipo(teamId: string, season: number): Promise<readonly LigaEquipo[]>;
  /** `POST /me/equipo`: persiste el equipo real elegido y lo asigna al usuario. */
  seleccionarEquipo(equipo: EquipoBusqueda): Promise<SeleccionEquipoResult>;
  /** `GET /paises`: países disponibles (onboarding por país). */
  listarPaises(): Promise<readonly Pais[]>;
  /** `GET /paises/:pais/ligas?season=`: ligas/divisiones de un país. */
  ligasDePais(pais: string, season: number): Promise<readonly LigaPais[]>;
  /** `GET /ligas/:ligaId/equipos?season=`: equipos (con logo) de una liga. */
  equiposDeLiga(ligaId: string, season: number): Promise<readonly EquipoBusqueda[]>;
  /** `PATCH /me`: actualiza los datos de perfil; devuelve el perfil actualizado. */
  actualizarPerfil(input: ActualizarPerfilInput): Promise<PerfilUsuario>;
  /** `GET /partidos/:partidoId`: detalle del partido (resultado, goleadores, formaciones, momento). */
  getPartido(partidoId: string): Promise<PartidoDetalle>;
}

/** Adaptador HTTP concreto de perfil/partidos. Autenticado (Bearer). */
export class HttpProfileClient implements ProfileClient {
  constructor(private readonly send: SendFn) {}

  /** `GET /me` → perfil completo. */
  async getPerfil(): Promise<Perfil> {
    const response = await this.send<Perfil>(buildRequest('GET', '/me'));
    return readOkBody(response, 'GET /me');
  }

  /** `GET /me/temporadas` → `{ temporadas: [...] }`. */
  async listTemporadas(): Promise<readonly Temporada[]> {
    const response = await this.send<TemporadasResponse>(
      buildRequest('GET', '/me/temporadas'),
    );
    return readOkBody(response, 'GET /me/temporadas').temporadas;
  }

  /** `GET /temporadas/:id/partidos` → `{ temporadaId, partidos: [...] }`. */
  async listPartidos(temporadaId: string): Promise<readonly PartidoLamina[]> {
    const path = `/temporadas/${encodeURIComponent(temporadaId)}/partidos`;
    const response = await this.send<PartidosResponse>(buildRequest('GET', path));
    return readOkBody(response, path).partidos;
  }

  /** `POST /me/temporada` → sincroniza la temporada desde la API deportiva. */
  async syncTemporada(temporadaExterna: string): Promise<SyncTemporadaResult> {
    const response = await this.send<SyncTemporadaResult>(
      buildRequest('POST', '/me/temporada', { body: { temporadaExterna } }),
    );
    return readOkBody(response, 'POST /me/temporada');
  }

  /** `GET /equipos?buscar=` → equipos reales por nombre. */
  async buscarEquipos(query: string): Promise<readonly EquipoBusqueda[]> {
    const path = `/equipos?buscar=${encodeURIComponent(query)}`;
    const response = await this.send<EquiposResponse>(buildRequest('GET', path));
    return readOkBody(response, path).equipos;
  }

  /** `GET /equipos/:id/ligas?season=` → ligas del equipo para la temporada. */
  async ligasDeEquipo(teamId: string, season: number): Promise<readonly LigaEquipo[]> {
    const path = `/equipos/${encodeURIComponent(teamId)}/ligas?season=${encodeURIComponent(String(season))}`;
    const response = await this.send<LigasResponse>(buildRequest('GET', path));
    return readOkBody(response, path).ligas;
  }

  /** `POST /me/equipo` → persiste el equipo real y lo asigna al usuario. */
  async seleccionarEquipo(equipo: EquipoBusqueda): Promise<SeleccionEquipoResult> {
    const response = await this.send<SeleccionEquipoResult>(
      buildRequest('POST', '/me/equipo', { body: equipo }),
    );
    return readOkBody(response, 'POST /me/equipo');
  }

  /** `GET /paises` → países disponibles. */
  async listarPaises(): Promise<readonly Pais[]> {
    const response = await this.send<PaisesResponse>(buildRequest('GET', '/paises'));
    return readOkBody(response, 'GET /paises').paises;
  }

  /** `GET /paises/:pais/ligas?season=` → ligas/divisiones del país. */
  async ligasDePais(pais: string, season: number): Promise<readonly LigaPais[]> {
    const path = `/paises/${encodeURIComponent(pais)}/ligas?season=${encodeURIComponent(String(season))}`;
    const response = await this.send<LigasPaisResponse>(buildRequest('GET', path));
    return readOkBody(response, path).ligas;
  }

  /** `GET /ligas/:ligaId/equipos?season=` → equipos de la liga (con logo). */
  async equiposDeLiga(ligaId: string, season: number): Promise<readonly EquipoBusqueda[]> {
    const path = `/ligas/${encodeURIComponent(ligaId)}/equipos?season=${encodeURIComponent(String(season))}`;
    const response = await this.send<EquiposResponse>(buildRequest('GET', path));
    return readOkBody(response, path).equipos;
  }

  /** `PATCH /me` → actualiza el perfil; devuelve `usuario`. */
  async actualizarPerfil(input: ActualizarPerfilInput): Promise<PerfilUsuario> {
    const response = await this.send<{ usuario: PerfilUsuario }>(
      buildRequest('PATCH', '/me', { body: input }),
    );
    return readOkBody(response, 'PATCH /me').usuario;
  }

  /** `GET /partidos/:partidoId` → detalle del partido. */
  async getPartido(partidoId: string): Promise<PartidoDetalle> {
    const path = `/partidos/${encodeURIComponent(partidoId)}`;
    const response = await this.send<PartidoDetalle>(buildRequest('GET', path));
    return readOkBody(response, path);
  }
}
