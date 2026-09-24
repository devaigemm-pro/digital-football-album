// Motor_Momentos — carga/captura y agrupación de fotos en el Momento
// (`uploadFoto`).
//
// Al cargar (desde la galería — Req 5.1) o capturar (dentro de la app — Req 5.2)
// una fotografía para un `PartidoOficial`, el Motor_Momentos:
//   1. sube los bytes del binario al object storage y obtiene su `objectKey`;
//   2. asegura el `Momento` del partido (relación 1:1 con `PartidoOficial`),
//      creándolo si aún no existe;
//   3. crea una `Foto` agrupada bajo ese `Momento` (Req 5.4).
//
// El partido admite **múltiples fotos**: cada llamada agrega una `Foto` más al
// mismo `Momento`, de modo que todas las fotos cargadas para el partido quedan
// agrupadas en su único Momento (Req 5.3, 5.4).
//
// Este módulo NO selecciona la Foto_Principal (Task 11.2) ni edita el contexto,
// notas o votación del Momento (Task 11.3): solo agrupa fotos. El I/O de
// almacenamiento se aísla detrás de `ObjectStorage` para permitir pruebas con
// dobles en memoria.
//
// Task 11.1 — Requirements: 5.1, 5.2, 5.3, 5.4

import type { ContextoAsistencia, Foto, Momento, UUID } from '../../domain/types.js';
import type {
  FotoRepository,
  MomentoRepository,
  PartidoOficialRepository,
} from '../../persistence/repositories.js';
import type { Binario, ObjectStorage } from './object-storage.js';

/** Fuente de la fotografía: galería del dispositivo (Req 5.1) o cámara (Req 5.2). */
export type FuenteFoto = 'galeria' | 'camara';

/** Generador de UUID inyectable para las entidades nuevas. */
export type IdGenerator = () => UUID;

/** Error base de la carga/captura de fotos. */
export class UploadFotoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UploadFotoError';
  }
}

/** Se lanza cuando el `partidoId` no corresponde a ningún `PartidoOficial`. */
export class PartidoNoEncontradoError extends UploadFotoError {
  constructor(public readonly partidoId: UUID) {
    super(`No existe un PartidoOficial con id ${partidoId}`);
    this.name = 'PartidoNoEncontradoError';
  }
}

/** Datos de una fotografía a cargar o capturar para un partido. */
export interface UploadFotoInput {
  /** Origen de la fotografía: galería (Req 5.1) o cámara (Req 5.2). */
  readonly fuente: FuenteFoto;
  /** Bytes del binario de la foto a subir al object storage. */
  readonly binario: Binario;
  /** Ancho en píxeles (para la verificación posterior de 300 DPI — Req 19.1). */
  readonly anchoPx: number;
  /** Alto en píxeles (para la verificación posterior de 300 DPI — Req 19.1). */
  readonly altoPx: number;
}

/** Dependencias inyectadas de `uploadFoto`. */
export interface UploadFotoDeps {
  /** Partidos oficiales; valida que el `partidoId` exista. Requerido. */
  readonly partidos: PartidoOficialRepository;
  /** Momentos; asegura el Momento 1:1 del partido. Requerido. */
  readonly momentos: MomentoRepository;
  /** Fotos; persiste cada foto agrupada en el Momento. Requerido. */
  readonly fotos: FotoRepository;
  /** Object storage con capacidad de subida de binarios. Requerido. */
  readonly storage: ObjectStorage;
  /** Generador de ids; por defecto `crypto.randomUUID`. */
  readonly newId?: IdGenerator;
}

/** Resultado de una carga/captura: la foto creada y el Momento que la agrupa. */
export interface UploadFotoResult {
  /** Foto recién creada y agrupada en el Momento del partido. */
  readonly foto: Foto;
  /** Momento del partido (existente o recién creado) que agrupa la foto. */
  readonly momento: Momento;
  /** `true` si el Momento se creó en esta llamada; `false` si ya existía. */
  readonly momentoCreado: boolean;
}

/** Contexto por defecto de un Momento recién creado (se ajusta luego en Task 11.3). */
const CONTEXTO_POR_DEFECTO: ContextoAsistencia = 'TRANSMISION';

/**
 * Asegura el `Momento` del partido (relación 1:1 con `PartidoOficial`): devuelve
 * el existente o crea uno nuevo con valores por defecto. El contexto, la
 * sub-modalidad, las notas y el jugador se editan por separado (Task 11.3).
 */
async function asegurarMomento(
  partidoId: UUID,
  deps: UploadFotoDeps,
  newId: IdGenerator,
): Promise<{ momento: Momento; creado: boolean }> {
  const existente = await deps.momentos.findByPartidoOficialId(partidoId);
  if (existente !== null) {
    return { momento: existente, creado: false };
  }
  const momento: Momento = {
    id: newId(),
    partidoOficialId: partidoId,
    contextoAsistencia: CONTEXTO_POR_DEFECTO,
    subModalidad: null,
    geoVerificado: false,
    notas: '',
    jugadorDelPartido: null,
  };
  const creado = await deps.momentos.create(momento);
  return { momento: creado, creado: true };
}

/**
 * Carga (galería) o captura (cámara) una fotografía para un `PartidoOficial`:
 * sube su binario al object storage, asegura el Momento 1:1 del partido y crea
 * una `Foto` agrupada bajo ese Momento. Cada llamada agrega una foto más, de
 * modo que un partido puede acumular múltiples fotos en su único Momento
 * (Req 5.1–5.4).
 *
 * @param partidoId Partido oficial al que se asocia la foto.
 * @param input Fuente, binario y dimensiones en píxeles de la fotografía.
 * @param deps Repositorios, object storage y generador de ids opcional.
 * @returns La foto creada, el Momento que la agrupa y si el Momento se creó.
 * @throws PartidoNoEncontradoError si `partidoId` no existe.
 */
export async function uploadFoto(
  partidoId: UUID,
  input: UploadFotoInput,
  deps: UploadFotoDeps,
): Promise<UploadFotoResult> {
  const newId: IdGenerator = deps.newId ?? ((): UUID => crypto.randomUUID());

  // 1. Validar que el partido exista antes de subir bytes.
  const partido = await deps.partidos.findById(partidoId);
  if (partido === null) {
    throw new PartidoNoEncontradoError(partidoId);
  }

  // 2. Asegurar el Momento 1:1 del partido (crearlo si es la primera foto).
  const { momento, creado } = await asegurarMomento(partidoId, deps, newId);

  // 3. Subir los bytes al object storage y obtener la `objectKey`.
  const objectKey = await deps.storage.upload(input.binario);

  // 4. Crear la Foto agrupada bajo el Momento (Req 5.4). Nace `ASOCIADA` al
  //    Momento del partido; el enlace a la ficha técnica (Req 9.4/9.5) es
  //    responsabilidad de `linkFoto` (Task 8.4), fuera de este módulo.
  const foto = await deps.fotos.create({
    id: newId(),
    momentoId: momento.id,
    objectKey,
    anchoPx: input.anchoPx,
    altoPx: input.altoPx,
    estadoAsociacion: 'ASOCIADA',
  });

  return { foto, momento, momentoCreado: creado };
}
