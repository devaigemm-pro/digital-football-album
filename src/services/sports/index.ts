// Servicio_Datos_Deportivos — punto de entrada del módulo del cliente deportivo.
//
// Reexporta la interfaz mockeable (`SportsApiClient`), su transporte
// (`SportsApiTransport`), los DTO crudos, el cliente resiliente concreto y sus
// errores tipados.
//
// Task 8.1 — Requirements: 9.1, 9.6

export {
  DEFAULT_BACKOFF_SCHEDULE_MS,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_TIMEOUT_MS,
  ResilientSportsApiClient,
} from './client.js';
export type { ResilientSportsApiClientOptions, Sleep } from './client.js';
export { SportsApiError, SportsApiRetriesExhaustedError, SportsApiTimeoutError } from './errors.js';
export { syncFixture } from './sync-fixture.js';
export type {
  DiscardLogger,
  FixtureDescartado,
  FixtureSaneado,
  MotivoDescarte,
  SyncFixtureOptions,
  SyncFixtureResult,
} from './sync-fixture.js';
export type {
  RawEventoPartido,
  RawFichaPartido,
  RawFixture,
  RawJugadorAlineacion,
  RawResultado,
  SportsApiClient,
  SportsApiTransport,
} from './types.js';

// Task 8.4 — `syncPartidoFinalizado` (Req 9.3), `linkFoto` (Req 9.4, 9.5) y
// la interfaz `Notifier` local del módulo (Req 9.5).
export {
  PartidoNoEncontradoError,
  syncPartidoFinalizado,
  SyncFinalizadoError,
} from './sync-finalizado.js';
export type { SyncPartidoFinalizadoOptions } from './sync-finalizado.js';
export { FotoNoEncontradaError, linkFoto, LinkFotoError } from './link-foto.js';
export type {
  CandidateResolver,
  LinkFotoEnlazada,
  LinkFotoOptions,
  LinkFotoPendiente,
  LinkFotoResult,
} from './link-foto.js';
export type { AvisoAsociacionPendiente, MotivoAsociacionFallida, Notifier } from './notifier.js';
export { deriveAlbum } from './album-derivation.js';
export type {
  DeriveAlbumDeps,
  DeriveAlbumResult,
  FixtureEntry,
  IdGenerator,
} from './album-derivation.js';
