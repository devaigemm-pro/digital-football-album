// Motor_Momentos — punto de entrada del módulo de momentos.
//
// Reexporta la abstracción de object storage con capacidad de carga (y su doble
// en memoria) y la carga/captura y agrupación de fotos en el Momento
// (`uploadFoto`).
//
// Task 11.1 — Requirements: 5.1, 5.2, 5.3, 5.4

export { InMemoryObjectStorage } from './object-storage.js';
export type { Binario, ObjectStorage } from './object-storage.js';

export { PartidoNoEncontradoError, uploadFoto, UploadFotoError } from './upload-foto.js';
export type {
  FuenteFoto,
  IdGenerator,
  UploadFotoDeps,
  UploadFotoInput,
  UploadFotoResult,
} from './upload-foto.js';

// Selección de Foto_Principal y regla de edición por cierre (Task 11.2 —
// Requirements: 5.5, 5.6, 5.7).
export {
  assertEditable,
  canEditar,
  EdicionCerradaError,
  FotoNoValidaParaRecuadroError,
  FotoPrincipalError,
  fotosImprimibles,
  RecuadroNoEncontradoError,
  setFotoPrincipal,
} from './foto-principal.js';
export type { Clock, SetFotoPrincipalDeps, SetFotoPrincipalResult } from './foto-principal.js';

// Contexto de asistencia, sub-modalidad, notas y jugador (Task 11.3 —
// Requirements: 6.1, 6.4, 7.1, 7.2, 8.1, 8.2).
export {
  JugadorFueraDeAlineacionError,
  MomentoNoEncontradoError,
  SubModalidadInvalidaError,
  updateMomento,
  UpdateMomentoError,
} from './update-momento.js';
export type { UpdateMomentoDeps, UpdateMomentoPatch } from './update-momento.js';
