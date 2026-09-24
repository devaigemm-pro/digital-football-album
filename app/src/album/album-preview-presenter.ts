// AlbumPreviewPresenter — núcleo framework-agnóstico de la pantalla de
// previsualización del álbum coleccionable (Home/Álbum).
//
// Task 29.1 — Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
// (backend Req 11.1/11.2/11.3 — Motor_Album `GET /album/{temporadaId}/preview`;
//  cliente Req 27.4/27.5 — la petición no bloquea la UI).
//
// Este archivo es la CAPA DE LÓGICA PURA (TypeScript sin React) que la pantalla
// `HomeAlbumScreen.tsx` enlaza. Consume la previsualización del Motor_Album a
// través de un `AlbumPreviewClient` inyectable (sustituible por un cliente en
// memoria en pruebas y por un adaptador HTTP en producción) y expone un estado
// observable listo para pintar:
//
//   - las entradas ordenadas de cada Recuadro: MONTADA con la clave de una
//     miniatura optimizada de su Foto_Principal (Req 4.1), o VACIO como silueta
//     punteada (Req 4.2);
//   - el conteo y la lista de Recuadros sin Foto_Principal (faltantes — Req 4.3);
//   - una máquina de estados de carga no bloqueante `idle → loading → loaded`
//     (o `error`) para que la UI permanezca operable mientras la petición está
//     en curso y muestre el fallo sin lanzar excepciones a la UI (Req 4.5).
//
// Toda la lógica sensible a la corrección (transiciones de estado, derivación de
// la vista, tolerancia a fallos) vive aquí y es unit-testable; el `.tsx` de la
// pantalla es una envoltura delgada que solo enlaza este presentador a React.

/**
 * Clave/URL de la miniatura optimizada de la Foto_Principal montada (Req 4.1).
 * Se usa una miniatura, no el binario original, para no bloquear el render.
 */
export type MiniaturaKey = string;

/**
 * Entrada de previsualización de un Recuadro con Foto_Principal montada
 * (Req 4.1). Espeja la forma que devuelve el backend (Motor_Album).
 */
export interface AlbumPreviewEntryMontada {
  readonly numero: number;
  readonly estado: 'MONTADA';
  /** Miniatura optimizada de la Foto_Principal a mostrar en el Recuadro. */
  readonly miniaturaKey: MiniaturaKey;
}

/**
 * Entrada de previsualización de un Recuadro vacío: silueta punteada (Req 4.2).
 * Espeja la forma que devuelve el backend (Motor_Album).
 */
export interface AlbumPreviewEntryVacio {
  readonly numero: number;
  readonly estado: 'VACIO';
}

/**
 * Entrada de previsualización de un Recuadro: montada (con miniatura optimizada)
 * o vacía (silueta punteada). Unión discriminada por `estado`.
 */
export type AlbumPreviewEntry =
  | AlbumPreviewEntryMontada
  | AlbumPreviewEntryVacio;

/**
 * Datos de previsualización del álbum tal como los devuelve el backend
 * (`GET /album/{temporadaId}/preview`). El cliente del lado de la app espeja
 * esta forma sin reimplementar la lógica de negocio del Motor_Album.
 */
export interface AlbumPreviewData {
  /**
   * Entradas de previsualización, una por Recuadro del álbum, **ordenadas
   * ascendentemente por `numero`** tal como las emite el backend (Req 4.1). El
   * presentador conserva este orden.
   */
  readonly recuadros: readonly AlbumPreviewEntry[];
  /**
   * Números de los Recuadros sin Foto_Principal (faltantes — Req 4.3). Indica
   * cuáles Recuadros faltan antes del cierre.
   */
  readonly recuadrosSinFotoPrincipal: readonly number[];
}

/**
 * Contrato del cliente de previsualización del lado de la app. La UI/adaptadores
 * lo implementan (adaptador HTTP en producción, doble en memoria en pruebas) y
 * se inyecta en el presentador. Consume `GET /album/{temporadaId}/preview`.
 */
export interface AlbumPreviewClient {
  /**
   * Obtiene la previsualización del álbum de una Temporada. Puede rechazar ante
   * fallos de red o del backend; el presentador captura el rechazo y lo refleja
   * como estado `error` sin propagarlo a la UI (Req 4.5).
   */
  getPreview(temporadaId: string): Promise<AlbumPreviewData>;
}

/** Fase de la carga no bloqueante de la previsualización (Req 4.5). */
export type AlbumPreviewStatus = 'idle' | 'loading' | 'loaded' | 'error';

/**
 * Estado observable listo para pintar que expone el presentador. La UI se enlaza
 * a él vía `getState`/`subscribe` sin conocer al cliente ni bloquearse.
 */
