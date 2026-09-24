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

/** Datos del usuario devueltos por `GET /me`. */
export interface PerfilUsuario {
  readonly id: string;
  readonly email: string;
  readonly clubId: string | null;
  readonly zonaHoraria: string;
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

/** Respuesta de `GET /me/temporadas`. */
interface TemporadasResponse {
  readonly temporadas: readonly Temporada[];
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
}
