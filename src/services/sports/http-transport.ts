// Servicio_Datos_Deportivos — transportes HTTP concretos de la API deportiva.
//
// El `ResilientSportsApiClient` (client.ts) llama a rutas internas estables:
//   - GET /temporadas/:temporadaExterna/fixtures
//   - GET /partidos/:partidoExternoId/ficha
// y espera de vuelta `RawFixture[]` / `RawFichaPartido` YA con la forma cruda de
// `types.ts`. Este módulo provee dos implementaciones de `SportsApiTransport`:
//
//   - `ApiFootballSportsTransport`: adaptador real contra API-Football
//     (api-sports.io v3). Traduce las rutas internas a los endpoints del
//     proveedor, envía la API key en la cabecera y mapea la respuesta del
//     proveedor a las formas crudas del dominio. Respeta el `AbortSignal`.
//
//   - `UnavailableSportsTransport`: stub explícito para cuando NO hay API key.
//     No finge éxito: lanza `SportsApiError` con un mensaje claro para que el
//     servicio de sincronización devuelva "sincronización no disponible"
//     (preferencia del usuario: los adaptadores sin implementación real deben
//     fallar/registrar, nunca simular).
//
// El formato de `temporadaExterna` esperado por el adaptador real es
// "<leagueId>:<season>" (p. ej. "39:2024"): identifica liga + temporada en
// API-Football. `syncFixture` usa `temporada.temporadaExterna`, así que la
// Temporada debe almacenar ese identificador compuesto.

import { SportsApiError } from './errors.js';
import type {
  RawEquipo,
  RawFichaPartido,
  RawFixture,
  RawLigaEquipo,
  RawLigaPais,
  RawPais,
  SportsApiTransport,
} from './types.js';

/** Transporte que indica que la API deportiva no está configurada (sin API key). */
export class UnavailableSportsTransport implements SportsApiTransport {
  get<T>(_path: string, _signal: AbortSignal): Promise<T> {
    return Promise.reject(
      new SportsApiError(
        'La API deportiva no está configurada (falta SPORTS_API_KEY). ' +
          'La sincronización de temporada no está disponible.',
      ),
    );
  }
}

/** Opciones del adaptador real de API-Football. */
export interface ApiFootballTransportOptions {
  /** Base URL del proveedor (p. ej. https://v3.football.api-sports.io). */
  readonly baseUrl: string;
  /** API key del proveedor (cabecera `x-apisports-key`). */
  readonly apiKey: string;
  /** `fetch` inyectable (por defecto el global) para poder probar sin red. */
  readonly fetchImpl?: typeof fetch;
}

/** Forma mínima de un fixture de API-Football que consumimos. */
interface ApiFootballFixtureItem {
  readonly fixture?: {
    readonly id?: number;
    readonly date?: string;
    readonly status?: { readonly short?: string };
  };
  readonly league?: { readonly name?: string };
  readonly teams?: {
    readonly home?: { readonly id?: number; readonly name?: string };
    readonly away?: { readonly id?: number; readonly name?: string };
  };
  readonly goals?: { readonly home?: number | null; readonly away?: number | null };
}

interface ApiFootballResponse<T> {
  readonly response?: readonly T[];
  readonly errors?: unknown;
}

/** Item de `teams?search=` de API-Football. */
interface ApiFootballTeamItem {
  readonly team?: {
    readonly id?: number;
    readonly name?: string;
    readonly country?: string;
    readonly logo?: string;
  };
}

/** Item de `leagues?...` de API-Football. */
interface ApiFootballLeagueItem {
  readonly league?: {
    readonly id?: number;
    readonly name?: string;
    readonly type?: string;
    readonly logo?: string;
  };
  readonly seasons?: readonly { readonly year?: number }[];
}

/** Item de `countries` de API-Football. */
interface ApiFootballCountryItem {
  readonly name?: string;
  readonly code?: string | null;
  readonly flag?: string | null;
}

