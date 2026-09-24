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
  Perfil,
  PartidoLamina,
  ProfileClient,
} from '../adapters/http-profile-client';

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

export type ProfileStateListener = (state: ProfileState) => void;
export type PartidosStateListener = (state: PartidosState) => void;

const INITIAL_PROFILE: ProfileState = { status: 'idle', perfil: null, error: null };
const INITIAL_PARTIDOS: PartidosState = { status: 'idle', partidos: [], error: null };

/** Mensajes por defecto ante fallos de carga. */
export const PROFILE_ERROR_MESSAGE =
  'No se pudo cargar tu perfil. Intenta de nuevo.';
export const PARTIDOS_ERROR_MESSAGE =
  'No se pudieron cargar los partidos. Intenta de nuevo.';

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
  private readonly profileListeners = new Set<ProfileStateListener>();
  private readonly partidosListeners = new Set<PartidosStateListener>();
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
