// design-tokens.ts — sistema de diseño del cliente (TypeScript PURO).
//
// Este módulo NO depende de React ni de React Native: es solo datos y funciones
// puras, por lo que PARTICIPA del typecheck de `app/tsconfig.json` (a diferencia
// de los `.tsx`, que están excluidos). Aquí vive la fuente de verdad del
// lenguaje visual de la app —paleta, tipografía, espaciado, radios y sombras—
// derivado del mockup `public/album.html` (look editorial de "álbum de
// figuritas": fondo papel, acento rojo, títulos condensados, cromos y stickers).
//
// Objetivos de diseño:
//   - Colores EXPLÍCITOS, independientes del tema claro/oscuro del SO, con
//     contraste WCAG AA (>= 4.5:1 para texto normal) sobre sus fondos previstos
//     (preferencia del usuario 2026-09-24). Los pares texto/fondo relevantes se
//     documentan con su ratio aproximado.
//   - Escala tipográfica y de espaciado consistentes para reemplazar los valores
//     "sueltos" que hoy tiene cada pantalla en su `StyleSheet.create`.
//   - Un color de acento que puede sobrescribirse en runtime con el `ClubTheme`
//     del Club seleccionado (colors.accent) sin cambiar estos tokens base.
//
// La conversión de estos tokens a `StyleSheet.create` de RN se hace en cada
// `.tsx` (o en helpers `.tsx`); este archivo se mantiene agnóstico del framework.

/**
 * Paleta base del sistema. Los nombres describen el ROL, no el color, para poder
 * ajustarlos sin renombrar en las pantallas. Derivada del mockup `album.html`.
 */
export const palette = {
  /** Fondo "papel" cálido de las superficies claras (páginas del álbum). */
  paper: '#F7F1E2',
  /** Fondo de la app en claro (papel algo más apagado). */
  canvas: '#EFE9DB',
  /** Superficie de tarjeta sobre `canvas` (blanco hueso). */
  surface: '#FFFFFF',
  /** Fondo oscuro tipo "carbón" para héroes y pantallas inmersivas. */
  ink: '#15181F',
  /** Variante de tinta un punto más clara (degradados de héroe). */
  inkSoft: '#232833',

  /** Texto principal sobre superficies claras. #15181F sobre #F7F1E2 ≈ 15:1. */
  textOnLight: '#15181F',
  /** Texto secundario/apagado sobre claro. #5B6472 sobre #FFFFFF ≈ 5.7:1 (AA). */
  textMutedOnLight: '#5B6472',
  /** Texto principal sobre superficies oscuras. #F4F1E8 sobre #15181F ≈ 15:1. */
  textOnDark: '#F4F1E8',
  /** Texto secundario sobre oscuro. #AEB6C4 sobre #15181F ≈ 8.3:1. */
  textMutedOnDark: '#AEB6C4',

  /** Acento de marca (rojo del mockup). Base; se puede sobrescribir por Club. */
  accent: '#C8102E',
  /** Acento más oscuro para estados presionados/bordes sobre claro. */
  accentDark: '#8A0B20',
  /** Texto legible SOBRE el acento. #FFFFFF sobre #C8102E ≈ 5.9:1 (AA). */
  onAccent: '#FFFFFF',

  /** Dorado para acentos "premium"/holograma (uso decorativo, no para texto fino). */
  gold: '#E6C46A',

  /** Bordes sutiles sobre superficies claras. */
  borderOnLight: '#D9D0B8',
  /** Bordes sutiles sobre superficies oscuras. */
  borderOnDark: '#FFFFFF24',

  /** Semánticos con contraste AA sobre fondos claros. */
  success: '#1B5E20', // sobre blanco ≈ 8.9:1
  successBg: '#E8F5E9',
  warning: '#8D6E00', // sobre blanco ≈ 5.2:1
  warningBg: '#FFF8E1',
  danger: '#B00020', // sobre blanco ≈ 7.4:1
  dangerBg: '#FDECEC',
  info: '#0B56B8', // sobre blanco ≈ 6.2:1
  infoBg: '#EEF5FF',
} as const;

/** Escala de espaciado (múltiplos de 4) para paddings/margins/gaps. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/** Radios de esquina. `sticker`/`card` imitan los cromos del mockup. */
export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  pill: 999,
  sticker: 5,
  card: 14,
} as const;

/**
 * Familias tipográficas. El mockup usa "Bebas Neue" (condensada, para títulos
 * tipo cartel) e "Inter" para el cuerpo. En RN estas fuentes deben registrarse
 * (react-native.config / assets). Se exponen los NOMBRES aquí; si la fuente no
 * está instalada, RN cae a la del sistema, por lo que la UI degrada con gracia.
 */
export const fonts = {
  /** Títulos condensados tipo cartel (portadas, marcadores). */
  display: 'BebasNeue-Regular',
  /** Cuerpo y controles. */
  body: 'Inter',
} as const;

/** Escala de tamaños de fuente (pt) coherente con la jerarquía del mockup. */
export const fontSize = {
  caption: 11,
  small: 13,
  body: 15,
  subtitle: 17,
  title: 22,
  display: 28,
  hero: 40,
} as const;

/** Pesos tipográficos como literales aceptados por RN (`fontWeight`). */
export const fontWeight = {
  regular: '400',
  semibold: '600',
  bold: '700',
  extrabold: '800',
} as const;

/**
 * Sombras multiplataforma. En iOS se usan `shadow*`; en Android, `elevation`.
 * Se exponen como objetos planos listos para esparcir en un estilo de RN.
 */
export const shadow = {
  card: {
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  crest: {
    shadowColor: '#000000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
} as const;

/**
 * Tipos derivados de los tokens para tipar props/estilos en las pantallas sin
 * repetir literales. `as const` arriba los mantiene estrechos.
 */
export type Palette = typeof palette;
export type SpacingToken = keyof typeof spacing;
export type RadiusToken = keyof typeof radius;
export type FontSizeToken = keyof typeof fontSize;

/**
 * Tema efectivo que consume la UI: parte de los tokens base y permite
 * sobrescribir el acento con el color del Club seleccionado (`ClubTheme`), sin
 * mutar los tokens globales. Devuelve un objeto plano y estable.
 *
 * @param clubAccentHex Color de acento del Club (`ClubTheme.colors.accent`), o
 *   `null`/`undefined` para usar el acento de marca por defecto.
 */
export function buildTheme(clubAccentHex?: string | null): {
  readonly palette: Omit<Palette, 'accent'> & { readonly accent: string };
  readonly spacing: typeof spacing;
  readonly radius: typeof radius;
  readonly fonts: typeof fonts;
  readonly fontSize: typeof fontSize;
  readonly fontWeight: typeof fontWeight;
  readonly shadow: typeof shadow;
} {
  const accent =
    typeof clubAccentHex === 'string' && isHexColor(clubAccentHex)
      ? clubAccentHex
      : palette.accent;
  return {
    palette: { ...palette, accent },
    spacing,
    radius,
    fonts,
    fontSize,
    fontWeight,
    shadow,
  };
}

/** Tema efectivo resultante de `buildTheme`. */
export type AppTheme = ReturnType<typeof buildTheme>;

/** ¿Es `value` un color hex `#RGB` o `#RRGGBB` (opcionalmente con alfa)? */
export function isHexColor(value: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value.trim());
}