export interface AlbumPreviewState {
  /** Fase de carga actual (Req 4.5). */
  readonly status: AlbumPreviewStatus;
  /**
   * Entradas ordenadas a renderizar: MONTADA (miniatura) o VACIO (silueta).
   * Vacío hasta que la carga termina con éxito (Req 4.1, 4.2).
   */
  readonly recuadros: readonly AlbumPreviewEntry[];
  /** Números de los Recuadros faltantes (sin Foto_Principal — Req 4.3). */
  readonly faltantes: readonly number[];
  /** Cantidad de Recuadros faltantes; atajo para el indicador de faltantes (Req 4.3). */
  readonly faltantesCount: number;
  /**
   * Mensaje de error legible cuando `status === 'error'`, o `null` en otro caso.
   * La UI lo muestra y ofrece reintentar sin que el presentador lance (Req 4.5).
   */
  readonly error: string | null;
}

/** Oyente del estado de la previsualización; recibe el estado actual completo. */
export type AlbumPreviewStateListener = (state: AlbumPreviewState) => void;

/** Estado inicial: nada cargado aún, sin bloquear la UI (Req 4.5). */
const INITIAL_STATE: AlbumPreviewState = {
  status: 'idle',
  recuadros: [],
  faltantes: [],
  faltantesCount: 0,
  error: null,
};

/** Mensaje por defecto ante un fallo al cargar la previsualización (Req 4.5). */
export const ALBUM_PREVIEW_ERROR_MESSAGE =
  'No se pudo cargar la previsualización del álbum. Intenta de nuevo.';

/** Extrae un mensaje legible de un error desconocido, con respaldo por defecto. */
function toErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message.trim().length > 0) {
    return err.message;
  }
  if (typeof err === 'string' && err.trim().length > 0) {
    return err;
  }
  return ALBUM_PREVIEW_ERROR_MESSAGE;
}

/**
 * Presentador de la previsualización del álbum: fuente de verdad observable que
 * la pantalla `HomeAlbumScreen` enlaza. Orquesta la carga a través del
 * `AlbumPreviewClient` inyectado y expone `getState`/`subscribe` estables más
 * `load(temporadaId)`.
 */
export class AlbumPreviewPresenter {
  private state: AlbumPreviewState = INITIAL_STATE;
  private readonly listeners = new Set<AlbumPreviewStateListener>();
  /**
   * Marca de la carga en curso: solo la última `load` invocada aplica su
   * resultado. Evita condiciones de carrera si el usuario recarga o cambia de
   * Temporada mientras una petición previa sigue en vuelo (Req 4.5).
   */
  private loadToken = 0;

  /**
   * @param client Cliente de previsualización (`GET /album/{temporadaId}/preview`).
   *   Se inyecta para permitir un doble en memoria en pruebas y un adaptador
   *   HTTP en producción.
   */
  constructor(private readonly client: AlbumPreviewClient) {}

  /** Estado actual listo para pintar (Req 4.1, 4.2, 4.3, 4.5). */
  getState(): AlbumPreviewState {
    return this.state;
  }

  /**
   * Registra un oyente del estado y devuelve la función para cancelar la
   * suscripción. Emite el estado actual de inmediato para inicializar la UI.
   */
  subscribe(listener: AlbumPreviewStateListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Carga la previsualización del álbum de una Temporada sin bloquear la UI
   * (Req 4.5):
   *   1. transiciona a `loading` (conservando lo ya mostrado);
   *   2. al resolver, deriva las entradas ordenadas (Req 4.1, 4.2) y la lista de
   *      faltantes (Req 4.3), y transiciona a `loaded`;
   *   3. si el cliente rechaza, transiciona a `error` con un mensaje legible
   *      SIN lanzar a la UI.
   *
   * Es idempotente ante recargas: solo el resultado de la última invocación
   * aplica (protección contra carreras).
   *
   * @returns una promesa que siempre resuelve (nunca rechaza), para que la UI
   *   pueda `await` sin envolver en try/catch.
   */
  async load(temporadaId: string): Promise<void> {
    const token = ++this.loadToken;
    this.emit({
      status: 'loading',
      // Conserva lo previamente mostrado mientras recarga (UI operable — Req 4.5).
      recuadros: this.state.recuadros,
      faltantes: this.state.faltantes,
      faltantesCount: this.state.faltantesCount,
      error: null,
    });

    try {
      const data = await this.client.getPreview(temporadaId);
      if (token !== this.loadToken) {
        // Una carga más reciente la reemplazó: descartar este resultado.
        return;
      }
      const recuadros = data.recuadros;
      const faltantes = data.recuadrosSinFotoPrincipal;
      this.emit({
        status: 'loaded',
        recuadros,
        faltantes,
        faltantesCount: faltantes.length,
        error: null,
      });
    } catch (err) {
      if (token !== this.loadToken) {
        return;
      }
      // Fallo no bloqueante: se refleja como estado, no como excepción (Req 4.5).
      this.emit({
        status: 'error',
        recuadros: this.state.recuadros,
        faltantes: this.state.faltantes,
        faltantesCount: this.state.faltantesCount,
        error: toErrorMessage(err),
      });
    }
  }

  private emit(state: AlbumPreviewState): void {
    this.state = state;
    for (const listener of this.listeners) {
      listener(state);
    }
  }
}
