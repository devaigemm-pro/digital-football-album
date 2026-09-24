// Servicio_Datos_Deportivos — contratos de datos del cliente de la API deportiva.
//
// Este módulo define las formas de petición/respuesta que expone el
// `SportsApiClient` (interfaz mockeable) y que consume la capa de red concreta.
// Los tipos son deliberadamente crudos ("raw"): reflejan lo que devuelve la API
// externa antes de cualquier saneamiento (que corresponde a la Task 8.2,
// `syncFixture`). Mantenerlos aislados del dominio permite que la Task 8.2
// mapee/valide estos DTO hacia `PartidoOficial` sin acoplar el transporte al
// modelo interno.
//
// Task 8.1 — Requirements: 9.1, 9.6

/** Fixture crudo de un partido tal como lo entrega la API deportiva externa. */
export interface RawFixture {
  /** Identificador externo del partido en la API. Puede faltar/ser inválido. */
  readonly partidoExternoId?: string;
  /** Competición reportada por la API. */
  readonly competicion?: string;
  /** Rival reportado por la API. */
  readonly rival?: string;
  /** Fecha/hora ISO 8601 del partido. Puede faltar/ser inválida. */
  readonly fechaHora?: string;
  /** Estado del partido reportado por la API. */
  readonly estado?: string;
}

/** Resultado final crudo de un partido finalizado. */
export interface RawResultado {
  readonly golesLocal: number;
  readonly golesVisita: number;
}

/** Jugador crudo de la alineación inicial. */
export interface RawJugadorAlineacion {
  readonly id: string;
  readonly nombre: string;
}

/** Evento clave crudo del partido (gol, tarjeta, etc.). */
export interface RawEventoPartido {
  readonly minuto: number;
  readonly tipo: string;
  readonly descripcion?: string;
}

/**
 * Ficha técnica cruda de un partido finalizado: resultado, alineación inicial y
 * eventos clave (Req 9.3).
 */
export interface RawFichaPartido {
  readonly partidoExternoId: string;
  readonly resultado: RawResultado;
  readonly alineacion: readonly RawJugadorAlineacion[];
  readonly eventos: readonly RawEventoPartido[];
}

/** Equipo real de la API deportiva (búsqueda por nombre — onboarding). */
export interface RawEquipo {
  /** Identificador externo del equipo en la API. */
  readonly id: string;
  /** Nombre del equipo. */
  readonly nombre: string;
  /** País del equipo (para desambiguar homónimos). */
  readonly pais?: string;
  /** URL del escudo/logo del equipo. */
  readonly escudoUrl?: string;
}

/** Liga real en la que participa un equipo, con las temporadas disponibles. */
export interface RawLigaEquipo {
  /** Identificador externo de la liga en la API. */
  readonly ligaId: string;
  /** Nombre de la liga/competición. */
  readonly nombre: string;
  /** Tipo reportado por la API (`League`/`Cup`). */
  readonly tipo?: string;
  /** Años de temporada disponibles para esa liga y equipo. */
  readonly temporadas: readonly number[];
}

/** País disponible en la API deportiva (onboarding por país). */
export interface RawPais {
  /** Nombre del país (p. ej. "Chile"). */
  readonly nombre: string;
  /** Código del país (p. ej. "CL"), si la API lo reporta. */
  readonly codigo?: string;
  /** URL de la bandera del país. */
  readonly banderaUrl?: string;
}

/** Liga/división de un país (onboarding: elegir división). */
export interface RawLigaPais {
  readonly ligaId: string;
  readonly nombre: string;
  /** `League` (liga/división) o `Cup` (copa). */
  readonly tipo?: string;
  readonly logoUrl?: string;
}

/**
 * Cliente de la API deportiva externa (Req 9). Es la abstracción **mockeable**
 * de la que dependen los servicios de dominio: en pruebas se sustituye por un
 * doble en memoria y nunca se toca la red.
 *
 * La implementación concreta (`ResilientSportsApiClient`) envuelve el transporte
 * HTTP con un timeout de 30 s por petición y una política de reintentos acotada
 * (≤3 intentos, backoff creciente) que no bloquea al usuario (Req 9.1, 9.6).
 */
export interface SportsApiClient {
  /**
   * Obtiene los fixtures (calendario) de una temporada externa desde la API
   * deportiva (Req 9.1). El saneamiento de registros inválidos es
   * responsabilidad de `syncFixture` (Task 8.2), no de este cliente.
   */
  fetchFixtures(temporadaExterna: string, signal?: AbortSignal): Promise<readonly RawFixture[]>;

  /**
   * Obtiene la ficha técnica (resultado, alineación, eventos) de un partido
   * finalizado identificado por su id externo (Req 9.3).
   */
  fetchFichaPartido(partidoExternoId: string, signal?: AbortSignal): Promise<RawFichaPartido>;

  /**
   * Busca equipos reales por nombre (onboarding: el usuario elige su equipo).
   * Devuelve una lista con id, nombre, país y escudo.
   */
  searchTeams(query: string, signal?: AbortSignal): Promise<readonly RawEquipo[]>;

  /**
   * Lista las ligas/competiciones en las que participa un equipo para una
   * temporada dada, con las temporadas disponibles (onboarding: elegir liga).
   */
  leaguesForTeam(
    teamId: string,
    season: number,
    signal?: AbortSignal,
  ): Promise<readonly RawLigaEquipo[]>;

  /** Lista los países disponibles (onboarding: elegir país). */
  listCountries(signal?: AbortSignal): Promise<readonly RawPais[]>;

  /**
   * Lista las ligas/divisiones de un país para una temporada (onboarding:
   * elegir división antes de ver los equipos).
   */
  leaguesByCountry(
    country: string,
    season: number,
    signal?: AbortSignal,
  ): Promise<readonly RawLigaPais[]>;

  /**
   * Lista los equipos de una liga en una temporada, con su logo (onboarding:
   * elegir el equipo dentro de la división).
   */
  teamsByLeague(
    ligaId: string,
    season: number,
    signal?: AbortSignal,
  ): Promise<readonly RawEquipo[]>;
}

/**
 * Transporte HTTP de bajo nivel. Se inyecta en el cliente concreto para que las
 * pruebas unitarias nunca alcancen la red: un doble in-memory implementa esta
 * interfaz. Cada llamada recibe un `AbortSignal` con el que el cliente aplica el
 * timeout de 30 s y la cancelación entre reintentos.
 */
export interface SportsApiTransport {
  /**
   * Realiza una petición GET a un recurso relativo de la API y devuelve el
   * cuerpo ya deserializado. Debe respetar el `AbortSignal` recibido y rechazar
   * con un error si la petición se aborta o la respuesta no es satisfactoria.
   */
  get<T>(path: string, signal: AbortSignal): Promise<T>;
}
