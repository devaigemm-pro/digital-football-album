// Motor_Momentos — selección de Foto_Principal y regla de edición por cierre
// (`setFotoPrincipal`).
//
// El usuario elige, por Recuadro, una única Foto_Principal: la fotografía que se
// monta e imprime en ese Recuadro (glosario · Foto_Principal). Marcar una foto
// registra esa fotografía como la ÚNICA Foto_Principal del Recuadro, de modo que
// re-marcar reemplaza la anterior y nunca hay más de una (Req 5.5;
// design.md · "`fotoPrincipalId` a lo sumo uno"). Las demás fotos del Momento se
// conservan pero quedan excluidas de la impresión: el conjunto imprimible de un
// Recuadro es exactamente la Foto_Principal, o vacío si no hay ninguna (Req 5.6).
//
// La edición (cambiar la Foto_Principal, o agregar/reemplazar fotos de un
// partido) solo se permite mientras la Temporada esté `ACTIVA` y el instante
// actual sea anterior a `Fecha_Límite_Cierre` (Req 5.7;
// design.md · Motor_Momentos · `PUT /recuadros/{recuadroId}/foto-principal`). La
// guarda `canEditar(temporada, now)` centraliza esa condición y se reutiliza
// desde el llamador de `uploadFoto` para gobernar también las altas/reemplazos
// de fotos, sin reescribir el núcleo de `uploadFoto` (Task 11.1).
//
// El instante actual se inyecta como reloj (`now`) para pruebas deterministas,
// en paralelo con `ConfigAdminService` (Task 16.1). El módulo depende solo de
// las interfaces de repositorio, por lo que se ejercita con los dobles en
// memoria sin PostgreSQL vivo.
//
// Task 11.2 — Requirements: 5.5, 5.6, 5.7

import type { Foto, Recuadro, Temporada, UUID } from '../../domain/types.js';
import type {
  FotoRepository,
  MomentoRepository,
  PartidoOficialRepository,
  RecuadroRepository,
  TemporadaRepository,
} from '../../persistence/repositories.js';

/** Reloj inyectable: devuelve el instante actual en epoch ms. Por defecto `Date.now`. */
export type Clock = () => number;

/** Error base de la selección de Foto_Principal. */
export class FotoPrincipalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FotoPrincipalError';
  }
}

/** Se lanza cuando el `recuadroId` no corresponde a ningún Recuadro. */
export class RecuadroNoEncontradoError extends FotoPrincipalError {
  constructor(public readonly recuadroId: UUID) {
    super(`No existe un Recuadro con id ${recuadroId}`);
    this.name = 'RecuadroNoEncontradoError';
  }
}

/**
 * Se lanza cuando la `fotoId` no existe o no pertenece al Momento del partido
 * del Recuadro. Solo una foto agrupada en el Momento del propio partido puede
 * ser su Foto_Principal (glosario · Foto_Principal / Momento).
 */
export class FotoNoValidaParaRecuadroError extends FotoPrincipalError {
  constructor(
    public readonly recuadroId: UUID,
    public readonly fotoId: UUID,
  ) {
    super(`La Foto ${fotoId} no existe o no pertenece al Momento del Recuadro ${recuadroId}`);
    this.name = 'FotoNoValidaParaRecuadroError';
  }
}

/**
 * Se lanza al intentar editar la Foto_Principal (o agregar/reemplazar fotos)
 * cuando la Temporada no está `ACTIVA` o el instante actual ya alcanzó la
 * `Fecha_Límite_Cierre` (Req 5.7). La capa API la mapea a `409 Conflict`.
 */
export class EdicionCerradaError extends FotoPrincipalError {
  constructor(
    public readonly temporadaId: UUID,
    public readonly motivo: 'TEMPORADA_NO_ACTIVA' | 'FECHA_LIMITE_ALCANZADA',
  ) {
    super(
      motivo === 'TEMPORADA_NO_ACTIVA'
        ? `La Temporada ${temporadaId} no está ACTIVA: la edición está cerrada`
        : `La Temporada ${temporadaId} alcanzó la Fecha_Límite_Cierre: la edición está cerrada`,
    );
    this.name = 'EdicionCerradaError';
  }
}

