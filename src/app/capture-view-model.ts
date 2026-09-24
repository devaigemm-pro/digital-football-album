// CaptureViewModel — captura de momentos desde la App_Móvil (Req 5.1, 5.2, 6.1).
//
// Orquesta, del lado de la presentación, el flujo de captura de un momento del
// partido (design.md · "App_Móvil (presentación y captura)"):
//   1. Cargar (galería — Req 5.1) o capturar (cámara — Req 5.2) una fotografía y
//      subirla al backend (`POST /momentos/{partidoId}/fotos`).
//   2. Seleccionar esa fotografía como Foto_Principal del Recuadro del partido
//      (`PUT /recuadros/{recuadroId}/foto-principal` — Req 5.5).
//   3. Marcar el contexto de asistencia del Momento (En Vivo Local / Visita /
//      Transmisión) y datos asociados (`PATCH /momentos/{momentoId}` — Req 6.1).
//
// El view-model no reimplementa reglas de negocio (biunivocidad, ventana de
// edición, validación de sub-modalidad): esas viven en el backend. Solo compone
// las llamadas del cliente en el orden que exige la UI y expone el resultado.
//
// Es framework-agnóstico y unit-testable: depende solo de `CaptureClient`
// (interfaz inyectable), sustituible por un cliente en memoria en pruebas.
//
// Task 21.1 — Requirements: 5.1, 5.2, 6.1

import type { Foto, Momento, Recuadro, UUID } from '../domain/types.js';
import type {
  CaptureClient,
  FuenteFoto,
  MomentoContextoInput,
  UploadFotoInput,
} from './backend-clients.js';

/**
 * Parámetros del flujo de captura de un momento (Req 5.1, 5.2, 6.1). Modela una
 * captura completa: la foto a subir, el Recuadro donde se montará como
 * Foto_Principal y el contexto de asistencia a marcar.
 */
export interface CaptureMomentInput {
  /** Partido oficial al que pertenece el momento. */
  readonly partidoId: UUID;
  /** Recuadro del partido cuya Foto_Principal se fijará (Req 5.5). */
  readonly recuadroId: UUID;
  /** Momento del partido cuyo contexto de asistencia se marcará (Req 6.1). */
  readonly momentoId: UUID;
  /** Fotografía a cargar/capturar (Req 5.1, 5.2). */
  readonly foto: UploadFotoInput;
  /**
   * Si `true` (por defecto), la foto subida se marca como Foto_Principal del
   * Recuadro. Si `false`, solo se agrega al Momento sin volverla principal.
   */
  readonly comoFotoPrincipal?: boolean;
  /** Contexto de asistencia y datos a marcar en el Momento (Req 6.1). Opcional. */
  readonly contexto?: MomentoContextoInput;
}

/** Resultado de un flujo de captura completo. */
export interface CaptureMomentResult {
  /** Foto cargada/capturada y agrupada en el Momento (Req 5.1, 5.2). */
  readonly foto: Foto;
  /** Recuadro con la Foto_Principal fijada, o `null` si no se marcó (Req 5.5). */
  readonly recuadro: Recuadro | null;
  /** Momento con el contexto aplicado, o `null` si no se marcó contexto (Req 6.1). */
  readonly momento: Momento | null;
}

/**
 * View-model de captura de momentos. Compone las llamadas de captura del
 * `CaptureClient` según lo que la pantalla de captura necesita (Req 5.1, 5.2,
 * 6.1).
 */
export class CaptureViewModel {
  constructor(private readonly client: CaptureClient) {}

  /**
   * Sube una foto para un partido desde la galería (Req 5.1) o la cámara
   * (Req 5.2) y devuelve la `Foto` creada. Atajo para las pantallas que solo
   * cargan/capturan sin fijar Foto_Principal ni contexto.
   */
  async uploadFoto(partidoId: UUID, input: UploadFotoInput): Promise<Foto> {
    return this.client.uploadFoto(partidoId, input);
  }

  /**
   * Marca una foto como Foto_Principal del Recuadro (Req 5.5), delegando la
   * regla de a-lo-sumo-una y la ventana de edición al backend.
   */
  async setFotoPrincipal(recuadroId: UUID, fotoId: UUID): Promise<Recuadro> {
    return this.client.setFotoPrincipal(recuadroId, fotoId);
  }

  /**
   * Marca el contexto de asistencia (y datos asociados) de un Momento (Req 6.1),
   * delegando la validación al backend.
   */
  async marcarContexto(momentoId: UUID, contexto: MomentoContextoInput): Promise<Momento> {
    return this.client.updateMomento(momentoId, contexto);
  }

  /**
   * Ejecuta el flujo de captura completo de un momento (Req 5.1, 5.2, 5.5, 6.1):
   *   1. sube/captura la foto (galería o cámara);
   *   2. si `comoFotoPrincipal` (por defecto), la fija como Foto_Principal del
   *      Recuadro;
   *   3. si se proporciona `contexto`, marca el contexto de asistencia del
   *      Momento.
   *
   * Los pasos 2 y 3 son opcionales; se omiten según la entrada. Devuelve las
   * entidades resultantes de cada paso ejecutado.
   */
  async capturarMomento(input: CaptureMomentInput): Promise<CaptureMomentResult> {
    const foto = await this.client.uploadFoto(input.partidoId, input.foto);

    const marcarPrincipal = input.comoFotoPrincipal ?? true;
    const recuadro = marcarPrincipal
      ? await this.client.setFotoPrincipal(input.recuadroId, foto.id)
      : null;

    const momento =
      input.contexto !== undefined
        ? await this.client.updateMomento(input.momentoId, input.contexto)
        : null;

    return { foto, recuadro, momento };
  }
}

/** Reexport del tipo de fuente para las pantallas de captura (galería/cámara). */
export type { FuenteFoto };
