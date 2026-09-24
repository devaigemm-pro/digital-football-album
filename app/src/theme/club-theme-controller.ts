// ClubThemeController — núcleo framework-agnóstico del provider de Tema_Club.
//
// Task 27.1 — Requirements: 23.1, 23.2, 23.3, 23.4, 23.5
//
// La App_Móvil aplica la identidad visual del Club seleccionado a la interfaz.
// Este controlador es la CAPA DE LÓGICA PURA (TypeScript sin React) que envuelve
// al `ClubThemeViewModel` reutilizado del backend (`src/app`) y le añade lo que
// necesita el context/provider de React (`ClubThemeProvider.tsx`):
//
//   - Estado observable del `ClubTheme | null` actual con API subscribe/getState
//     que la capa de React puede enlazar (Req 23.2, 23.3).
//   - `selectClub(usuarioId, clubId)` que invoca `PUT /usuario/club` vía
//     `ClubClient`, deriva el Tema_Club de la `IdentidadVisual` y lo aplica
//     (Req 23.1, 23.2, 23.4).
//   - Manejo del `409 Conflict` por Temporada activa: NO cambia el tema/Club
//     actual y devuelve un resultado tipado con el mensaje explicativo, sin
//     lanzar, para que la UI lo muestre conservando el Club (Req 23.5).
//   - Helper de contraste (color de texto seguro) sobre los colores del tema
//     para apoyar el requisito de contraste de la UI (Req 29 / 23.3).
//
// Toda la lógica sensible a la corrección vive aquí (TS puro y unit-testable);
// el `.tsx` del provider es una envoltura delgada que solo cablea este
// controlador a un React Context.

import type {
  ClubClient,
  ClubTheme,
  IdentidadVisual,
} from '../viewmodels';
import { ClubThemeViewModel, mapIdentidadVisualToTheme } from '../viewmodels';

/** Identificador opaco (UUID) tal como lo usan los view-models reutilizados. */
export type ClubThemeUUID = string;

/** Código estable del conflicto de cambio de Club por Temporada activa (Req 23.5). */
export const CLUB_CHANGE_CONFLICT = 'CLUB_CHANGE_CONFLICT' as const;

/** Mensaje por defecto mostrado ante el `409` de Temporada activa (Req 23.5). */
export const CLUB_CHANGE_CONFLICT_MESSAGE =
  'Debes cerrar la Temporada activa antes de cambiar de Club.';

/**
 * Resultado tipado de `selectClub`. En el caso feliz aplica el nuevo
 * `ClubTheme`; ante el `409` de Temporada activa NO cambia el Club actual y
 * describe el conflicto para que la UI lo muestre (Req 23.4, 23.5).
 */
export type SelectClubResult =
  | { readonly ok: true; readonly theme: ClubTheme }
  | {
      readonly ok: false;
      readonly code: typeof CLUB_CHANGE_CONFLICT;
      readonly message: string;
    };

/** Oyente del estado del tema; recibe el `ClubTheme | null` actual. */
export type ClubThemeStateListener = (theme: ClubTheme | null) => void;

/**
 * Forma laxa de un error de conflicto que puede lanzar el adaptador `ClubClient`
 * al recibir `409`. No se acopla a una implementación concreta: se reconoce por
 * un estado HTTP `409` (`status`/`statusCode`) o por un código `CLUB_CHANGE_CONFLICT`.
 */
interface ConflictLike {
  readonly status?: unknown;
  readonly statusCode?: unknown;
  readonly code?: unknown;
  readonly message?: unknown;
}

/**
 * ¿Representa `err` el conflicto `409` por Temporada activa? (Req 23.5)
 *
 * Se acepta cualquiera de estas señales, de modo que el controlador funcione
 * con distintos adaptadores/errores del módulo de red sin acoplarse a ellos:
 *   - `status === 409` o `statusCode === 409` (error HTTP crudo), o
 *   - `code === 'CLUB_CHANGE_CONFLICT'` (error ya mapeado por la capa de red).
 */
function isClubChangeConflict(err: unknown): err is ConflictLike {
  if (typeof err !== 'object' || err === null) {
    return false;
  }
  const e = err as ConflictLike;
  return (
    e.status === 409 ||
    e.statusCode === 409 ||
    e.code === CLUB_CHANGE_CONFLICT
  );
}

/** Extrae un mensaje legible del error, con respaldo al mensaje por defecto. */
function conflictMessage(err: unknown): string {
  if (typeof err === 'object' && err !== null) {
    const m = (err as ConflictLike).message;
    if (typeof m === 'string' && m.trim().length > 0) {
      return m;
    }
  }
  return CLUB_CHANGE_CONFLICT_MESSAGE;
}

