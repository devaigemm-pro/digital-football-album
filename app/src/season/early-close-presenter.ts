// EarlyClosePresenter — núcleo framework-agnóstico del cierre anticipado de la
// Temporada desde el cliente.
//
// Task 30.4 — Requirements: 10.1, 10.2, 10.3, 10.4
// (SRS Req 16 — cierre de Temporada:
//   - 16.1: al iniciar el flujo de cierre anticipado, permitir de forma OPCIONAL
//           que el usuario confirme que las fotografías están listas para imprenta;
//   - 16.2: MIENTRAS existan Recuadros sin Foto_Principal, informar al usuario
//           cuáles Recuadros están sin Foto_Principal ANTES de una confirmación
//           de cierre anticipado;
//   - 16.4: cuando el usuario CONFIRMA el cierre anticipado, cerrar la Temporada
//           y disparar la generación de los archivos de impresión antes de la
//           Fecha_Límite_Cierre;
//   - 16.5: si existen Recuadros sin Foto_Principal al momento del cierre,
//           proceder con la impresión y mantener esos Recuadros vacíos.)
//
// Este archivo es la CAPA DE LÓGICA PURA (TypeScript sin React) que la pantalla
// `CierreTemporadaScreen.tsx` enlaza. El CLIENTE no reimplementa las reglas de
// negocio del cierre (las decide el backend): se limita a
//
//   1. exponer los Recuadros SIN Foto_Principal para informarlos ANTES de
//      cualquier confirmación (Req 10.2 / SRS 16.2). Estos se cargan desde el
//      backend (misma fuente que la previsualización del álbum) y se ESPEJAN sin
//      re-derivar cuáles faltan;
//   2. gestionar una confirmación OPCIONAL de "fotos listas para imprenta"
//      (Req 10.1 / SRS 16.1) que la UI puede recopilar y adjuntar;
//   3. IMPONER una compuerta de CONFIRMACIÓN EXPLÍCITA del cierre: sin esa
//      confirmación NO se contacta al backend (mismo patrón que el borrado de
//      cuenta, `AuthSessionPresenter.deleteAccount`);
//   4. enviar la solicitud de cierre anticipado al backend (Req 10.4 / SRS 16.4)
//      y REFLEJAR el estado de la Temporada devuelto (p. ej. `CERRADA`), incluidos
//      los Recuadros que quedaron vacíos (Req 10.3 / SRS 16.5), sin re-derivarlo.
//
// Toda la lógica sensible a la corrección de ESTA capa (compuerta de
// confirmación, transiciones de estado, espejo del estado devuelto, tolerancia a
// fallos) vive aquí y es unit-testable; el `.tsx` de la pantalla es una envoltura
// delgada.

// ---------------------------------------------------------------------------
// Contrato del cliente (Servicio de Temporada / cierre) y formas que espeja
// ---------------------------------------------------------------------------

/**
 * Recuadro sin Foto_Principal a informar antes del cierre anticipado
 * (Req 10.2 / SRS 16.2). El backend indica su `numero`; el cliente lo espeja.
 */
export interface RecuadroFaltante {
  /** Número del Recuadro (correspondiente a su Partido_Oficial). */
  readonly numero: number;
}

/**
 * Estado de los Recuadros sin Foto_Principal tal como lo devuelve el backend,
 * usado para informar al usuario ANTES de confirmar el cierre (Req 10.2).
 */
export interface RecuadrosFaltantesData {
  /**
   * Recuadros sin Foto_Principal, ordenados ascendentemente por `numero` tal
   * como los emite el backend. El presentador conserva ese orden.
   */
  readonly recuadros: readonly RecuadroFaltante[];
}

/**
 * Estado de la Temporada tal como lo devuelve el backend tras el cierre
 * anticipado (Req 10.4 / SRS 16.4). El cliente lo ESPEJA sin re-derivarlo.
 */
export interface TemporadaCierreData {
  /**
   * Identificador de la Temporada cerrada.
   */
  readonly temporadaId: string;
  /**
   * Estado devuelto por el backend (p. ej. `CERRADA`, `IMPRESION`). El cliente
   * lo refleja tal cual; no decide la transición por su cuenta.
   */
  readonly estado: string;
  /**
   * Números de los Recuadros que quedaron sin Foto_Principal al cierre y se
   * mantienen vacíos en la impresión (Req 10.3 / SRS 16.5). El backend los
   * confirma; el cliente los muestra sin re-derivarlos. Puede venir vacío.
   */
  readonly recuadrosVacios: readonly number[];
}

