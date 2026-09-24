// Capa de persistencia: repositorios tipados y sus implementaciones.
//
// Expone los contratos de repositorio (mockeables en pruebas de dominio puro) y
// las implementaciones en memoria (test doubles). El driver real de PostgreSQL
// se añadirá más adelante implementando estas mismas interfaces.
//
// Task 2.3 — Requirements: 5.4, 7.2, 8.2

// Contrato CRUD genérico y tipos auxiliares.
export type { Entity, Patch, Repository } from './repository.js';

// Errores tipados de la capa de persistencia.
export {
  DuplicateIdError,
  NotFoundError,
  PersistenceError,
  UniqueConstraintError,
} from './errors.js';

// Interfaces de repositorio por entidad del dominio.
export type {
  AlbumRepository,
  ClubRepository,
  ConfigAdminRepository,
  DireccionEnvioRepository,
  FotoRepository,
  MomentoRepository,
  PartidoOficialRepository,
  PedidoRepository,
  PlantillaAlbumRepository,
  RecuadroRepository,
  RefreshTokenRepository,
  RivalidadRepository,
  SuscripcionRepository,
  TemporadaRepository,
  UsuarioRepository,
} from './repositories.js';

// Agregado de repositorios (Unit of Work).
export type { Repositories } from './unit-of-work.js';

// Implementaciones en memoria (test doubles) y su factoría.
export * from './in-memory/index.js';

// Driver real respaldado por Supabase (PostgreSQL vía PostgREST).
export {
  createSupabaseClient,
  createSupabaseRepositories,
  supabaseConfigFromEnv,
  SupabaseObjectStorage,
  type SupabaseConfig,
  type SupabaseObjectStorageOptions,
  type TypedSupabaseClient,
} from './supabase/index.js';

// Selector de driver por entorno (composition root de la capa de persistencia).
export {
  createRepositories,
  type CreateRepositoriesOptions,
  type PersistenceContext,
  type PersistenceDriver,
} from './create-repositories.js';
