// ProfilePresenter — núcleo framework-agnóstico del perfil del usuario y de la
// lista de partidos (láminas) de la temporada.
//
// Consume el `ProfileClient` (`GET /me`, `GET /temporadas/:id/partidos`) y expone
// dos estados observables listos para pintar, con carga no bloqueante
// `idle → loading → loaded | error`, siguiendo el mismo patrón que
// `AlbumPreviewPresenter`. Toda la lógica sensible vive aquí (TypeScript puro,
// unit-testable); las pantallas `.tsx` (Perfil, lista de partidos) son
// envolturas delgadas que solo enlazan este presentador a React.
//
// El perfil aporta el `temporadaId` de la temporada activa, que el resto del
// flujo (álbum, partidos) necesita para no depender de datos hardcodeados.

import type {
  ActualizarPerfilInput,
  Perfil,
  PartidoLamina,
  ProfileClient,
  SyncTemporadaResult,
} from '../adapters/http-profile-client';

/**
 * Extrae el año (4 dígitos) de un identificador de temporada externa. El backend
 * usa varios formatos según cómo se creó la temporada:
 *   - "2026"             → temporada directa por año.
 *   - "265:2023:2315"    → "<leagueId>:<season>:<teamId>".
 *   - "team:33:2023"     → "team:<teamId>:<season>".
 * Devuelve el primer grupo de 4 dígitos que representa un año plausible
 * (19xx–20xx). Si no encuentra ninguno, devuelve el string original recortado.
 */
export function añoDeTemporada(temporadaExterna: string): string {
  const matches = temporadaExterna.match(/(?:19|20)\d{2}/g);
  if (matches && matches.length > 0) {
    // El año de la temporada es el mayor de los grupos plausibles (evita tomar
    // un id numérico que por casualidad empiece por 19/20).
    return matches.reduce((mayor, actual) => (actual > mayor ? actual : mayor));
  }
  return temporadaExterna.trim();
}

/** Fase de una carga no bloqueante. */
export type LoadStatus = 'idle' | 'loading' | 'loaded' | 'error';

/** Estado observable del perfil (`GET /me`). */
export interface ProfileState {
  readonly status: LoadStatus;
  /** Perfil cargado (usuario + club + temporada activa), o `null`. */
  readonly perfil: Perfil | null;
  /** Mensaje de error legible cuando `status === 'error'`, o `null`. */
  readonly error: string | null;
}

/** Estado observable de la lista de partidos/láminas de una temporada. */
export interface PartidosState {
  readonly status: LoadStatus;
  readonly partidos: readonly PartidoLamina[];
  readonly error: string | null;
}

/** Fase de una edición de perfil (`PATCH /me`). */
export type EditStatus = 'idle' | 'saving' | 'done' | 'error';

/** Estado observable de la edición de datos del perfil. */
export interface EditState {
  readonly status: EditStatus;
  /** Mensaje de error legible cuando `status === 'error'`, o `null`. */
  readonly error: string | null;
}

/** Fase de la sincronización de temporada desde la API deportiva. */
export type SyncStatus = 'idle' | 'syncing' | 'done' | 'error';

/** Estado observable de la sincronización de temporada (`POST /me/temporada`). */
export interface SyncState {
  readonly status: SyncStatus;
  readonly result: SyncTemporadaResult | null;
  readonly error: string | null;
}

export type ProfileStateListener = (state: ProfileState) => void;
export type PartidosStateListener = (state: PartidosState) => void;
export type SyncStateListener = (state: SyncState) => void;
export type EditStateListener = (state: EditState) => void;

const INITIAL_PROFILE: ProfileState = { status: 'idle', perfil: null, error: null };
const INITIAL_PARTIDOS: PartidosState = { status: 'idle', partidos: [], error: null };
const INITIAL_SYNC: SyncState = { status: 'idle', result: null, error: null };
const INITIAL_EDIT: EditState = { status: 'idle', error: null };

/** Mensajes por defecto ante fallos de carga. */
export const PROFILE_ERROR_MESSAGE =
  'No se pudo cargar tu perfil. Intenta de nuevo.';
export const PARTIDOS_ERROR_MESSAGE =
  'No se pudieron cargar los partidos. Intenta de nuevo.';
export const SYNC_ERROR_MESSAGE =
  'No se pudo cargar la temporada. Intenta de nuevo.';
export const EDIT_ERROR_MESSAGE =
  'No se pudieron guardar los cambios. Intenta de nuevo.';

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
 * Presentador de perfil + partidos. Fuente de verdad observable que enlazan las
 * pantallas de Perfil y de lista de partidos. Orquesta la carga a través del
 * `ProfileClient` inyectado; nunca lanza a la UI (los fallos se reflejan como
 * estado `error`). Las cargas usan tokens para descartar resultados obsoletos.
 */
export class ProfilePresenter {
  private profileState: ProfileState = INITIAL_PROFILE;
  private partidosState: PartidosState = INITIAL_PARTIDOS;
  private syncState: SyncState = INITIAL_SYNC;
  private editState: EditState = INITIAL_EDIT;
  private readonly profileListeners = new Set<ProfileStateListener>();
  private readonly partidosListeners = new Set<PartidosStateListener>();
  private readonly syncListeners = new Set<SyncStateListener>();
  private readonly editListeners = new Set<EditStateListener>();
  private profileToken = 0;
  private partidosToken = 0;

  constructor(private readonly client: ProfileClient) {}

  // --- Perfil (GET /me) -----------------------------------------------------

  getProfileState(): ProfileState {
    return this.profileState;
  }