/**
 * Contrato del cliente del lado de la app para el cierre anticipado de la
 * Temporada. La UI/adaptadores lo implementan (adaptador HTTP en producción,
 * doble en memoria en pruebas) y se inyecta en el presentador. Es el ÚNICO punto
 * que contacta al backend; el presentador nunca reimplementa sus reglas.
 */
export interface SeasonCloseClient {
  /**
   * Obtiene los Recuadros sin Foto_Principal de la Temporada para informarlos
   * antes de una confirmación de cierre anticipado (Req 10.2). Reutiliza la
   * misma fuente que la previsualización del álbum (`GET /album/{temporadaId}
   * /preview`); el adaptador HTTP puede mapear esa respuesta a esta forma.
   * Puede rechazar ante fallos de red/backend; el presentador lo refleja como
   * estado `error` sin propagar la excepción a la UI.
   */
  getRecuadrosFaltantes(temporadaId: string): Promise<RecuadrosFaltantesData>;

  /**
   * Solicita el cierre anticipado de la Temporada (Req 10.4 / SRS 16.4): cierra
   * la Temporada y dispara la generación de los archivos de impresión antes de
   * la Fecha_Límite_Cierre. Devuelve el estado de la Temporada resultante que el
   * presentador espeja (Req 10.3, 10.4). Puede rechazar ante fallos de negocio
   * (p. ej. Temporada no activa) o de red; el presentador lo refleja como error
   * sin re-derivar la regla.
   *
   * @param params.fotosListasConfirmadas confirmación OPCIONAL de que las
   *   fotografías están listas para imprenta (Req 10.1 / SRS 16.1). Se reenvía
   *   al backend tal cual; el cliente no la exige ni la valida.
   */
  requestEarlyClose(
    temporadaId: string,
    params: { readonly fotosListasConfirmadas: boolean },
  ): Promise<TemporadaCierreData>;
}

// ---------------------------------------------------------------------------
// Parámetros y resultado del cierre anticipado
// ---------------------------------------------------------------------------

/**
 * Parámetros de la solicitud de cierre anticipado.
 *
 * `confirmed` es la compuerta de CONFIRMACIÓN EXPLÍCITA del cierre: DEBE ser
 * `true` para que el presentador contacte al backend. Sin ella, el cierre no se
 * ejecuta (mismo patrón que el borrado de cuenta).
 *
 * `fotosListas` es la confirmación OPCIONAL de "fotos listas para imprenta"
 * (Req 10.1 / SRS 16.1); su valor se reenvía al backend pero NO condiciona el
 * cierre (el cierre procede aunque falten Recuadros — Req 10.3 / SRS 16.5).
 */
export interface RequestEarlyCloseParams {
  /** Confirmación explícita del cierre anticipado (Req 10.4). Requerida. */
  readonly confirmed: boolean;
  /**
   * Confirmación OPCIONAL de que las fotografías están listas para imprenta
   * (Req 10.1). Por defecto `false`. No condiciona el cierre.
   */
  readonly fotosListas?: boolean;
}

/**
 * Resultado tipado de `requestClose`. Distingue el caso en que faltó la
 * confirmación explícita (no se tocó el backend) del cierre efectivo.
 */
export type EarlyCloseResult =
  /**
   * `confirmed` no era `true`: NO se contactó al backend. La UI debe recabar la
   * confirmación explícita antes de reintentar (Req 10.4).
   */
  | { readonly outcome: 'confirmation-required' }
  /** El cierre se solicitó y el backend devolvió el estado de la Temporada. */
  | { readonly outcome: 'closed'; readonly temporada: TemporadaCierreData }
  /**
   * El backend/red rechazó la solicitud de cierre. `message` es un texto legible
   * (espejado del backend cuando existe) para mostrar sin lanzar a la UI.
   */
  | { readonly outcome: 'error'; readonly message: string };

// ---------------------------------------------------------------------------
// Estado observable listo para pintar
// ---------------------------------------------------------------------------

/** Fase de la carga de los Recuadros faltantes a informar (Req 10.2). */
export type FaltantesStatus = 'idle' | 'loading' | 'loaded' | 'error';

/** Fase de la solicitud de cierre anticipado (Req 10.4). */
export type CierreStatus = 'idle' | 'submitting' | 'closed' | 'error';

/**
 * Estado observable que expone el presentador. La UI se enlaza vía
 * `getState`/`subscribe` sin conocer al cliente ni bloquearse. Reúne las dos
 * preocupaciones de la pantalla: informar Recuadros faltantes y ejecutar el
 * cierre confirmado.
 */
