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
  RawFormacionEquipo,
  RawGoleador,
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
    readonly home?: { readonly id?: number; readonly name?: string; readonly logo?: string };
    readonly away?: { readonly id?: number; readonly name?: string; readonly logo?: string };
  };
  readonly goals?: { readonly home?: number | null; readonly away?: number | null };
}

interface ApiFootballResponse<T> {
  readonly response?: readonly T[];
  readonly errors?: unknown;
  /** Paginación de API-Football: `{ current, total }` (1-indexado). */
  readonly paging?: { readonly current?: number; readonly total?: number };
}

/**
 * ¿La respuesta trae errores de API-Football? El proveedor devuelve HTTP 200
 * incluso ante errores de cuota/plan/parámetros, poblando `errors` (un objeto
 * no vacío o un array). Ignorarlo enmascara un fallo como "sin resultados".
 */
function tieneErroresApiFootball(errors: unknown): boolean {
  if (errors == null) return false;
  if (Array.isArray(errors)) return errors.length > 0;
  if (typeof errors === 'object') return Object.keys(errors).length > 0;
  if (typeof errors === 'string') return errors.trim().length > 0;
  return false;
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

/** Item de `fixtures/events` de API-Football. */
interface ApiFootballEventItem {
  readonly type?: string;
  readonly time?: { readonly elapsed?: number };
  readonly team?: { readonly name?: string };
  readonly player?: { readonly name?: string };
}

/** Item de `fixtures/lineups` de API-Football. */
interface ApiFootballLineupItem {
  readonly team?: { readonly name?: string };
  readonly formation?: string;
  readonly startXI?: readonly {
    readonly player?: { readonly id?: number; readonly name?: string };
  }[];
}

/**
 * Mapea el estado corto de API-Football a nuestro `estado` crudo. SOLO se
 * considera FINALIZADO un partido efectivamente jugado y terminado (FT/AET/PEN
 * y sus variantes de cierre). Los estados "en juego" → EN_CURSO. TODO lo demás
 * —no iniciado (NS/TBD), aplazado (PST), cancelado (CANC), suspendido (SUSP),
 * interrumpido (INT), etc.— → PROGRAMADO. Así un partido que aún no se juega
 * NUNCA queda como FINALIZADO (que además implicaría un marcador inexistente).
 */
function mapEstado(short: string | undefined): string {
  switch (short) {
    // Terminados (jugados y cerrados).
    case 'FT': // Full time
    case 'AET': // After extra time
    case 'PEN': // Penalties
    case 'WO': // Walkover (resultado por no presentación)
      return 'FINALIZADO';
    // En juego.
    case '1H': // Primer tiempo
    case '2H': // Segundo tiempo
    case 'HT': // Entretiempo
    case 'ET': // Tiempo extra
    case 'BT': // Descanso de tiempo extra
    case 'P': // Tanda de penales en curso
    case 'LIVE': // En vivo (genérico)
      return 'EN_CURSO';
    // No iniciado / sin jugar / no concluido: NS, TBD, PST, CANC, SUSP, INT,
    // ABD, AWD, y cualquier otro estado desconocido → PROGRAMADO (no jugado).
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
    const parts = temporadaExterna.split(':');
    let url: string;
    let teamIdNum: number | undefined;

    // Formato POR EQUIPO (recomendado): "team:<teamId>:<season>". Trae TODOS los
    // partidos del equipo en la temporada, de TODAS las competiciones (liga,
    // copa nacional, internacional), no solo una liga. Así aparecen p. ej. los
    // partidos de Copa Chile además de los de Primera División (Req 4.2). El
    // filtrado de amistosos y la clasificación por tipo se hacen aguas arriba.
    if (parts[0] === 'team') {
      const [, teamId, season] = parts;
      if (!teamId || !season) {
        throw new SportsApiError(
          `temporadaExterna inválida: "${temporadaExterna}" (se espera "team:<teamId>:<season>").`,
        );
      }
      url = `${this.baseUrl}/fixtures?team=${encodeURIComponent(teamId)}&season=${encodeURIComponent(season)}`;
      teamIdNum = Number.parseInt(teamId, 10);
    } else {
      // Formato LEGACY por liga: "<leagueId>:<season>[:<teamId>]" (una sola liga).
      const [league, season, teamId] = parts;
      if (!league || !season) {
        throw new SportsApiError(
          `temporadaExterna inválida: "${temporadaExterna}" (se espera "team:<teamId>:<season>" o "<leagueId>:<season>[:<teamId>]").`,
        );
      }
      url = `${this.baseUrl}/fixtures?league=${encodeURIComponent(league)}&season=${encodeURIComponent(season)}`;
      if (teamId) {
        url += `&team=${encodeURIComponent(teamId)}`;
      }
      teamIdNum = teamId ? Number.parseInt(teamId, 10) : undefined;
    }

    // Descarga TODAS las páginas: API-Football pagina la respuesta y, si solo se
    // leyera la primera, se perderían partidos (p. ej. los de Copa Chile podrían
    // caer en páginas siguientes). Se recorren usando `paging.current/total`.
    const items = await this.fetchAllPages<ApiFootballFixtureItem>(url, signal);
    return items.map((item) => this.mapFixture(item, teamIdNum));
  }

  /**
   * Recorre todas las páginas de un endpoint paginado de API-Football y devuelve
   * la unión de `response`. Inspecciona `errors` en cada página y lanza
   * `SportsApiError` si el proveedor reportó un error (cuota/plan/parámetros),
   * en vez de devolver una lista vacía que se confundiría con "sin datos".
   * Tope de seguridad de páginas para no iterar indefinidamente.
   */
  private async fetchAllPages<T>(baseUrl: string, signal: AbortSignal): Promise<readonly T[]> {
    const MAX_PAGINAS = 20;
    const acumulado: T[] = [];
    let pagina = 1;
    let totalPaginas = 1;
    do {
      const sep = baseUrl.includes('?') ? '&' : '?';
      const url = `${baseUrl}${sep}page=${pagina}`;
      const data = await this.request<ApiFootballResponse<T>>(url, signal);
      if (tieneErroresApiFootball(data.errors)) {
        throw new SportsApiError(
          `API deportiva devolvió errores para ${baseUrl}: ${JSON.stringify(data.errors)}`,
        );
      }
      acumulado.push(...(data.response ?? []));
      totalPaginas = data.paging?.total ?? 1;
      pagina += 1;
    } while (pagina <= totalPaginas && pagina <= MAX_PAGINAS);
    return acumulado;
  }

  /**
   * Descarga y mapea la ficha de un partido a `RawFichaPartido`, enriquecida con
   * los goleadores (`fixtures/events`) y las formaciones (`fixtures/lineups`).
   * Hace 3 llamadas al proveedor (fixture, events, lineups); las de events y
   * lineups se toleran vacías (partido sin datos aún) sin fallar la ficha.
   */
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

    const [goleadores, formaciones] = await Promise.all([
      this.fetchGoleadores(partidoExternoId, signal),
      this.fetchFormaciones(partidoExternoId, signal),
    ]);

    // Alineación plana (compat): titulares de ambos equipos.
    const alineacion = formaciones.flatMap((f) => f.titulares);
    // Eventos = goles (mínimo útil para la vista de detalle).
    const eventos = goleadores.map((g) => ({
      minuto: g.minuto,
      tipo: 'gol',
      descripcion: `${g.jugador} (${g.equipo})`,
    }));

    return {
      partidoExternoId,
      resultado: {
        golesLocal: item.goals?.home ?? 0,
        golesVisita: item.goals?.away ?? 0,
      },
      alineacion,
      eventos,
      goleadores,
      formaciones,
    };
  }

  /** Goleadores del partido desde `fixtures/events` (type Goal). */
  private async fetchGoleadores(
    partidoExternoId: string,
    signal: AbortSignal,
  ): Promise<readonly RawGoleador[]> {
    const url = `${this.baseUrl}/fixtures/events?fixture=${encodeURIComponent(partidoExternoId)}`;
    try {
      const data = await this.request<ApiFootballResponse<ApiFootballEventItem>>(url, signal);
      return (data.response ?? []).flatMap((e) => {
        if (e.type !== 'Goal') return [];
        const minuto = e.time?.elapsed;
        const jugador = e.player?.name;
        const equipo = e.team?.name;
        if (minuto === undefined || jugador === undefined || equipo === undefined) return [];
        const g: RawGoleador = { minuto, jugador, equipo };
        return [g];
      });
    } catch {
      return []; // sin eventos disponibles: no romper la ficha
    }
  }

  /** Formaciones por equipo desde `fixtures/lineups`. */
  private async fetchFormaciones(
    partidoExternoId: string,
    signal: AbortSignal,
  ): Promise<readonly RawFormacionEquipo[]> {
    const url = `${this.baseUrl}/fixtures/lineups?fixture=${encodeURIComponent(partidoExternoId)}`;
    try {
      const data = await this.request<ApiFootballResponse<ApiFootballLineupItem>>(url, signal);
      return (data.response ?? []).flatMap((l) => {
        const equipo = l.team?.name;
        if (equipo === undefined) return [];
        const titulares = (l.startXI ?? []).flatMap((s) => {
          const id = s.player?.id;
          const nombre = s.player?.name;
          if (id === undefined || nombre === undefined) return [];
          return [{ id: String(id), nombre }];
        });
        const f: RawFormacionEquipo = {
          equipo,
          ...(l.formation !== undefined ? { formacion: l.formation } : {}),
          titulares,
        };
        return [f];
      });
    } catch {
      return []; // sin lineups disponibles: no romper la ficha
    }
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
    const estado = mapEstado(item.fixture?.status?.short);
    const raw: {
      partidoExternoId?: string;
      competicion?: string;
      rival?: string;
      escudoRivalUrl?: string;
      fechaHora?: string;
      estado?: string;
      resultado?: { golesLocal: number; golesVisita: number };
    } = { estado };
    const id = item.fixture?.id;
    if (id !== undefined) raw.partidoExternoId = String(id);
    if (item.league?.name !== undefined) raw.competicion = item.league.name;

    // Resultado: solo si el partido está FINALIZADO y la API trae goles (evita
    // registrar 0-0 en partidos no jugados). El marcador del fixture es el del
    // equipo LOCAL vs VISITANTE tal como lo reporta la API.
    const golesLocal = item.goals?.home;
    const golesVisita = item.goals?.away;
    if (
      estado === 'FINALIZADO' &&
      typeof golesLocal === 'number' &&
      typeof golesVisita === 'number'
    ) {
      raw.resultado = { golesLocal, golesVisita };
    }

    // Rival = el equipo contrario al del usuario; su escudo se toma del mismo
    // lado (home/away) para poder mostrar las insignias de ambos equipos.
    const home = item.teams?.home;
    const away = item.teams?.away;
    let rival: string | undefined;
    let escudoRival: string | undefined;
    if (teamIdNum !== undefined && home?.id !== undefined && away?.id !== undefined) {
      const usuarioEsLocal = home.id === teamIdNum;
      rival = usuarioEsLocal ? away.name : home.name;
      escudoRival = usuarioEsLocal ? away.logo : home.logo;
    } else {
      rival = away?.name; // sin equipo conocido: aproximación al visitante
      escudoRival = away?.logo;
    }
    if (rival !== undefined) raw.rival = rival;
    if (escudoRival !== undefined) raw.escudoRivalUrl = escudoRival;

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
