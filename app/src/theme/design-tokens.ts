// design-tokens.ts — sistema de diseño del cliente (TypeScript PURO).
//
// Este módulo NO depende de React ni de React Native: es solo datos y funciones
// puras, por lo que PARTICIPA del typecheck de `app/tsconfig.json` (a diferencia
// de los `.tsx`, que están excluidos). Aquí vive la fuente de verdad del
// lenguaje visual de la app —paleta, tipografía, espaciado, radios y sombras—.
//
// Lenguaje visual "Stadium Night" (rediseño 2026, ver public/mockups/): canvas
// oscuro azul-medianoche, superficies glass translúcidas, marcadores tipo
// transmisión, bento grids y gamificación, con acento rojo sobrescribible por
// club. El look editorial de "álbum de figuritas" (papel, cromos) se conserva
// para el KIT FÍSICO impreso (public/album.html), no para la UI de la app.
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
  // -------------------------------------------------------------------------
  // "Stadium Night": canvas oscuro azul-medianoche con superficies glass.
  // La app dejó de ser "papel claro"; ese look editorial se conserva SOLO para
  // el kit físico impreso (public/album.html). Las claves conservan su ROL para
  // no renombrar en pantallas. Los valores de fondo/superficie ahora son
  // oscuros; los pares texto/fondo mantienen contraste WCAG AA documentado.
  // -------------------------------------------------------------------------

  /** Fondo "papel" cálido — se mantiene para siluetas de recuadro y assets del kit impreso. */
  paper: '#F7F1E2',
  /** Fondo base de la app (Stadium Night · azul-medianoche). Texto claro ≈ 16:1. */
  canvas: '#0B0E14',
  /** Superficie de tarjeta glass sobre el canvas (grafito translúcido resuelto a sólido). */
  surface: '#141A26',
  /** Fondo oscuro tipo "carbón" para héroes y pantallas inmersivas. */
  ink: '#0B0E14',
  /** Variante de tinta un punto más clara (degradados de héroe / superficie elevada). */
  inkSoft: '#141A26',

  /** Texto principal sobre superficies claras (kit impreso). #15181F sobre #F7F1E2 ≈ 15:1. */
  textOnLight: '#15181F',
  /** Texto secundario sobre claro. #5B6472 sobre #FFFFFF ≈ 5.7:1 (AA). */
  textMutedOnLight: '#5B6472',
  /** Texto principal sobre el canvas oscuro. #F4F1E8 sobre #0B0E14 ≈ 16:1. */
  textOnDark: '#F4F1E8',
  /** Texto secundario sobre oscuro. #AEB6C4 sobre #0B0E14 ≈ 9:1 (AA). */
  textMutedOnDark: '#AEB6C4',

  /** Acento de marca (rojo del mockup). Base; se puede sobrescribir por Club. */
  accent: '#C8102E',
  /** Acento más oscuro para estados presionados/bordes sobre claro. */
  accentDark: '#8A0B20',
  /** Texto legible SOBRE el acento. #FFFFFF sobre #C8102E ≈ 5.9:1 (AA). */
  onAccent: '#FFFFFF',

  /** Dorado para acentos "premium"/holograma (uso decorativo, no para texto fino). */
  gold: '#E6C46A',
  /** Dorado intenso/saturado para marcos destacados (p. ej. el marco del escudo). */
  goldStrong: '#F5B301',
  /** Verde "LIVE"/éxito luminoso sobre oscuro (píldoras EN VIVO, estados OK). */
  live: '#38E08A',

  /** Bordes sutiles sobre superficies claras (kit impreso). */
  borderOnLight: '#D9D0B8',
  /** Bordes sutiles sobre superficies oscuras. */
  borderOnDark: '#FFFFFF24',

  // --- Tokens de glassmorphism / Stadium Night -----------------------------
  /** Relleno translúcido de tarjeta glass (sobre canvas oscuro). */
  glassFill: '#FFFFFF12',
  /** Relleno glass más tenue (celdas secundarias / bento). */
  glassFillSoft: '#FFFFFF08',
  /** Borde translúcido de tarjeta glass. */
  glassBorder: '#FFFFFF1F',
  /** Extremos de degradado del héroe/tinta (para LinearGradient si se usa). */
  inkGradientFrom: '#1A2336',
  inkGradientTo: '#0B0E14',

  /** Semánticos sobre fondos OSCUROS (texto claro sobre chip tintado). */
  success: '#3FD07A', // texto claro sobre chip verde oscuro
  successBg: '#0B3A24',
  warning: '#F2C14E', // ámbar sobre chip cálido oscuro
  warningBg: '#3A2A06',
  danger: '#FF8A97', // rojo claro legible sobre chip oscuro
  dangerBg: '#3A1116',
  info: '#6AD0FF', // celeste sobre chip azul oscuro
  infoBg: '#0B2A3A',
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
  xl: 18,
  pill: 999,
  sticker: 8,
  card: 14,
  glass: 16,
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
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  crest: {
    shadowColor: '#000000',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  /** Glow del acento para CTAs primarios (se colorea en runtime con el club). */
  glow: {
    shadowColor: '#C8102E',
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
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