/**
 * Controlador del Tema_Club: fuente de verdad observable que el provider de
 * React enlaza. Envuelve al `ClubThemeViewModel` reutilizado y expone una API
 * `getState`/`subscribe` estable más `selectClub` con manejo del `409`.
 */
export class ClubThemeController {
  private readonly vm: ClubThemeViewModel;
  private readonly listeners = new Set<ClubThemeStateListener>();

  /**
   * @param client Adaptador de `ClubClient` (`PUT /usuario/club`). Se inyecta
   *   para permitir clientes en memoria en pruebas y un adaptador HTTP en
   *   producción.
   * @param viewModel View-model opcional ya construido (útil en pruebas). Por
   *   defecto se crea uno nuevo sobre `client`.
   */
  constructor(client: ClubClient, viewModel?: ClubThemeViewModel) {
    this.vm = viewModel ?? new ClubThemeViewModel(client);
  }

  /** Tema actualmente aplicado, o `null` si aún no se seleccionó Club (Req 23.3). */
  getState(): ClubTheme | null {
    return this.vm.theme;
  }

  /**
   * Registra un oyente del estado del tema y devuelve la función para cancelar
   * la suscripción. Emite el estado actual de inmediato para que la UI se
   * inicialice con el tema vigente (Req 23.2, 23.3).
   */
  subscribe(listener: ClubThemeStateListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Selecciona (o cambia) el Club: invoca `PUT /usuario/club`, deriva el
   * Tema_Club de la `IdentidadVisual` y lo aplica notificando a los oyentes
   * (Req 23.1, 23.2, 23.4).
   *
   * Ante un `409` por Temporada activa NO modifica el Club/tema actual y
   * devuelve `{ ok: false, code: CLUB_CHANGE_CONFLICT, message }` para que la UI
   * muestre el mensaje conservando el Club (Req 23.5). Cualquier otro error se
   * propaga sin alterar el estado.
   */
  async selectClub(
    usuarioId: ClubThemeUUID,
    clubId: ClubThemeUUID,
  ): Promise<SelectClubResult> {
    try {
      const theme = await this.vm.selectClub(usuarioId, clubId);
      this.emit(theme);
      return { ok: true, theme };
    } catch (err) {
      if (isClubChangeConflict(err)) {
        // Conserva el Club/tema actual; solo se informa el conflicto (Req 23.5).
        return {
          ok: false,
          code: CLUB_CHANGE_CONFLICT,
          message: conflictMessage(err),
        };
      }
      throw err;
    }
  }

  private emit(theme: ClubTheme | null): void {
    for (const listener of this.listeners) {
      listener(theme);
    }
  }
}

/**
 * Deriva un color de texto con buen contraste (negro o blanco) sobre un color
 * de fondo del tema, para apoyar el requisito de contraste de la UI (Req 29 /
 * 23.3). Usa la luminancia relativa (WCAG) del fondo: si es claro devuelve texto
 * oscuro, y viceversa.
 *
 * @param backgroundHex Color de fondo en formato `#RGB` o `#RRGGBB`.
 * @returns `'#000000'` (texto oscuro) o `'#FFFFFF'` (texto claro).
 */
export function contrastingTextColor(backgroundHex: string): '#000000' | '#FFFFFF' {
  const { r, g, b } = parseHexColor(backgroundHex);
  // Luminancia relativa WCAG 2.x sobre canales linealizados.
  const lum =
    0.2126 * channelLuminance(r) +
    0.7152 * channelLuminance(g) +
    0.0722 * channelLuminance(b);
  // Umbral estándar: fondos con luminancia > ~0.179 llevan texto oscuro.
  return lum > 0.179 ? '#000000' : '#FFFFFF';
}

/** Canal sRGB [0..255] -> componente lineal para el cálculo de luminancia. */
function channelLuminance(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Parsea `#RGB`/`#RRGGBB` a componentes 0..255. Lanza si el formato es inválido. */
function parseHexColor(hex: string): { r: number; g: number; b: number } {
  const cleaned = hex.trim().replace(/^#/, '');
  let full: string;
  if (cleaned.length === 3) {
    full = cleaned
      .split('')
      .map((ch) => ch + ch)
      .join('');
  } else if (cleaned.length === 6) {
    full = cleaned;
  } else {
    throw new Error(`Color hex inválido: "${hex}" (se espera #RGB o #RRGGBB).`);
  }
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    throw new Error(`Color hex inválido: "${hex}" (dígitos no hexadecimales).`);
  }
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

// Re-export de conveniencia del mapeo puro para consumidores del controlador.
export { mapIdentidadVisualToTheme };
export type { ClubTheme, IdentidadVisual };