export interface EarlyCloseState {
  // --- Recuadros sin Foto_Principal a informar antes del cierre (Req 10.2) ---
  /** Fase de la carga de los Recuadros faltantes. */
  readonly faltantesStatus: FaltantesStatus;
  /**
   * Números de los Recuadros sin Foto_Principal a informar antes del cierre
   * (Req 10.2). Espejado del backend, ordenado ascendentemente. Vacío hasta que
   * la carga termina con éxito.
   */
  readonly recuadrosFaltantes: readonly number[];
  /** Atajo: cantidad de Recuadros sin Foto_Principal (Req 10.2). */
  readonly faltantesCount: number;
  /**
   * `true` cuando existen Recuadros sin Foto_Principal a informar (Req 10.2).
   * La UI lo usa para mostrar la advertencia previa a la confirmación.
   */
  readonly hayFaltantes: boolean;
  /** Mensaje de error legible cuando `faltantesStatus === 'error'`, o `null`. */
  readonly faltantesError: string | null;

  // --- Cierre anticipado confirmado y estado devuelto (Req 10.3, 10.4) ---
  /** Fase de la solicitud de cierre. */
  readonly cierreStatus: CierreStatus;
  /**
   * Estado de la Temporada devuelto por el backend tras el cierre (Req 10.4),
   * o `null` si aún no se cerró. ESPEJADO sin re-derivar.
   */
  readonly temporadaEstado: string | null;
  /**
   * Números de los Recuadros que quedaron vacíos al cierre y se mantienen así en
   * la impresión (Req 10.3 / SRS 16.5), tal como los confirma el backend. `null`
   * hasta que el cierre se ejecuta.
   */
  readonly recuadrosVacios: readonly number[] | null;
  /**
   * Mensaje de error ESPEJADO del backend cuando el cierre falló (Req 10.4), o
   * `null`. No se re-deriva localmente.
   */
  readonly cierreError: string | null;
}

/** Oyente del estado del cierre; recibe el estado actual completo. */
export type EarlyCloseStateListener = (state: EarlyCloseState) => void;

/** Estado inicial: nada cargado ni cerrado, sin bloquear la UI. */
const INITIAL_STATE: EarlyCloseState = {
  faltantesStatus: 'idle',
  recuadrosFaltantes: [],
  faltantesCount: 0,
  hayFaltantes: false,
  faltantesError: null,
  cierreStatus: 'idle',
  temporadaEstado: null,
  recuadrosVacios: null,
  cierreError: null,
};

/** Mensaje por defecto ante un fallo al cargar los Recuadros faltantes. */
export const FALTANTES_ERROR_DEFAULT =
  'No se pudieron cargar los recuadros pendientes. Intenta de nuevo.';

/** Mensaje por defecto ante un fallo al solicitar el cierre anticipado. */
export const CIERRE_ERROR_DEFAULT =
  'No se pudo cerrar la temporada. Intenta de nuevo.';

/** Extrae un mensaje legible de un error desconocido, con respaldo por defecto. */
function toErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message.trim().length > 0) {
    return err.message;
  }
  if (typeof err === 'string' && err.trim().length > 0) {
    return err;
  }
  return fallback;
}

/**
 * Presentador del cierre anticipado de la Temporada: fuente de verdad observable
 * que la pantalla `CierreTemporadaScreen` enlaza. Orquesta la carga de los
 * Recuadros faltantes y la solicitud de cierre confirmado a través del
 * `SeasonCloseClient` inyectado, y expone `getState`/`subscribe` estables más
 * `loadRecuadrosFaltantes`/`requestClose`.
 */
export class EarlyClosePresenter {
  private state: EarlyCloseState = INITIAL_STATE;
  private readonly listeners = new Set<EarlyCloseStateListener>();
  /** Marca de la carga de faltantes en curso: solo la última aplica. */
  private faltantesToken = 0;
  /** Marca del cierre en curso: solo el último `requestClose` aplica. */
  private cierreToken = 0;

  /**
   * @param client Cliente del cierre de Temporada. Se inyecta para permitir un
   *   doble en memoria en pruebas y un adaptador HTTP en producción.
   */
  constructor(private readonly client: SeasonCloseClient) {}

  /** Estado actual listo para pintar (Req 10.1, 10.2, 10.3, 10.4). */
  getState(): EarlyCloseState {
    return this.state;
  }

