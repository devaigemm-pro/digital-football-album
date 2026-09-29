// Preferencia de color de fondo del hincha (personalización de la app).
//
// El hincha puede elegir el color del canvas de fondo entre una paleta curada.
// Es una preferencia de UI PURAMENTE LOCAL (no dato de negocio): se persiste en
// el dispositivo vía un puerto inyectable (`BackgroundPreferenceStore`), sin
// tocar el backend.
//
// TypeScript PURO (sin React ni APIs nativas): la lista de opciones, la
// validación y la resolución del color viven aquí y son unit-testables. El
// provider `.tsx` (`BackgroundProvider`) consume este módulo y aplica el color
// al `Screen` del kit.
//
// Contraste (preferencia del proyecto: WCAG AA >= 4.5:1 sin depender del tema
// del SO): todas las opciones son fondos OSCUROS pensados para el texto claro
// `palette.textOnDark` (#F4F1E8), que sobre estos colores queda >= 8:1.

/** Opción de color de fondo elegible por el hincha. */
export interface OpcionFondo {
  /** Identificador estable persistido (no cambia aunque cambie el label). */
  readonly id: string;
  /** Nombre visible en el selector. */
  readonly label: string;
  /** Color hex del canvas de fondo (#RRGGBB), oscuro para texto claro AA. */
  readonly color: string;
}

/**
 * Paleta curada de fondos. El primero (`stadium`) es el canvas por defecto de
 * Stadium Night. Todos son oscuros: el texto claro conserva contraste AA.
 */
export const OPCIONES_FONDO: readonly OpcionFondo[] = [
  { id: 'stadium', label: 'Estadio (por defecto)', color: '#0B0E14' },
  { id: 'medianoche', label: 'Medianoche', color: '#0A1224' },
  { id: 'pizarra', label: 'Pizarra', color: '#12161C' },
  { id: 'bosque', label: 'Bosque', color: '#0C1A14' },
  { id: 'vino', label: 'Vino', color: '#1A0E14' },
  { id: 'purpura', label: 'Púrpura', color: '#150C22' },
  { id: 'cafe', label: 'Café', color: '#1A130C' },
  { id: 'carbon', label: 'Carbón', color: '#0A0A0A' },
];

/** Color de fondo por defecto (canvas Stadium Night). */
export const COLOR_FONDO_POR_DEFECTO: string = OPCIONES_FONDO[0]!.color;

/** ¿El color pertenece a la paleta de opciones válidas? */
export function esColorFondoValido(color: string | null | undefined): color is string {
  if (typeof color !== 'string') {
    return false;
  }
  const normal = color.trim().toUpperCase();
  return OPCIONES_FONDO.some((o) => o.color.toUpperCase() === normal);
}

/**
 * Resuelve el color a aplicar a partir de un valor persistido (posiblemente
 * inválido/ausente): devuelve el color si es una opción válida, o el color por
 * defecto en cualquier otro caso. Nunca lanza.
 */
export function resolverColorFondo(persistido: string | null | undefined): string {
  return esColorFondoValido(persistido) ? persistido : COLOR_FONDO_POR_DEFECTO;
}

/** Opción correspondiente a un color (o `null` si no está en la paleta). */
export function opcionDeColor(color: string | null | undefined): OpcionFondo | null {
  if (typeof color !== 'string') {
    return null;
  }
  const normal = color.trim().toUpperCase();
  return OPCIONES_FONDO.find((o) => o.color.toUpperCase() === normal) ?? null;
}

/**
 * Puerto de persistencia local de la preferencia de fondo. Lo implementa un
 * adaptador sobre AsyncStorage en producción y un doble en pruebas. Nunca debe
 * lanzar hacia la UI: ante fallo, `get` devuelve `null` (se usará el defecto).
 */
export interface BackgroundPreferenceStore {
  /** Lee el color de fondo persistido, o `null` si no hay/o falló. */
  get(): Promise<string | null>;
  /** Persiste el color de fondo elegido. */
  set(color: string): Promise<void>;
}

/** Clave de almacenamiento local de la preferencia de fondo. */
export const BACKGROUND_STORAGE_KEY = 'hincha.background.color';
