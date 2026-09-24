// ClubThemeViewModel — personalización visual de la UI por Club (Req 2.1, 2.2).
//
// La App_Móvil aplica la identidad visual del Club seleccionado a la interfaz:
// paleta de colores, escudo, imágenes de estadio y camisetas (design.md ·
// "App_Móvil (presentación y captura)" · Req 2.1, 2.2). Este view-model es el
// puente puro entre la `IdentidadVisual` que devuelve el backend y un
// **descriptor de tema** (`ClubTheme`) que la capa de UI (Flutter / React
// Native / web) consume para pintar colores y montar assets, sin acoplarse al
// framework de renderizado.
//
// Responsabilidades:
//   1. Solicitar la asignación/cambio de Club al backend y mapear la
//      `IdentidadVisual` resultante a un `ClubTheme` (Req 2.1, 2.2).
//   2. Exponer el tema actual y notificar a la UI cuando cambia, de modo que al
//      seleccionar o actualizar el Club la interfaz refleje el nuevo tema.
//
// Es framework-agnóstico y unit-testable: depende solo de `ClubClient`
// (interfaz inyectable) y de una función de suscripción sencilla.
//
// Task 21.1 — Requirements: 2.1, 2.2

import type { UUID } from '../domain/types.js';
import type { ClubClient, IdentidadVisual } from './backend-clients.js';

/**
 * Descriptor de tema visual que la capa de UI aplica directamente (Req 2.1,
 * 2.2). Normaliza la `IdentidadVisual` del backend en una forma estable y
 * plana: colores, escudo y colecciones de assets del Club.
 */
export interface ClubTheme {
  /** Club al que corresponde el tema. */
  readonly clubId: UUID;
  /** Nombre del Club (títulos, etiquetas de accesibilidad). */
  readonly clubNombre: string;
  /** Colores del tema derivados de la paleta del Club (Req 2.1). */
  readonly colors: {
    readonly primary: string;
    readonly secondary: string;
    /** Color de acento; cae al primario si el Club no define uno. */
    readonly accent: string;
  };
  /** URL del escudo del Club (Req 2.1). */
  readonly crestUrl: string;
  /** Assets visuales del Club (estadio, camisetas) para fondos y adornos (Req 2.1). */
  readonly assets: {
    readonly stadiumUrls: readonly string[];
    readonly kitUrls: readonly string[];
  };
}

/**
 * Mapea una `IdentidadVisual` del backend a un `ClubTheme` para la UI (Req 2.1,
 * 2.2). Función pura, sin efectos: útil para pruebas de snapshot del tema.
 *
 * El color de acento cae al primario cuando el Club no define `acento`, de modo
 * que el tema siempre expone un acento válido para la UI.
 */
export function mapIdentidadVisualToTheme(identidad: IdentidadVisual): ClubTheme {
  return {
    clubId: identidad.clubId,
    clubNombre: identidad.nombre,
    colors: {
      primary: identidad.paletaColores.primario,
      secondary: identidad.paletaColores.secundario,
      accent: identidad.paletaColores.acento ?? identidad.paletaColores.primario,
    },
    crestUrl: identidad.escudoUrl,
    assets: {
      stadiumUrls: [...identidad.activosVisuales.estadioUrls],
      kitUrls: [...identidad.activosVisuales.camisetaUrls],
    },
  };
}

/** Oyente que la UI registra para reaccionar al cambio de tema. */
export type ThemeListener = (theme: ClubTheme) => void;

/**
 * View-model de personalización visual por Club. Orquesta la asignación de Club
 * contra el `ClubClient`, mantiene el tema actual y notifica a la UI cuando
 * cambia (Req 2.1, 2.2).
 */
export class ClubThemeViewModel {
  private current: ClubTheme | null = null;
  private readonly listeners = new Set<ThemeListener>();

  constructor(private readonly client: ClubClient) {}

  /** Tema actualmente aplicado, o `null` si aún no se ha seleccionado Club. */
  get theme(): ClubTheme | null {
    return this.current;
  }

  /**
   * Registra un oyente para los cambios de tema y devuelve una función para
   * cancelar la suscripción. Si ya hay un tema aplicado, lo emite de inmediato.
   */
  subscribe(listener: ThemeListener): () => void {
    this.listeners.add(listener);
    if (this.current !== null) {
      listener(this.current);
    }
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Selecciona (o cambia) el Club del usuario: pide al backend la identidad
   * visual, la mapea a un `ClubTheme`, lo fija como tema actual y notifica a los
   * oyentes (Req 2.1, 2.2).
   *
   * @param usuarioId Usuario cuyo Club se asigna.
   * @param clubId Club a aplicar.
   * @returns El `ClubTheme` resultante ya aplicado.
   */
  async selectClub(usuarioId: UUID, clubId: UUID): Promise<ClubTheme> {
    const identidad = await this.client.asignarClub(usuarioId, clubId);
    const theme = mapIdentidadVisualToTheme(identidad);
    this.current = theme;
    this.emit(theme);
    return theme;
  }

  private emit(theme: ClubTheme): void {
    for (const listener of this.listeners) {
      listener(theme);
    }
  }
}