/** Dependencias inyectadas de `setFotoPrincipal`. */
export interface SetFotoPrincipalDeps {
  /** Recuadros; localiza el Recuadro y registra su `fotoPrincipalId`. Requerido. */
  readonly recuadros: RecuadroRepository;
  /** Partidos oficiales; resuelve el partido del Recuadro. Requerido. */
  readonly partidos: PartidoOficialRepository;
  /** Momentos; obtiene el Momento del partido para validar la foto. Requerido. */
  readonly momentos: MomentoRepository;
  /** Fotos; valida que la foto exista y pertenezca al Momento. Requerido. */
  readonly fotos: FotoRepository;
  /** Temporadas; provee el estado y la `Fecha_Límite_Cierre` para la guarda. Requerido. */
  readonly temporadas: TemporadaRepository;
  /** Reloj para evaluar la guarda de edición; por defecto `Date.now`. */
  readonly now?: Clock;
}

/** Resultado de marcar una Foto_Principal: el Recuadro actualizado y su foto. */
export interface SetFotoPrincipalResult {
  /** Recuadro con `fotoPrincipalId` ya actualizado (a lo sumo una). */
  readonly recuadro: Recuadro;
  /** Foto que quedó registrada como la única Foto_Principal del Recuadro. */
  readonly fotoPrincipal: Foto;
}

/**
 * Guarda de edición por cierre (Req 5.7). La edición de un álbum —cambiar la
 * Foto_Principal de un Recuadro o agregar/reemplazar fotos de un partido— se
 * permite **si y solo si** la Temporada está `ACTIVA` y el instante `now` es
 * **estrictamente anterior** a la `Fecha_Límite_Cierre`.
 *
 * Se expone de forma independiente para que el llamador de `uploadFoto`
 * (Task 11.1) reutilice exactamente la misma condición al gobernar las
 * altas/reemplazos de fotos, sin duplicar la regla ni reescribir `uploadFoto`.
 *
 * @param temporada Temporada del álbum en edición.
 * @param now Instante actual en epoch ms.
 * @returns `true` si la edición está permitida; `false` en caso contrario.
 */
export function canEditar(temporada: Temporada, now: number): boolean {
  if (temporada.estado !== 'ACTIVA') {
    return false;
  }
  const limite = Date.parse(temporada.fechaLimiteCierre);
  // Una fecha límite inválida se trata como no editable (fail-closed): nunca se
  // permite editar sin una ventana de cierre bien definida.
  if (Number.isNaN(limite)) {
    return false;
  }
  return now < limite;
}

/**
 * Conjunto de fotos **imprimibles** de un Recuadro (Req 5.6). Es exactamente la
 * Foto_Principal, o el conjunto vacío si el Recuadro no tiene Foto_Principal
 * asignada. Las demás fotos del Recuadro/Momento se conservan pero quedan
 * excluidas de los archivos de impresión.
 *
 * @param recuadro Recuadro cuyo `fotoPrincipalId` determina lo imprimible.
 * @param fotosDelRecuadro Fotos disponibles (p. ej. las del Momento del partido).
 * @returns `[fotoPrincipal]` si existe y está entre las fotos dadas; `[]` si no.
 */
export function fotosImprimibles(recuadro: Recuadro, fotosDelRecuadro: readonly Foto[]): Foto[] {
  if (recuadro.fotoPrincipalId === null) {
    return [];
  }
  const principal = fotosDelRecuadro.find((f) => f.id === recuadro.fotoPrincipalId);
  return principal !== undefined ? [principal] : [];
}

