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