/** Mapea el estado corto de API-Football a nuestro `estado` crudo. */
function mapEstado(short: string | undefined): string {
  switch (short) {
    case 'FT':
    case 'AET':
    case 'PEN':
      return 'FINALIZADO';
    case '1H':
    case '2H':
    case 'HT':
    case 'ET':
    case 'LIVE':
      return 'EN_CURSO';
    default:
      return 'PROGRAMADO';
  }
}

/**
 * Adaptador real de API-Football. Es un transporte de bajo nivel: el cliente
 * resiliente le aplica timeout y reintentos. Traduce las rutas internas a los
 * endpoints del proveedor y mapea la respuesta a las formas crudas del dominio.
 */
export class ApiFootballSportsTransport implements SportsApiTransport {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ApiFootballTransportOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async get<T>(path: string, signal: AbortSignal): Promise<T> {
    const fixturesMatch = /^\/temporadas\/([^/]+)\/fixtures$/.exec(path);
    if (fixturesMatch) {
      const temporadaExterna = decodeURIComponent(fixturesMatch[1] as string);
      return (await this.fetchFixtures(temporadaExterna, signal)) as T;
    }
    const fichaMatch = /^\/partidos\/([^/]+)\/ficha$/.exec(path);
    if (fichaMatch) {
      const partidoExternoId = decodeURIComponent(fichaMatch[1] as string);
      return (await this.fetchFicha(partidoExternoId, signal)) as T;
    }
    const teamsMatch = /^\/equipos\?buscar=(.+)$/.exec(path);
    if (teamsMatch) {
      const query = decodeURIComponent(teamsMatch[1] as string);
      return (await this.searchTeams(query, signal)) as T;
    }
    const ligasMatch = /^\/equipos\/([^/?]+)\/ligas\?season=(.+)$/.exec(path);
    if (ligasMatch) {
      const teamId = decodeURIComponent(ligasMatch[1] as string);
      const season = Number.parseInt(decodeURIComponent(ligasMatch[2] as string), 10);
      return (await this.leaguesForTeam(teamId, season, signal)) as T;
    }
    if (path === '/paises') {
      return (await this.listCountries(signal)) as T;
    }
    const paisLigasMatch = /^\/paises\/([^/?]+)\/ligas\?season=(.+)$/.exec(path);
    if (paisLigasMatch) {
      const pais = decodeURIComponent(paisLigasMatch[1] as string);
      const season = Number.parseInt(decodeURIComponent(paisLigasMatch[2] as string), 10);
      return (await this.leaguesByCountry(pais, season, signal)) as T;
    }
    const ligaEquiposMatch = /^\/ligas\/([^/?]+)\/equipos\?season=(.+)$/.exec(path);
    if (ligaEquiposMatch) {
      const ligaId = decodeURIComponent(ligaEquiposMatch[1] as string);
      const season = Number.parseInt(decodeURIComponent(ligaEquiposMatch[2] as string), 10);
      return (await this.teamsByLeague(ligaId, season, signal)) as T;
    }
    throw new SportsApiError(`Ruta de API deportiva no soportada: ${path}`);
  }

  /** Lista países (`countries`) y mapea a `RawPais`. */
  private async listCountries(signal: AbortSignal): Promise<readonly RawPais[]> {
    const url = `${this.baseUrl}/countries`;
    const data = await this.request<ApiFootballResponse<ApiFootballCountryItem>>(url, signal);
    return (data.response ?? []).flatMap((c) => {
      if (c.name === undefined) return [];
      const pais: RawPais = {
        nombre: c.name,
        ...(c.code !== undefined && c.code !== null ? { codigo: c.code } : {}),
        ...(c.flag !== undefined && c.flag !== null ? { banderaUrl: c.flag } : {}),
      };
      return [pais];
    });
  }