/**
 * Registra `fotoId` como la **única** Foto_Principal del Recuadro (Req 5.5).
 * Reemplaza cualquier Foto_Principal previa, de modo que el Recuadro siempre
 * tiene a lo sumo una y coincide con la última fotografía marcada.
 *
 * La operación solo procede si la edición está permitida por la guarda de
 * cierre (`canEditar`): Temporada `ACTIVA` y antes de la `Fecha_Límite_Cierre`
 * (Req 5.7); en caso contrario se lanza `EdicionCerradaError` y no se modifica
 * el Recuadro.
 *
 * La foto debe existir y pertenecer al Momento del partido del Recuadro (solo
 * las fotos del propio partido pueden imprimirse en su Recuadro); de lo
 * contrario se lanza `FotoNoValidaParaRecuadroError`.
 *
 * @param recuadroId Recuadro cuya Foto_Principal se fija.
 * @param fotoId Foto a registrar como Foto_Principal.
 * @param deps Repositorios y reloj inyectados.
 * @returns El Recuadro actualizado y la foto que quedó como Foto_Principal.
 * @throws RecuadroNoEncontradoError si el Recuadro no existe.
 * @throws EdicionCerradaError si la Temporada no está ACTIVA o ya cerró.
 * @throws FotoNoValidaParaRecuadroError si la foto no pertenece al Momento del partido.
 */
export async function setFotoPrincipal(
  recuadroId: UUID,
  fotoId: UUID,
  deps: SetFotoPrincipalDeps,
): Promise<SetFotoPrincipalResult> {
  const now: Clock = deps.now ?? ((): number => Date.now());

  // 1. Localizar el Recuadro.
  const recuadro = await deps.recuadros.findById(recuadroId);
  if (recuadro === null) {
    throw new RecuadroNoEncontradoError(recuadroId);
  }

  // 2. Resolver el partido y su Temporada, y aplicar la guarda de cierre (5.7).
  const partido = await deps.partidos.findById(recuadro.partidoOficialId);
  if (partido === null) {
    // El Recuadro referencia un partido inexistente: no se puede validar la
    // ventana de edición, por lo que la operación no puede proceder.
    throw new FotoNoValidaParaRecuadroError(recuadroId, fotoId);
  }
  const temporada = await deps.temporadas.findById(partido.temporadaId);
  if (temporada === null) {
    throw new FotoNoValidaParaRecuadroError(recuadroId, fotoId);
  }
  assertEditable(temporada, now());

  // 3. Validar que la foto exista y pertenezca al Momento del partido.
  const momento = await deps.momentos.findByPartidoOficialId(recuadro.partidoOficialId);
  const foto = await deps.fotos.findById(fotoId);
  if (momento === null || foto === null || foto.momentoId !== momento.id) {
    throw new FotoNoValidaParaRecuadroError(recuadroId, fotoId);
  }

  // 4. Registrar la foto como la ÚNICA Foto_Principal (reemplaza la anterior).
  const actualizado = await deps.recuadros.update(recuadroId, {
    fotoPrincipalId: fotoId,
  });

  return { recuadro: actualizado, fotoPrincipal: foto };
}

/**
 * Aplica la guarda de edición por cierre y lanza `EdicionCerradaError` con el
 * motivo preciso si la edición no está permitida (Req 5.7). Reutiliza
 * `canEditar` para la decisión y solo añade el diagnóstico del motivo.
 *
 * Se exporta para que el llamador de `uploadFoto` (Task 11.1) imponga la misma
 * guarda antes de agregar/reemplazar fotos de un partido.
 *
 * @param temporada Temporada del álbum en edición.
 * @param now Instante actual en epoch ms.
 * @throws EdicionCerradaError si la Temporada no está ACTIVA o ya cerró.
 */
export function assertEditable(temporada: Temporada, now: number): void {
  if (canEditar(temporada, now)) {
    return;
  }
  const motivo = temporada.estado !== 'ACTIVA' ? 'TEMPORADA_NO_ACTIVA' : 'FECHA_LIMITE_ALCANZADA';
  throw new EdicionCerradaError(temporada.id, motivo);
}
