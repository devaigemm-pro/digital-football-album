// SharePresenter — núcleo framework-agnóstico de la compartición nativa a redes
// sociales (pantalla de compartir / CompartirSheet).
//
// Task 29.3 — Requirements: 6.1, 6.2, 6.3, 6.4
// (cliente Req 6 — compartir la Digital_Card; backend Req 13.1/13.2 —
//  ShareViewModel + NativeShareBridge en `src/app`).
//
// Este archivo es la CAPA DE LÓGICA PURA (TypeScript sin React) que la pantalla
// `CompartirSheet.tsx` enlaza. Reutiliza el view-model framework-agnóstico
// `ShareViewModel` (re-exportado por `app/src/viewmodels`) sin reimplementarlo:
// el presentador CONSTRUYE un `ShareViewModel` con el `NativeShareBridge`
// inyectado y delega en `shareCard(card, platform)` el despacho a la integración
// nativa de cada plataforma.
//
// Responsabilidades del presentador (más allá del view-model):
//   - Exponer las plataformas ofrecidas al usuario (Req 6.1).
//   - Invocar la integración nativa vía el bridge y CAPTURAR el resultado
//     (éxito o error) en un estado observable/awaitable, para que la UI muestre
//     el desenlace sin manejar excepciones ni bloquearse (Req 6.2, 6.3).
//   - Rechazar una plataforma no soportada SIN invocar el bridge, propagando
//     `PlataformaNoSoportadaError` (Req 6.4).

import type { DigitalCard, SharePlatform } from '../viewmodels';
import {
  PlataformaNoSoportadaError,
  SHARE_PLATFORMS,
  ShareViewModel,
} from '../viewmodels';
import type { NativeShareBridge } from '../viewmodels';

/** Fase del intento de compartición no bloqueante (Req 6.2, 6.3). */
export type ShareStatus = 'idle' | 'sharing' | 'success' | 'error';

/**
 * Resultado capturado del último intento de compartición (Req 6.2, 6.3). La UI
 * lo consume para mostrar éxito o el mensaje de error sin recibir excepciones.
 */
export interface ShareState {
  /** Fase actual del intento (Req 6.2, 6.3). */
  readonly status: ShareStatus;
  /** Plataforma del último intento, o `null` si aún no hubo ninguno. */
  readonly plataforma: SharePlatform | null;
  /**
   * Mensaje de error legible cuando `status === 'error'`, o `null` en otro caso
   * (Req 6.3). La integración nativa rechazó o la plataforma no está soportada.
   */
  readonly error: string | null;
}

/** Oyente del estado de compartición; recibe el estado actual completo. */
export type ShareStateListener = (state: ShareState) => void;

/** Estado inicial: sin intentos de compartir aún, sin bloquear la UI. */
const INITIAL_STATE: ShareState = {
  status: 'idle',
  plataforma: null,
  error: null,
};

/** Mensaje por defecto ante un fallo al compartir (Req 6.3). */
export const SHARE_ERROR_MESSAGE =
  'No se pudo compartir la Digital_Card. Intenta de nuevo.';

/** Extrae un mensaje legible de un error desconocido, con respaldo por defecto. */
function toErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message.trim().length > 0) {
    return err.message;
  }
  if (typeof err === 'string' && err.trim().length > 0) {
    return err;
  }
  return SHARE_ERROR_MESSAGE;
}

/**
 * Presentador de la compartición nativa: fuente de verdad observable que la
 * pantalla `CompartirSheet` enlaza. Construye un `ShareViewModel` con el
 * `NativeShareBridge` inyectado y expone las plataformas ofrecidas más un
 * `share(card, platform)` que captura el resultado en estado observable.
 */
export class SharePresenter {
  private state: ShareState = INITIAL_STATE;
  private readonly listeners = new Set<ShareStateListener>();
  private readonly viewModel: ShareViewModel;
  /**
   * Marca del intento en curso: solo el resultado del último `share` invocado
   * aplica. Evita que un intento previo (a otra plataforma) que resuelva tarde
   * pise el estado del intento más reciente.
   */
  private shareToken = 0;

  /**
   * @param bridge Puente a la integración nativa de cada plataforma
   *   (Instagram Stories / WhatsApp / X / TikTok). Se inyecta para permitir un
   *   doble en pruebas y el adaptador nativo real en producción; el presentador
   *   construye internamente el `ShareViewModel` reutilizado con él.
   */
  constructor(bridge: NativeShareBridge) {
    this.viewModel = new ShareViewModel(bridge);
  }

  /**
   * Plataformas ofrecidas al usuario para compartir (Req 6.1): Instagram
   * Stories, WhatsApp, X y TikTok, en orden de presentación. Delega en el
   * view-model reutilizado.
   */
  get plataformasDisponibles(): readonly SharePlatform[] {
    return this.viewModel.plataformasDisponibles;
  }

  /** Estado actual del último intento de compartición (Req 6.2, 6.3). */
  getState(): ShareState {
    return this.state;
  }

  /**
   * Registra un oyente del estado y devuelve la función para cancelar la
   * suscripción. Emite el estado actual de inmediato para inicializar la UI.
   */
  subscribe(listener: ShareStateListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Comparte la `card` en la `plataforma` seleccionada (Req 6.2): valida el
   * destino, transiciona a `sharing`, invoca la integración nativa a través del
   * `ShareViewModel` y CAPTURA el desenlace en el estado observable
   * (Req 6.2, 6.3):
   *   - éxito → `status: 'success'`;
   *   - rechazo del bridge (fallo nativo) → `status: 'error'` con mensaje
   *     legible, sin lanzar a la UI.
   *
   * Una plataforma FUERA del conjunto soportado se rechaza ANTES de tocar el
   * bridge (Req 6.4): el presentador registra el estado `error` y luego
   * PROPAGA `PlataformaNoSoportadaError`, ya que es una condición de programación
   * (la UI solo ofrece `plataformasDisponibles`), no un fallo de compartición
   * recuperable. El bridge no se invoca en ese caso.
   *
   * @param card Digital_Card seleccionada a publicar/compartir.
   * @param plataforma Destino elegido por el usuario.
   * @returns el `ShareState` resultante de un intento a una plataforma soportada.
   * @throws PlataformaNoSoportadaError si la plataforma no está soportada (sin
   *   invocar el bridge — Req 6.4).
   */
  async share(
    card: DigitalCard,
    plataforma: SharePlatform,
  ): Promise<ShareState> {
    // Guarda de destino soportado (Req 6.4): rechazar sin invocar el bridge.
    if (!SHARE_PLATFORMS.includes(plataforma)) {
      const error = new PlataformaNoSoportadaError(plataforma);
      this.emit({ status: 'error', plataforma, error: error.message });
      throw error;
    }

    const token = ++this.shareToken;
    this.emit({ status: 'sharing', plataforma, error: null });

    try {
      await this.viewModel.shareCard(card, plataforma);
      if (token !== this.shareToken) {
        // Un intento más reciente lo reemplazó: descartar este resultado.
        return this.state;
      }
      return this.emit({ status: 'success', plataforma, error: null });
    } catch (err) {
      if (token !== this.shareToken) {
        return this.state;
      }
      // Captura del fallo nativo (rechazo del bridge — Req 6.3): se refleja como
      // estado, no como excepción hacia la UI.
      return this.emit({
        status: 'error',
        plataforma,
        error: toErrorMessage(err),
      });
    }
  }

  private emit(state: ShareState): ShareState {
    this.state = state;
    for (const listener of this.listeners) {
      listener(state);
    }
    return state;
  }
}