  /** Lista las ligas/divisiones de un país (`leagues?country=&season=`). */
  private async leaguesByCountry(
    country: string,
    season: number,
    signal: AbortSignal,
  ): Promise<readonly RawLigaPais[]> {
    const url = `${this.baseUrl}/leagues?country=${encodeURIComponent(country)}&season=${encodeURIComponent(String(season))}`;
    const data = await this.request<ApiFootballResponse<ApiFootballLeagueItem>>(url, signal);
    return (data.response ?? []).flatMap((item) => {
      const l = item.league;
      if (l?.id === undefined || l.name === undefined) return [];
      const liga: RawLigaPais = {
        ligaId: String(l.id),
        nombre: l.name,
        ...(l.type !== undefined ? { tipo: l.type } : {}),
        ...(l.logo !== undefined ? { logoUrl: l.logo } : {}),
      };
      return [liga];
    });
  }

  /** Lista los equipos de una liga/temporada (`teams?league=&season=`). */
  private async teamsByLeague(
    ligaId: string,
    season: number,
    signal: AbortSignal,
  ): Promise<readonly RawEquipo[]> {
    const url = `${this.baseUrl}/teams?league=${encodeURIComponent(ligaId)}&season=${encodeURIComponent(String(season))}`;
    const data = await this.request<ApiFootballResponse<ApiFootballTeamItem>>(url, signal);
    return (data.response ?? []).flatMap((item) => {
      const t = item.team;
      if (t?.id === undefined || t.name === undefined) return [];
      const equipo: RawEquipo = {
        id: String(t.id),
        nombre: t.name,
        ...(t.country !== undefined ? { pais: t.country } : {}),
        ...(t.logo !== undefined ? { escudoUrl: t.logo } : {}),
      };
      return [equipo];
    });
  }

  /** Busca equipos reales por nombre (`teams?search=`) y mapea a `RawEquipo`. */
  private async searchTeams(query: string, signal: AbortSignal): Promise<readonly RawEquipo[]> {
    const url = `${this.baseUrl}/teams?search=${encodeURIComponent(query)}`;
    const data = await this.request<ApiFootballResponse<ApiFootballTeamItem>>(url, signal);
    return (data.response ?? []).flatMap((item) => {
      const t = item.team;
      if (t?.id === undefined || t.name === undefined) return [];
      const equipo: RawEquipo = {
        id: String(t.id),
        nombre: t.name,
        ...(t.country !== undefined ? { pais: t.country } : {}),
        ...(t.logo !== undefined ? { escudoUrl: t.logo } : {}),
      };
      return [equipo];
    });
  }

  /** Lista las ligas de un equipo/temporada (`leagues?team=&season=`). */
  private async leaguesForTeam(
    teamId: string,
    season: number,
    signal: AbortSignal,
  ): Promise<readonly RawLigaEquipo[]> {
    const url = `${this.baseUrl}/leagues?team=${encodeURIComponent(teamId)}&season=${encodeURIComponent(String(season))}`;
    const data = await this.request<ApiFootballResponse<ApiFootballLeagueItem>>(url, signal);
    return (data.response ?? []).flatMap((item) => {
      const l = item.league;
      if (l?.id === undefined || l.name === undefined) return [];
      const liga: RawLigaEquipo = {
        ligaId: String(l.id),
        nombre: l.name,
        ...(l.type !== undefined ? { tipo: l.type } : {}),
        temporadas: (item.seasons ?? [])
          .map((s) => s.year)
          .filter((y): y is number => typeof y === 'number'),
      };
      return [liga];
    });
  }

