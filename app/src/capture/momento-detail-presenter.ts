// Presentador de detalle del Momento: Foto_Principal + contexto de asistencia
// (Task 28.2).
//
// Requirements (cliente · Requerimiento 3 / backend · Requerimientos 5 y 6):
//   3.4 Asociar cada foto cargada/capturada al Momento del Partido_Oficial.
//   3.5 Marcar UNA fotografía como Foto_Principal del Recuadro (a lo sumo una).
//   3.6 Almacenar las fotos no-principales sin incluirlas en impresión.
//   3.7 Permitir cambiar la Foto_Principal / reemplazar fotos ANTES del cierre.
//   3.8 Marcar el Contexto_Asistencia (En Vivo Local / Visita / Transmisión) y,
//       en Transmisión, la sub-modalidad (Televisión / Bar / Streaming); notas y
//       Jugador_del_Partido.
//   3.9 Verificación opcional por geolocalización en contextos En Vivo.
//   3.13 REFLEJAR los errores de negocio del backend (biunivocidad de la
//        Foto_Principal, ventana de edición, sub-modalidad solo en Transmisión,
//        Jugador_del_Partido dentro de la alineación) en la UI.
//
// AUTORIDAD DE LAS REGLAS DE NEGOCIO = BACKEND.
// -------------------------------------------------------------------
// Este presentador es un CLIENTE DELGADO. NO reimplementa ninguna regla de
// negocio: la biunivocidad de la Foto_Principal, la ventana de edición
// (Fecha_Límite_Cierre), la validez de la sub-modalidad y la pertenencia del
// Jugador_del_Partido a la alineación las decide y valida el backend. El cliente
// solo:
//   1. Llama al endpoint correspondiente (`PUT /recuadros/{id}/foto-principal`
//      o `PATCH /momentos/{id}`) a través del `CaptureViewModel` reutilizado.
//   2. SURFACEA el error de negocio devuelto por el backend como un error de
//      cliente TIPADO que CONSERVA el mensaje del backend, para que la pantalla
//      lo muestre tal cual (Req 3.13). El mensaje NO se re-deriva localmente.
//
// La única "validación" del lado del cliente es una normalización de entrada
// OPCIONAL que la UI puede prevenir de forma obvia (limpiar `subModalidad`
// cuando el contexto no es Transmisión). Es una ayuda de UI, no una regla: la
// autoridad sigue en el backend, que rechazaría una sub-modalidad inválida.
//
// TypeScript PURO y agnóstico del framework: depende solo del `CaptureClient` /
// `CaptureViewModel` (inyectables) y de los tipos de dominio. La pantalla RN
// (`DetalleCardScreen.tsx`, excluida del typecheck) lo consume.

import type {
  ContextoAsistencia,
  Momento,
  Recuadro,
  UUID,
} from '../../../src/domain/types';
import { CaptureViewModel } from '../viewmodels';
import type { CaptureClient, MomentoContextoInput } from '../viewmodels';
import { ClientNetworkError } from '../net/errors';

/**
 * Error de negocio del Momento reflejado desde el backend (Req 3.13). Es un
 * error de cliente tipado que TRANSPORTA el mensaje devuelto por el backend
 * SIN interpretarlo ni re-derivar la regla del lado del cliente. La pantalla lo
 * captura y muestra su `message` tal cual.
 *
 * Extiende `ClientNetworkError` para integrarse con la jerarquía de errores del
 * módulo de red (`app/src/net/errors.ts`), de modo que las capas superiores
 * puedan distinguir un error ya clasificado de uno inesperado del entorno.
 */
export class MomentoBusinessError extends ClientNetworkError {
  /** Operación durante la cual el backend rechazó la petición. */
  readonly operacion: 'setFotoPrincipal' | 'updateContexto';
  /** Error original devuelto por el backend/cliente HTTP, para trazabilidad. */
  readonly cause: unknown;

  constructor(
    operacion: 'setFotoPrincipal' | 'updateContexto',
    message: string,
    cause: unknown,
  ) {
    super(message);
    this.name = 'MomentoBusinessError';
    this.operacion = operacion;
    this.cause = cause;
    Object.setPrototypeOf(this, MomentoBusinessError.prototype);
  }
}

