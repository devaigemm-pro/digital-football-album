// Presentador de captura de fotos del cliente (Task 28.1).
//
// Requirements (cliente · Requerimiento 3 / backend · Requerimiento 5):
//   3.1 Cargar fotografías desde la galería del dispositivo.
//   3.2 Capturar fotografías directamente con la cámara.
//   3.3 Cargar o capturar VARIAS fotografías para un mismo Partido_Oficial.
//
// Este presentador es TypeScript PURO y agnóstico del framework. Compone dos
// piezas ya existentes/inyectables:
//   - `CaptureViewModel` (reutilizado de `src/app`), que llama al backend
//     `POST /momentos/{partidoId}/fotos` para subir cada foto (Req 3.1–3.3).
//   - `PermissionGate` (`app/src/permissions`), que asegura el permiso del
//     dispositivo ANTES de usar el recurso (Req 24.2): cámara para 'camara',
//     almacenamiento para 'galeria'. Si el permiso se deniega, la subida se
//     cancela sin llamar al backend.
//
// La pantalla RN (`CapturaScreen.tsx`, excluida del typecheck) consume este
// presentador; toda la lógica verificable vive aquí en `.ts`.

import type { Foto, UUID } from '../../../src/domain/types';
import { CaptureViewModel } from '../viewmodels';
import type { CaptureClient, FuenteFoto, UploadFotoInput } from '../viewmodels';
import { Permiso, PermissionGate } from '../permissions';

/** Datos de una foto a capturar para un partido (Req 3.1, 3.2). */
export interface CapturePhotoInput {
  /** Partido oficial al que se asocia la foto. */
  readonly partidoId: UUID;
  /** Origen de la foto: galería (Req 3.1) o cámara (Req 3.2). */
  readonly fuente: FuenteFoto;
  /** Bytes del binario de la foto. */
  readonly binario: Uint8Array;
  /** Ancho en píxeles. */
  readonly anchoPx: number;
  /** Alto en píxeles. */
  readonly altoPx: number;
}

/**
 * Permiso del dispositivo requerido según el origen de la foto (Req 24.2):
 *   - 'camara'  → Permiso.CAMARA (tomar la foto).
 *   - 'galeria' → Permiso.ALMACENAMIENTO (leer de la galería).
 */
export function permisoParaFuente(fuente: FuenteFoto): Permiso {
  return fuente === 'camara' ? Permiso.CAMARA : Permiso.ALMACENAMIENTO;
}

/**
 * Presentador de la pantalla de captura. Enlaza `CaptureViewModel` y
 * `PermissionGate` para: asegurar el permiso correcto según la fuente
 * (Req 24.2), y subir una o varias fotos del mismo partido al backend
 * (Req 3.1, 3.2, 3.3).
 *
 * Inyectable/testeable: recibe el `CaptureClient` (o un `CaptureViewModel` ya
 * construido) y el `PermissionGate`; en pruebas se sustituyen por dobles.
 */
export class CapturePresenter {
  private readonly viewModel: CaptureViewModel;

  constructor(
    clientOrViewModel: CaptureClient | CaptureViewModel,
    private readonly gate: PermissionGate,
  ) {
    this.viewModel =
      clientOrViewModel instanceof CaptureViewModel
        ? clientOrViewModel
        : new CaptureViewModel(clientOrViewModel);
  }

  private static toUploadInput(input: CapturePhotoInput): UploadFotoInput {
    return {
      fuente: input.fuente,
      binario: input.binario,
      anchoPx: input.anchoPx,
      altoPx: input.altoPx,
    };
  }

  /**
   * Captura/carga UNA foto para un partido (Req 3.1, 3.2). Primero asegura el
   * permiso correspondiente a la fuente (Req 24.2): si el usuario no lo concede,
   * lanza `PermisoNoConcedidoError` y NO sube la foto. Con el permiso concedido,
   * sube la foto vía `POST /momentos/{partidoId}/fotos`.
   */
  async capturePhoto(input: CapturePhotoInput): Promise<Foto> {
    const permiso = permisoParaFuente(input.fuente);
    // Req 24.2: asegurar-antes-de-usar; la subida es la acción sobre el recurso.
    return this.gate.runWithPermission(permiso, () =>
      this.viewModel.uploadFoto(
        input.partidoId,
        CapturePresenter.toUploadInput(input),
      ),
    );
  }

  /**
   * Captura/carga VARIAS fotos para el MISMO partido (Req 3.3). Cada foto se
   * asegura con su permiso según la fuente (Req 24.2) y se sube al mismo
   * `partidoId`. Devuelve las `Foto` creadas en el orden de entrada.
   *
   * Las subidas se ejecutan en serie para preservar el orden y no disparar
   * múltiples prompts de permiso en paralelo. Si alguna se cancela por permiso
   * denegado, el error se propaga (la pantalla decide cómo mostrarlo).
   */
  async capturePhotos(
    partidoId: UUID,
    fotos: readonly Omit<CapturePhotoInput, 'partidoId'>[],
  ): Promise<Foto[]> {
    const resultados: Foto[] = [];
    for (const foto of fotos) {
      resultados.push(await this.capturePhoto({ ...foto, partidoId }));
    }
    return resultados;
  }
}

// Detalle del Momento: Foto_Principal + contexto de asistencia (Task 28.2).
export {
  MomentoBusinessError,
  MomentoDetailPresenter,
  normalizarContexto,
} from './momento-detail-presenter';