  subscribeProfile(listener: ProfileStateListener): () => void {
    this.profileListeners.add(listener);
    listener(this.profileState);
    return () => {
      this.profileListeners.delete(listener);
    };
  }

  /**
   * Carga el perfil (`GET /me`). Siempre resuelve (no rechaza): ante fallo deja
   * el estado en `error` con un mensaje legible. Solo aplica el resultado de la
   * última invocación.
   */
  async loadProfile(): Promise<void> {
    const token = ++this.profileToken;
    this.emitProfile({ status: 'loading', perfil: this.profileState.perfil, error: null });
    try {
      const perfil = await this.client.getPerfil();
      if (token !== this.profileToken) {return;}
      this.emitProfile({ status: 'loaded', perfil, error: null });
    } catch (err) {
      if (token !== this.profileToken) {return;}
      this.emitProfile({
        status: 'error',
        perfil: this.profileState.perfil,
        error: toErrorMessage(err, PROFILE_ERROR_MESSAGE),
      });
    }
  }

  // --- Partidos (GET /temporadas/:id/partidos) ------------------------------

  getPartidosState(): PartidosState {
    return this.partidosState;
  }

  subscribePartidos(listener: PartidosStateListener): () => void {
    this.partidosListeners.add(listener);
    listener(this.partidosState);
    return () => {
      this.partidosListeners.delete(listener);
    };
  }

  /**
   * Carga la lista de partidos/láminas de una temporada. Siempre resuelve; ante
   * fallo deja el estado en `error`. Solo aplica el resultado de la última carga.
   */
  async loadPartidos(temporadaId: string): Promise<void> {
    const token = ++this.partidosToken;
    this.emitPartidos({
      status: 'loading',
      partidos: this.partidosState.partidos,
      error: null,
    });
    try {
      const partidos = await this.client.listPartidos(temporadaId);
      if (token !== this.partidosToken) {return;}
      this.emitPartidos({ status: 'loaded', partidos, error: null });
    } catch (err) {
      if (token !== this.partidosToken) {return;}
      this.emitPartidos({
        status: 'error',
        partidos: this.partidosState.partidos,
        error: toErrorMessage(err, PARTIDOS_ERROR_MESSAGE),
      });
    }
  }

  // --- Sincronización de temporada (POST /me/temporada) ---------------------

  getSyncState(): SyncState {
    return this.syncState;
  }

  subscribeSync(listener: SyncStateListener): () => void {
    this.syncListeners.add(listener);
    listener(this.syncState);
    return () => {
      this.syncListeners.delete(listener);
    };
  }

  /**
   * Sincroniza la temporada del usuario desde la API deportiva y, al terminar
   * con éxito, recarga el perfil para que la temporada activa quede reflejada.
   * Siempre resuelve; ante fallo deja el estado en `error` sin lanzar.
   */
  async syncTemporada(temporadaExterna: string): Promise<void> {
    this.emitSync({ status: 'syncing', result: this.syncState.result, error: null });
    try {
      const result = await this.client.syncTemporada(temporadaExterna);
      this.emitSync({ status: 'done', result, error: null });
      // Refresca el perfil para exponer la temporada activa recién creada.
      await this.loadProfile();
    } catch (err) {
      this.emitSync({
        status: 'error',
        result: this.syncState.result,
        error: toErrorMessage(err, SYNC_ERROR_MESSAGE),
      });
    }
  }

  private emitSync(state: SyncState): void {
    this.syncState = state;
    for (const listener of this.syncListeners) {
      listener(state);
    }
  }

  // --- Edición de perfil (PATCH /me) ----------------------------------------

  getEditState(): EditState {
    return this.editState;
  }

  subscribeEdit(listener: EditStateListener): () => void {
    this.editListeners.add(listener);
    listener(this.editState);
    return () => {
      this.editListeners.delete(listener);
    };
  }

  /**
   * Actualiza los datos de perfil editables por el usuario (`nombre`, `alias`)
   * vía `PATCH /me`. Al terminar con éxito refleja el usuario devuelto en el
   * estado del perfil (sin recargar `GET /me` completo) y deja `edit` en `done`.
   * Siempre resuelve `true`/`false` según el resultado; nunca lanza a la UI.
   *
   * Nota: el correo NO se actualiza aquí (lo gestiona Supabase Auth, con
   * confirmación por email); esta vía es solo para los campos del backend.
   */
  async updateProfile(input: ActualizarPerfilInput): Promise<boolean> {
    this.emitEdit({ status: 'saving', error: null });
    try {
      const usuario = await this.client.actualizarPerfil(input);
      // Refleja el usuario actualizado en el perfil ya cargado (si lo hay).
      const actual = this.profileState.perfil;
      if (actual) {
        this.emitProfile({
          status: 'loaded',
          perfil: { ...actual, usuario },
          error: null,
        });
      }
      this.emitEdit({ status: 'done', error: null });
      return true;
    } catch (err) {
      this.emitEdit({ status: 'error', error: toErrorMessage(err, EDIT_ERROR_MESSAGE) });
      return false;
    }
  }

  /** Restablece el estado de edición a `idle` (p. ej. al cerrar el modal). */
  resetEdit(): void {
    this.emitEdit(INITIAL_EDIT);
  }

  private emitEdit(state: EditState): void {
    this.editState = state;
    for (const listener of this.editListeners) {
      listener(state);
    }
  }

  private emitProfile(state: ProfileState): void {
    this.profileState = state;
    for (const listener of this.profileListeners) {
      listener(state);
    }
  }

  private emitPartidos(state: PartidosState): void {
    this.partidosState = state;
    for (const listener of this.partidosListeners) {
      listener(state);
    }
  }
}