/**
 * Extrae un mensaje legible de un error lanzado por el cliente/backend, para
 * conservarlo tal cual en `MomentoBusinessError`. No decide reglas: solo lee el
 * texto que ya trae el error (un `ClientNetworkError` del módulo de red, un
 * `Error` estándar, o un valor arbitrario).
 */
function mensajeDeError(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message.trim() !== '' ? error.message : fallback;
  }
  if (typeof error === 'string' && error.trim() !== '') {
    return error;
  }
  return fallback;
}

/**
 * Normaliza el parche de contexto SOLO para el caso obviamente inválido que la
 * UI puede prevenir: si el contexto no es Transmisión, no tiene sentido enviar
 * una `subModalidad` (Req 3.8). Se limpia a `null` (que el backend interpreta
 * como "sin sub-modalidad").
 *
 * IMPORTANTE: esto es una ayuda de UI, NO la regla de negocio. La autoridad
 * sigue en el backend, que valida/rechaza una sub-modalidad inconsistente. Si
 * el contexto no se está cambiando en este parche (indefinido), no se toca la
 * sub-modalidad: el backend decide con el estado real del Momento.
 */
export function normalizarContexto(
  contexto: MomentoContextoInput,
): MomentoContextoInput {
  const cambiaContexto = contexto.contextoAsistencia !== undefined;
  const contextoNoTransmision: ContextoAsistencia | undefined =
    contexto.contextoAsistencia;
  if (
    cambiaContexto &&
    contextoNoTransmision !== 'TRANSMISION' &&
    contexto.subModalidad != null
  ) {
    return { ...contexto, subModalidad: null };
  }
  return contexto;
}

/**
 * Presentador del detalle de un Momento/Recuadro. Compone las llamadas de
 * captura del backend que la UI de detalle necesita: fijar la Foto_Principal
 * (Req 3.5) y actualizar el contexto de asistencia y sus datos (Req 3.8, 3.9).
 *
 * Inyectable/testeable: recibe un `CaptureClient` o un `CaptureViewModel` ya
 * construido (reutiliza `setFotoPrincipal` y `marcarContexto`). En pruebas se
 * sustituye por un `CaptureClient` doble.
 */
export class MomentoDetailPresenter {
  private readonly viewModel: CaptureViewModel;

  constructor(clientOrViewModel: CaptureClient | CaptureViewModel) {
    this.viewModel =
      clientOrViewModel instanceof CaptureViewModel
        ? clientOrViewModel
        : new CaptureViewModel(clientOrViewModel);
  }

  /**
   * Marca `fotoId` como Foto_Principal de `recuadroId`
   * (`PUT /recuadros/{recuadroId}/foto-principal`, Req 3.5). Delega en el
   * `CaptureViewModel`; NO decide la biunivocidad ni la ventana de edición: si
   * el backend rechaza (p. ej. Temporada cerrada), su mensaje se refleja como
   * `MomentoBusinessError` (Req 3.13).
   */
  async setFotoPrincipal(recuadroId: UUID, fotoId: UUID): Promise<Recuadro> {
    try {
      return await this.viewModel.setFotoPrincipal(recuadroId, fotoId);
    } catch (error) {
      throw new MomentoBusinessError(
        'setFotoPrincipal',
        mensajeDeError(error, 'No se pudo fijar la Foto_Principal.'),
        error,
      );
    }
  }

  /**
   * Actualiza el contexto de asistencia y datos del Momento
   * (`PATCH /momentos/{momentoId}`, Req 3.8, 3.9). Aplica la normalización de
   * entrada opcional (limpia `subModalidad` fuera de Transmisión) y delega en el
   * `CaptureViewModel`. NO valida las reglas de negocio: si el backend rechaza
   * (sub-modalidad inválida, Jugador_del_Partido fuera de la alineación, ventana
   * de edición cerrada), su mensaje se refleja como `MomentoBusinessError`
   * (Req 3.13).
   */
  async updateContexto(
    momentoId: UUID,
    contexto: MomentoContextoInput,
  ): Promise<Momento> {
    const patch = normalizarContexto(contexto);
    try {
      return await this.viewModel.marcarContexto(momentoId, patch);
    } catch (error) {
      throw new MomentoBusinessError(
        'updateContexto',
        mensajeDeError(error, 'No se pudo actualizar el contexto del Momento.'),
        error,
      );
    }
  }
}