  /**
   * Descarga y mapea los fixtures de "<leagueId>:<season>[:<teamId>]" a
   * `RawFixture[]`. Cuando se incluye `teamId`, se filtra el fixture por ese
   * equipo (`&team=`), de modo que solo se traen SUS partidos (no toda la liga),
   * y el `rival` de cada partido se resuelve como el equipo CONTRARIO.
   */
  private async fetchFixtures(
    temporadaExterna: string,
    signal: AbortSignal,
  ): Promise<readonly RawFixture[]> {
    const [league, season, teamId] = temporadaExterna.split(':');
    if (!league || !season) {
      throw new SportsApiError(
        `temporadaExterna inválida: "${temporadaExterna}" (se espera "<leagueId>:<season>[:<teamId>]").`,
      );
    }
    let url = `${this.baseUrl}/fixtures?league=${encodeURIComponent(league)}&season=${encodeURIComponent(season)}`;
    if (teamId) {
      url += `&team=${encodeURIComponent(teamId)}`;
    }
    const data = await this.request<ApiFootballResponse<ApiFootballFixtureItem>>(url, signal);
    const items = data.response ?? [];
    const teamIdNum = teamId ? Number.parseInt(teamId, 10) : undefined;
    return items.map((item) => this.mapFixture(item, teamIdNum));
  }

  /** Descarga y mapea la ficha de un partido finalizado a `RawFichaPartido`. */
  private async fetchFicha(
    partidoExternoId: string,
    signal: AbortSignal,
  ): Promise<RawFichaPartido> {
    const url = `${this.baseUrl}/fixtures?id=${encodeURIComponent(partidoExternoId)}`;
    const data = await this.request<ApiFootballResponse<ApiFootballFixtureItem>>(url, signal);
    const item = (data.response ?? [])[0];
    if (item === undefined) {
      throw new SportsApiError(`Partido no encontrado en la API: ${partidoExternoId}`);
    }
    return {
      partidoExternoId,
      resultado: {
        golesLocal: item.goals?.home ?? 0,
        golesVisita: item.goals?.away ?? 0,
      },
      alineacion: [],
      eventos: [],
    };
  }

  /**
   * Mapea un item de fixture del proveedor a nuestra forma cruda `RawFixture`.
   *
   * El `rival` se resuelve según el equipo del usuario (`teamIdNum`): es el
   * equipo CONTRARIO (si el usuario es local, el rival es el visitante y
   * viceversa). Si no se conoce el equipo, cae al visitante como aproximación.
   */
  private mapFixture(item: ApiFootballFixtureItem, teamIdNum?: number): RawFixture {
    // `exactOptionalPropertyTypes`: solo se incluyen las claves cuyo valor está
    // definido; las ausentes quedan fuera del objeto (no como `undefined`).
    const raw: {
      partidoExternoId?: string;
      competicion?: string;
      rival?: string;
      fechaHora?: string;
      estado?: string;
    } = { estado: mapEstado(item.fixture?.status?.short) };
    const id = item.fixture?.id;
    if (id !== undefined) raw.partidoExternoId = String(id);
    if (item.league?.name !== undefined) raw.competicion = item.league.name;

    // Rival = el equipo contrario al del usuario.
    const home = item.teams?.home;
    const away = item.teams?.away;
    let rival: string | undefined;
    if (teamIdNum !== undefined && home?.id !== undefined && away?.id !== undefined) {
      rival = home.id === teamIdNum ? away.name : home.name;
    } else {
      rival = away?.name; // sin equipo conocido: aproximación al visitante
    }
    if (rival !== undefined) raw.rival = rival;

    if (item.fixture?.date !== undefined) raw.fechaHora = item.fixture.date;
    return raw;
  }

  /** GET con la API key del proveedor; valida el 2xx y deserializa el JSON. */
  private async request<T>(url: string, signal: AbortSignal): Promise<T> {
    const res = await this.fetchImpl(url, {
      method: 'GET',
      headers: { 'x-apisports-key': this.apiKey, accept: 'application/json' },
      signal,
    });
    if (!res.ok) {
      throw new SportsApiError(`API deportiva respondió ${res.status} en ${url}`);
    }
    return (await res.json()) as T;
  }
}