  /**
   * Registra un oyente del estado y devuelve la función para cancelar la
   * suscripción. Emite el estado actual de inmediato para inicializar la UI.
   */
  subscribe(listener: EarlyCloseStateListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Carga los Recuadros sin Foto_Principal para informarlos ANTES de una
   * confirmación de cierre anticipado (Req 10.2 / SRS 16.2), sin bloquear la UI:
   *   1. transiciona a `loading` (conservando lo ya mostrado);
   *   2. al resolver, ESPEJA los números faltantes (sin re-derivarlos) y
   *      transiciona a `loaded`;
   *   3. si el cliente rechaza, transiciona a `error` con un mensaje legible SIN
   *      lanzar a la UI.
   *
   * Idempotente ante recargas: solo el resultado de la última invocación aplica.
   *
   * @returns una promesa que siempre resuelve (nunca rechaza).
   */
  async loadRecuadrosFaltantes(temporadaId: string): Promise<void> {
    const token = ++this.faltantesToken;
    this.emit({
      ...this.state,
      faltantesStatus: 'loading',
      faltantesError: null,
    });

    try {
      const data = await this.client.getRecuadrosFaltantes(temporadaId);
      if (token !== this.faltantesToken) {
        return;
      }
      const numeros = data.recuadros.map((r) => r.numero);
      this.emit({
        ...this.state,
        faltantesStatus: 'loaded',
        recuadrosFaltantes: numeros,
        faltantesCount: numeros.length,
        hayFaltantes: numeros.length > 0,
        faltantesError: null,
      });
    } catch (err) {
      if (token !== this.faltantesToken) {
        return;
      }
      this.emit({
        ...this.state,
        faltantesStatus: 'error',
        faltantesError: toErrorMessage(err, FALTANTES_ERROR_DEFAULT),
      });
    }
  }

  /**
   * Solicita el cierre anticipado de la Temporada tras una CONFIRMACIÓN
   * EXPLÍCITA (Req 10.4 / SRS 16.4):
   *   1. si `params.confirmed` no es `true`, NO contacta al backend y devuelve
   *      `confirmation-required` sin modificar el estado observable (compuerta de
   *      confirmación, mismo patrón que el borrado de cuenta);
   *   2. con la confirmación, transiciona a `submitting` y envía la solicitud,
   *      reenviando la confirmación OPCIONAL de "fotos listas" (Req 10.1);
   *   3. en éxito, ESPEJA el estado de la Temporada devuelto y los Recuadros que
   *      quedaron vacíos (Req 10.3, 10.4) y transiciona a `closed`;
   *   4. ante fallo, ESPEJA el mensaje del backend (Req 10.4) y transiciona a
   *      `error` SIN re-derivar la regla ni lanzar a la UI.
   *
   * Idempotente ante reenvíos: solo el resultado del último aplica.
   *
   * @returns un {@link EarlyCloseResult} tipado; la promesa siempre resuelve.
   */
  async requestClose(
    temporadaId: string,
    params: RequestEarlyCloseParams,
  ): Promise<EarlyCloseResult> {
    if (!params.confirmed) {
      // Sin confirmación explícita no se contacta al backend (Req 10.4).
      // No se altera el estado observable: la UI aún no inició el cierre.
      return { outcome: 'confirmation-required' };
    }

    const token = ++this.cierreToken;
    this.emit({
      ...this.state,
      cierreStatus: 'submitting',
      cierreError: null,
    });

    try {
      const data = await this.client.requestEarlyClose(temporadaId, {
        fotosListasConfirmadas: params.fotosListas ?? false,
      });
      if (token !== this.cierreToken) {
        // Un cierre más reciente lo reemplazó: descartar este resultado.
        return { outcome: 'closed', temporada: data };
      }
      // ESPEJA el estado devuelto por el backend, sin re-derivarlo (Req 10.3, 10.4).
      this.emit({
        ...this.state,
        cierreStatus: 'closed',
        temporadaEstado: data.estado,
        recuadrosVacios: data.recuadrosVacios,
        cierreError: null,
      });
      return { outcome: 'closed', temporada: data };
    } catch (err) {
      const message = toErrorMessage(err, CIERRE_ERROR_DEFAULT);
      if (token !== this.cierreToken) {
        return { outcome: 'error', message };
      }
      // Espeja el error del backend sin re-derivarlo (Req 10.4).
      this.emit({
        ...this.state,
        cierreStatus: 'error',
        cierreError: message,
      });
      return { outcome: 'error', message };
    }
  }

  private emit(state: EarlyCloseState): void {
    this.state = state;
    for (const listener of this.listeners) {
      listener(state);
    }
  }
}
