// kit.tsx — componentes de UI compartidos que materializan el lenguaje visual
// del mockup `public/album.html` (look editorial de "álbum de figuritas").
//
// ⚠️ Este archivo es `.tsx`: importa React y React Native, por lo que está
// EXCLUIDO del typecheck de `app/tsconfig.json` (RN no instalado en este
// entorno). Es código real para cuando se instale el toolchain del cliente.
//
// NO contiene lógica de negocio. Solo presentación: toma los tokens PUROS de
// `../theme/design-tokens` (que sí typechean) y expone piezas reutilizables para
// que cada pantalla luzca consistente sin repetir literales:
//   - <Screen>       superficie base (clara u oscura) con padding estándar.
//   - <Hero>         cabecera inmersiva con degradado hacia la tinta y acento.
//   - <SectionCard>  tarjeta de contenido sobre superficie clara.
//   - <PrimaryButton>/<SecondaryButton>/<DangerButton>  botones del sistema.
//   - <Crest>        escudo del Club (imagen si hay `crestUrl`, si no monograma).
//   - <Chip>         píldora seleccionable (filtros/segmentos).
//   - <StickerSlot>  recuadro/sticker numerado (montado o vacío) del álbum.
//   - <TabBar>       barra inferior de navegación con la pestaña activa.
//   - <Badge>        etiqueta pequeña (p. ej. "FALTA", "PREMIUM").
//
// El color de acento sale de `useAppTheme()`, que combina los tokens con el
// `ClubTheme` del Club seleccionado (si hay provider). Todos los colores son
// EXPLÍCITOS y con contraste AA sobre su fondo previsto (preferencia del usuario).

import React from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import {
  buildTheme,
  fonts,
  fontSize,
  fontWeight,
  palette,
  radius,
  shadow,
  spacing,
  type AppTheme,
} from '../theme/design-tokens';

// El provider de Tema_Club es opcional: si la pantalla se monta fuera de él
// (tests, Storybook), caemos al acento de marca sin romper.
import { useClubTheme } from '../theme/ClubThemeProvider';
import { useBackgroundColor } from '../theme/BackgroundProvider';

/**
 * Devuelve el tema efectivo (tokens + acento del Club). Si no hay
 * `ClubThemeProvider` en el árbol, usa el acento de marca por defecto.
 */
export function useAppTheme(): AppTheme {
  let accent: string | null = null;
  try {
    // useClubTheme lanza fuera del provider; lo capturamos para degradar.
    const club = useClubTheme();
    accent = club.theme?.colors.accent ?? null;
  } catch {
    accent = null;
  }
  return buildTheme(accent);
}

// ---------------------------------------------------------------------------
// Superficies
// ---------------------------------------------------------------------------

export interface ScreenProps {
  /** Fondo: 'light' (papel) por defecto o 'dark' (tinta inmersiva). */
  readonly tone?: 'light' | 'dark';
  /** Sin padding lateral (para listas a sangre). */
  readonly flush?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly children?: React.ReactNode;
}

/** Superficie base de una pantalla, con fondo y padding del sistema. */
export function Screen({
  tone = 'light',
  flush = false,
  style,
  children,
}: ScreenProps): React.ReactElement {
  // Fondo elegido por el hincha (personalización). Sustituye el canvas base en
  // ambos tonos; si se monta fuera del provider, cae al canvas por defecto.
  const backgroundColor = useBackgroundColor();
  return (
    <View
      style={[
        styles.screen,
        tone === 'dark' ? styles.screenDark : styles.screenLight,
        { backgroundColor },
        flush ? null : styles.screenPadded,
        style,
      ]}
    >
      {children}
    </View>
  );
}

export interface HeroProps {
  /** Antetítulo pequeño en mayúsculas (opcional). */
  readonly eyebrow?: string;
  /** Título grande condensado. */
  readonly title: string;
  /**
   * Si es `true`, el título reduce su tamaño SOLO cuando ocupa 2+ líneas (p. ej.
   * un nombre de rival largo), para que no se vea desbordado. Con una sola línea
   * conserva el tamaño grande.
   */
  readonly adaptiveTitle?: boolean;
  /** Contenido extra bajo el título (marcador, escudos, etc.). */
  readonly children?: React.ReactNode;
  readonly style?: StyleProp<ViewStyle>;
}

/** Cabecera inmersiva estilo "cartel" con degradado hacia la tinta. */
export function Hero({
  eyebrow,
  title,
  adaptiveTitle = false,
  children,
  style,
}: HeroProps): React.ReactElement {
  const theme = useAppTheme();
  // Título adaptable: si el nombre es largo, RN reduce la fuente para que quepa
  // en UNA sola línea (`adjustsFontSizeToFit` + `numberOfLines={1}`). Escalado
  // NATIVO, sin estado de React: evita el bucle medir→reescalar (parpadeo).
  return (
    <View style={[styles.hero, { borderBottomColor: theme.palette.accent }, style]}>
      {eyebrow ? <Text style={styles.heroEyebrow}>{eyebrow.toUpperCase()}</Text> : null}
      <Text
        style={styles.heroTitle}
        numberOfLines={adaptiveTitle ? 1 : undefined}
        adjustsFontSizeToFit={adaptiveTitle}
        minimumFontScale={adaptiveTitle ? 0.4 : undefined}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

export interface SectionCardProps {
  readonly title?: string;
  readonly style?: StyleProp<ViewStyle>;
  readonly children?: React.ReactNode;
}

/** Tarjeta de contenido sobre superficie clara, con sombra suave. */
export function SectionCard({ title, style, children }: SectionCardProps): React.ReactElement {
  return (
    <View style={[styles.card, style]}>
      {title ? <Text style={styles.cardTitle}>{title}</Text> : null}
      {children}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Botones
// ---------------------------------------------------------------------------

interface ButtonProps {
  readonly title: string;
  readonly onPress?: () => void;
  readonly disabled?: boolean;
  readonly accessibilityLabel?: string;
  readonly style?: StyleProp<ViewStyle>;
}

/** Botón primario relleno con el acento del Club (texto blanco, AA). */
export function PrimaryButton({
  title,
  onPress,
  disabled = false,
  accessibilityLabel,
  style,
}: ButtonProps): React.ReactElement {
  const theme = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: theme.palette.accent, shadowColor: theme.palette.accent },
        styles.btnGlow,
        pressed ? styles.btnPressed : null,
        disabled ? styles.btnDisabled : null,
        style,
      ]}
    >
      <Text style={[styles.btnText, { color: palette.onAccent }]}>{title}</Text>
    </Pressable>
  );
}

/** Botón secundario con borde (sobre fondo oscuro o claro). */
export function SecondaryButton({
  title,
  onPress,
  disabled = false,
  accessibilityLabel,
  tone = 'dark',
  style,
}: ButtonProps & { readonly tone?: 'light' | 'dark' }): React.ReactElement {
  const border = tone === 'dark' ? palette.borderOnDark : palette.borderOnLight;
  const color = tone === 'dark' ? palette.textOnDark : palette.textOnLight;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        styles.btnOutline,
        { borderColor: border },
        pressed ? styles.btnPressed : null,
        disabled ? styles.btnDisabled : null,
        style,
      ]}
    >
      <Text style={[styles.btnText, { color }]}>{title}</Text>
    </Pressable>
  );
}

/** Botón destructivo (zona de peligro). */
export function DangerButton({
  title,
  onPress,
  disabled = false,
  accessibilityLabel,
  style,
}: ButtonProps): React.ReactElement {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: palette.danger },
        pressed ? styles.btnPressed : null,
        disabled ? styles.btnDisabled : null,
        style,
      ]}
    >
      <Text style={[styles.btnText, styles.btnTextOnDanger]}>{title}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Escudo del Club
// ---------------------------------------------------------------------------

export interface CrestProps {
  /** URL del escudo (ClubTheme.crestUrl). Si falta, se pinta un monograma. */
  readonly url?: string | null;
  /** Iniciales de respaldo cuando no hay escudo. */
  readonly monogram?: string;
  /** Lado del cuadro (px). */
  readonly size?: number;
  readonly style?: StyleProp<ViewStyle>;
}

/** Escudo del Club con forma de crest; imagen si hay URL, si no monograma. */
export function Crest({ url, monogram = '', size = 48, style }: CrestProps): React.ReactElement {
  const box: ViewStyle = {
    width: size,
    height: size * 1.18,
    borderRadius: radius.sm,
    borderBottomLeftRadius: size / 2,
    borderBottomRightRadius: size / 2,
    // Marco fino y dorado, separado del escudo (aire interior) para un aspecto
    // estilizado (preferencia del usuario).
    borderColor: palette.goldStrong,
    padding: Math.max(3, size * 0.12),
  };
  if (url) {
    return (
      <View style={[styles.crest, box, style]}>
        <Image
          source={{ uri: url }}
          style={styles.crestImg}
          accessibilityRole="image"
          accessibilityLabel="Escudo del club"
        />
      </View>
    );
  }
  return (
    <View style={[styles.crest, styles.crestMono, box, style]}>
      <Text style={[styles.crestText, { fontSize: size * 0.42 }]}>{monogram.slice(0, 3)}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Chip / Badge
// ---------------------------------------------------------------------------

export interface ChipProps {
  readonly label: string;
  readonly selected?: boolean;
  readonly onPress?: () => void;
  readonly style?: StyleProp<ViewStyle>;
}

/** Píldora seleccionable (filtros/segmentos), estilo mockup. */
export function Chip({ label, selected = false, onPress, style }: ChipProps): React.ReactElement {
  const theme = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.chip,
        selected ? { backgroundColor: theme.palette.accent, borderColor: theme.palette.accent } : null,
        style,
      ]}
    >
      <Text style={[styles.chipText, selected ? { color: palette.onAccent } : null]}>{label}</Text>
    </Pressable>
  );
}

/** Etiqueta pequeña de estado (p. ej. "FALTA", "PREMIUM"). */
export function Badge({
  label,
  tone = 'accent',
  style,
}: {
  readonly label: string;
  readonly tone?: 'accent' | 'gold' | 'muted';
  readonly style?: StyleProp<ViewStyle>;
}): React.ReactElement {
  const theme = useAppTheme();
  const bg =
    tone === 'gold' ? palette.gold : tone === 'muted' ? palette.borderOnLight : theme.palette.accent;
  const color = tone === 'accent' ? palette.onAccent : palette.textOnLight;
  return (
    <View style={[styles.badge, { backgroundColor: bg }, style]}>
      <Text style={[styles.badgeText, { color }]}>{label.toUpperCase()}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Sticker / Recuadro del álbum
// ---------------------------------------------------------------------------

export interface LaminaIconProps {
  /** Glifo de la lámina: 'star' (estrella dorada) o 'question' ("?" rojo). */
  readonly glyph: 'star' | 'question';
  /** Lado del recuadro (px). El alto se deriva con proporción de cromo 3/4→~1.2. */
  readonly size?: number;
  /**
   * Si es `true`, el glifo se dibuja como un badge circular SUPERPUESTO en el
   * vértice inferior derecho (mitad dentro/mitad fuera), igual que el "+" del
   * avatar. Si es `false` (por defecto), el glifo va centrado dentro de la lámina.
   */
  readonly corner?: boolean;
  /** Número mostrado DENTRO de la lámina (p. ej. el "2" del conteo 2/30). */
  readonly numero?: number | string;
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * Ícono de lámina: recuadro con borde PUNTEADO (silueta de sticker vacío).
 * Emblema del álbum reutilizado en el carné (conteo) y en la lista de partidos
 * (estado de cada lámina). El glifo: estrella dorada = montada, "?" rojo = falta.
 * Con `corner`, el glifo se ancla como badge en el vértice inferior derecho
 * (como el "+" del avatar) y la lámina puede llevar un `numero` dentro.
 */
export function LaminaIcon({
  glyph,
  size = 34,
  corner = false,
  numero,
  style,
}: LaminaIconProps): React.ReactElement {
  const glifo = glyph === 'star' ? '★' : '?';
  const color = glyph === 'star' ? palette.gold : palette.danger;
  const badge = size * 0.5; // diámetro del badge del vértice
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={glyph === 'star' ? 'Lámina montada' : 'Lámina por montar'}
      style={[styles.laminaIcon, { width: size, height: size * 1.18 }, style]}
    >
      {numero != null ? (
        <Text style={[styles.laminaNumero, { fontSize: size * 0.5 }]}>{numero}</Text>
      ) : null}

      {corner ? (
        // Badge del glifo superpuesto en el vértice inferior derecho.
        <View
          style={[
            styles.laminaCornerBadge,
            { width: badge, height: badge, borderRadius: badge / 2 },
          ]}
          pointerEvents="none"
        >
          <Text style={{ color, fontSize: badge * 0.7, lineHeight: badge * 0.8 }}>
            {glifo}
          </Text>
        </View>
      ) : (
        <Text style={{ color, fontSize: size * 0.5, lineHeight: size * 0.56 }}>{glifo}</Text>
      )}
    </View>
  );
}

export interface StickerSlotProps {
  /** Número del Recuadro (== número del Sticker; tolerante a huecos). */
  readonly numero: number | string;
  /** URI de la miniatura si el Recuadro está MONTADO; ausente => VACÍO. */
  readonly imageUri?: string | null;
  /** Etiqueta breve bajo el número (opcional). */
  readonly label?: string;
  /** Resalta el recuadro (p. ej. momento clave/holograma). */
  readonly highlight?: boolean;
  /** Oculta el badge de número sobre la miniatura (p. ej. la foto del carné). */
  readonly hideNumero?: boolean;
  readonly onPress?: () => void;
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * Recuadro coleccionable numerado. Montado: miniatura a sangre con número en
 * esquina. Vacío: silueta punteada con "Pega aquí". Refleja la invariante
 * Recuadro↔Sticker (el número es el mismo) y el look del álbum del mockup.
 */
export function StickerSlot({
  numero,
  imageUri,
  label,
  highlight = false,
  hideNumero = false,
  onPress,
  style,
}: StickerSlotProps): React.ReactElement {
  const theme = useAppTheme();
  const montado = Boolean(imageUri);
  const content = montado ? (
    <>
      <Image source={{ uri: imageUri as string }} style={styles.slotImg} accessibilityRole="image" />
      {hideNumero ? null : (
        <View style={[styles.slotNum, { backgroundColor: theme.palette.accent }]}>
          <Text style={styles.slotNumText}>{numero}</Text>
        </View>
      )}
      {label ? (
        <View style={styles.slotLabelWrap}>
          <Text style={styles.slotLabel} numberOfLines={1}>
            {label}
          </Text>
        </View>
      ) : null}
    </>
  ) : (
    <>
      <Text style={styles.slotEmptyNum}>{numero}</Text>
      <Text style={styles.slotEmptyLabel}>{label ?? 'Pega aquí'}</Text>
    </>
  );

  const slotStyle: StyleProp<ViewStyle> = [
    styles.slot,
    montado ? styles.slotMounted : styles.slotEmpty,
    highlight && montado ? { borderColor: palette.gold } : null,
    style,
  ];

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={
          montado ? `Recuadro ${numero} montado` : `Recuadro ${numero} vacío, falta la foto`
        }
        style={slotStyle}
      >
        {content}
      </Pressable>
    );
  }
  return (
    <View
      style={slotStyle}
      accessibilityLabel={
        montado ? `Recuadro ${numero} montado` : `Recuadro ${numero} vacío, falta la foto`
      }
    >
      {content}
    </View>
  );
}

// ---------------------------------------------------------------------------
// TabBar inferior
// ---------------------------------------------------------------------------

export interface TabBarProps {
  /** Etiquetas de las pestañas en orden. */
  readonly items: readonly string[];
  /** Índice de la pestaña activa. */
  readonly activeIndex: number;
  readonly onSelect?: (index: number) => void;
}

/** Barra inferior de navegación; la pestaña activa se pinta con el acento. */
export function TabBar({ items, activeIndex, onSelect }: TabBarProps): React.ReactElement {
  const theme = useAppTheme();
  return (
    <View style={styles.tabBar}>
      {items.map((label, i) => {
        const active = i === activeIndex;
        return (
          <Pressable
            key={label}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onSelect?.(i)}
            style={styles.tabItem}
          >
            <Text style={[styles.tabText, active ? { color: theme.palette.accent } : null]}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Textos utilitarios
// ---------------------------------------------------------------------------

/** Título de sección condensado (estilo "cartel"), sobre fondo claro. */
export function SectionTitle({
  children,
  style,
}: {
  readonly children: React.ReactNode;
  readonly style?: StyleProp<TextStyle>;
}): React.ReactElement {
  return <Text style={[styles.sectionTitle, style]}>{children}</Text>;
}

// ---------------------------------------------------------------------------
// Stadium Night: glass, bento, marcador tipo transmisión y gamificación
// ---------------------------------------------------------------------------

/** Tarjeta glass genérica (relleno translúcido + borde sutil sobre oscuro). */
export function GlassCard({
  style,
  soft = false,
  children,
}: {
  readonly style?: StyleProp<ViewStyle>;
  /** Variante más tenue (celdas secundarias). */
  readonly soft?: boolean;
  readonly children?: React.ReactNode;
}): React.ReactElement {
  return <View style={[styles.glass, soft ? styles.glassSoft : null, style]}>{children}</View>;
}

/** Contenedor bento: rejilla de celdas autónomas con gap uniforme. */
export function Bento({
  style,
  children,
}: {
  readonly style?: StyleProp<ViewStyle>;
  readonly children?: React.ReactNode;
}): React.ReactElement {
  return <View style={[styles.bento, style]}>{children}</View>;
}

/** Celda de un bento; `wide` ocupa el ancho completo de la fila. */
export function BentoCell({
  wide = false,
  style,
  children,
}: {
  readonly wide?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly children?: React.ReactNode;
}): React.ReactElement {
  return <View style={[styles.bentoCell, wide ? styles.bentoWide : null, style]}>{children}</View>;
}

/** Píldora de estado "EN VIVO"/"FINAL" con punto luminoso. */
export function LivePill({
  label = 'EN VIVO',
  live = true,
}: {
  readonly label?: string;
  readonly live?: boolean;
}): React.ReactElement {
  return (
    <View style={[styles.livePill, live ? null : styles.livePillFinal]}>
      <View style={[styles.liveDot, live ? null : styles.liveDotFinal]} />
      <Text style={[styles.livePillText, live ? null : styles.livePillTextFinal]}>
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

export interface ScoreboardProps {
  readonly homeMonogram: string;
  readonly awayMonogram: string;
  readonly homeCrestUrl?: string | null;
  readonly awayCrestUrl?: string | null;
  /** Marcador ya formateado, p. ej. "2 – 1". Ausente => partido no jugado. */
  readonly score?: string | null;
  /** Estado bajo el marcador (p. ej. "FINAL", "SÁB 19:30"). */
  readonly status?: string;
  /** Marca el estado como en vivo (píldora verde pulsante). */
  readonly live?: boolean;
  readonly style?: StyleProp<ViewStyle>;
}

/** Marcador tipo transmisión: resultado gigante flanqueado por escudos. */
export function Scoreboard({
  homeMonogram,
  awayMonogram,
  homeCrestUrl,
  awayCrestUrl,
  score,
  status,
  live = false,
  style,
}: ScoreboardProps): React.ReactElement {
  return (
    <View style={[styles.scoreboard, style]}>
      {status ? <LivePill label={status} live={live} /> : null}
      <View style={styles.scoreRow}>
        <Crest url={homeCrestUrl} monogram={homeMonogram} size={44} />
        <Text style={styles.scoreText}>{score ?? 'VS'}</Text>
        <Crest url={awayCrestUrl} monogram={awayMonogram} size={44} style={styles.crestAway} />
      </View>
    </View>
  );
}

/** Anillo de progreso (porcentaje). Trazo con el acento del club. */
export function ProgressRing({
  percent,
  size = 82,
  caption,
  center,
}: {
  readonly percent: number;
  readonly size?: number;
  readonly caption?: string;
  /** Texto grande en el centro (por defecto, el porcentaje). */
  readonly center?: string;
}): React.ReactElement {
  const theme = useAppTheme();
  const p = Math.max(0, Math.min(100, percent));
  const inner = size - 18;
  // Aro base + arco de progreso simulado con dos semicírculos (sin SVG, RN puro).
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={[
          styles.ringTrack,
          { width: size, height: size, borderRadius: size / 2 },
        ]}
      />
      <View
        style={[
          styles.ringFill,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: theme.palette.accent,
            transform: [{ rotate: `${(p / 100) * 360}deg` }],
          },
        ]}
      />
      <View
        style={[
          styles.ringHole,
          { width: inner, height: inner, borderRadius: inner / 2, top: 9, left: 9 },
        ]}
      >
        <Text style={styles.ringCenter}>{center ?? `${Math.round(p)}%`}</Text>
        {caption ? <Text style={styles.ringCaption}>{caption.toUpperCase()}</Text> : null}
      </View>
    </View>
  );
}

/** Pequeña estadística: número condensado + etiqueta (para bento/perfil). */
export function StatTile({
  value,
  label,
  style,
}: {
  readonly value: string;
  readonly label: string;
  readonly style?: StyleProp<ViewStyle>;
}): React.ReactElement {
  return (
    <View style={[styles.statTile, style]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label.toUpperCase()}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Estilos (derivados de los tokens puros)
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  screen: { flex: 1 },
  screenLight: { backgroundColor: palette.canvas },
  screenDark: { backgroundColor: palette.ink },
  screenPadded: { padding: spacing.lg },

  hero: {
    backgroundColor: palette.inkSoft,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.lg,
    borderBottomWidth: 3,
  },
  heroEyebrow: {
    color: palette.textMutedOnDark,
    fontFamily: fonts.body,
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
    letterSpacing: 1.5,
    marginBottom: spacing.xs,
  },
  heroTitle: {
    color: palette.textOnDark,
    fontFamily: fonts.display,
    fontSize: fontSize.hero,
    fontWeight: fontWeight.bold,
    letterSpacing: 1,
  },

  card: {
    // Tarjeta glass sobre el canvas oscuro: relleno translúcido + borde sutil.
    backgroundColor: palette.glassFill,
    borderRadius: radius.glass,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: palette.glassBorder,
    ...shadow.card,
  },
  cardTitle: {
    color: palette.textOnDark,
    fontFamily: fonts.body,
    fontSize: fontSize.subtitle,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.sm,
  },

  sectionTitle: {
    color: palette.textOnDark,
    fontFamily: fonts.display,
    fontSize: fontSize.title,
    fontWeight: fontWeight.bold,
    letterSpacing: 1,
    marginBottom: spacing.md,
  },

  btn: {
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnOutline: { backgroundColor: 'transparent', borderWidth: 1.5 },
  btnGlow: { ...shadow.glow },
  btnPressed: { opacity: 0.85 },
  btnDisabled: { opacity: 0.45 },
  btnText: { fontFamily: fonts.body, fontSize: fontSize.body, fontWeight: fontWeight.bold, letterSpacing: 0.3 },
  btnTextOnDanger: { color: '#FFFFFF' },

  crest: {
    // Marco fino y estilizado (preferencia del usuario): borde delgado dorado
    // con aire interior (el padding lo aporta el `box`) que separa el logo.
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: palette.ink,
    ...shadow.crest,
  },
  crestMono: { backgroundColor: palette.inkSoft },
  // width/height 100% (no absoluteFill) para respetar el padding del marco y que
  // el logo quede separado del borde (aspecto estilizado).
  crestImg: { width: '100%', height: '100%', resizeMode: 'contain' },
  crestText: {
    color: palette.textOnDark,
    fontFamily: fonts.display,
    fontWeight: fontWeight.bold,
    letterSpacing: 1,
  },

  chip: {
    borderWidth: 1.5,
    borderColor: palette.glassBorder,
    backgroundColor: palette.glassFill,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  chipText: {
    color: palette.textOnDark,
    fontFamily: fonts.body,
    fontSize: fontSize.small,
    fontWeight: fontWeight.semibold,
  },

  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.sm,
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
  },
  badgeText: {
    fontFamily: fonts.body,
    fontSize: fontSize.caption,
    fontWeight: fontWeight.extrabold,
    letterSpacing: 0.5,
  },

  laminaIcon: {
    borderRadius: radius.sm,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: palette.textMutedOnDark,
    backgroundColor: '#FFFFFF08',
    alignItems: 'center',
    justifyContent: 'center',
    // Sin overflow:hidden para que el badge del vértice pueda sobresalir.
  },
  // Número mostrado DENTRO de la lámina (p. ej. el "2" del conteo).
  laminaNumero: {
    color: palette.textOnDark,
    fontFamily: fonts.display,
    fontWeight: fontWeight.bold,
  },
  // Badge circular del glifo, superpuesto en el vértice inferior derecho (como
  // el "+" del avatar): mitad dentro / mitad fuera de la lámina.
  laminaCornerBadge: {
    position: 'absolute',
    right: -6,
    bottom: -6,
    backgroundColor: palette.ink,
    borderWidth: 1.5,
    borderColor: palette.inkSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slot: {
    flex: 1,
    aspectRatio: 3 / 4,
    borderRadius: radius.sticker,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotMounted: {
    borderWidth: 3,
    borderColor: '#FFFFFF',
    backgroundColor: palette.inkSoft,
    ...shadow.crest,
  },
  slotEmpty: {
    borderWidth: 2,
    borderStyle: 'dashed',
    // Silueta vacía sobre canvas oscuro: borde translúcido claro.
    borderColor: '#FFFFFF3A',
    backgroundColor: '#FFFFFF08',
  },
  slotImg: { ...StyleSheet.absoluteFillObject, resizeMode: 'cover' },
  slotNum: {
    position: 'absolute',
    top: 0,
    left: 0,
    borderBottomRightRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
  },
  slotNumText: {
    color: palette.onAccent,
    fontFamily: fonts.display,
    fontSize: fontSize.small,
    fontWeight: fontWeight.bold,
  },
  slotLabelWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000000B3',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  slotLabel: {
    color: '#FFFFFF',
    fontFamily: fonts.body,
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
  },
  // Sobre canvas oscuro, gris claro translúcido (decorativo, no texto crítico).
  slotEmptyNum: {
    color: '#FFFFFF88',
    fontFamily: fonts.display,
    fontSize: fontSize.title,
    fontWeight: fontWeight.bold,
  },
  slotEmptyLabel: {
    color: '#FFFFFF77',
    fontFamily: fonts.body,
    fontSize: fontSize.caption,
    marginTop: spacing.xs,
  },

  // --- Glass / bento ---
  glass: {
    backgroundColor: palette.glassFill,
    borderWidth: 1,
    borderColor: palette.glassBorder,
    borderRadius: radius.glass,
    padding: spacing.md,
  },
  glassSoft: { backgroundColor: palette.glassFillSoft },
  bento: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  bentoCell: {
    flexGrow: 1,
    flexBasis: '46%',
    backgroundColor: palette.glassFill,
    borderWidth: 1,
    borderColor: palette.glassBorder,
    borderRadius: radius.glass,
    padding: spacing.md,
    overflow: 'hidden',
  },
  bentoWide: { flexBasis: '100%' },

  // --- Marcador tipo transmisión ---
  scoreboard: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  scoreText: {
    color: palette.textOnDark,
    fontFamily: fonts.display,
    fontSize: 52,
    fontWeight: fontWeight.bold,
    letterSpacing: 3,
    minWidth: 96,
    textAlign: 'center',
  },
  crestAway: {}, // gancho para overrides por partido

  // --- Píldora LIVE / FINAL ---
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'center',
    backgroundColor: palette.successBg,
    borderColor: '#38E08A55',
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: 3,
    paddingHorizontal: spacing.md,
  },
  livePillFinal: { backgroundColor: '#FFFFFF12', borderColor: palette.glassBorder },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: palette.live },
  liveDotFinal: { backgroundColor: palette.textMutedOnDark },
  livePillText: {
    color: palette.live,
    fontFamily: fonts.body,
    fontSize: fontSize.caption,
    fontWeight: fontWeight.extrabold,
    letterSpacing: 1,
  },
  livePillTextFinal: { color: palette.textMutedOnDark },

  // --- Anillo de progreso ---
  ringTrack: {
    position: 'absolute',
    borderWidth: 9,
    borderColor: '#FFFFFF1A',
  },
  ringFill: {
    position: 'absolute',
    borderWidth: 9,
    borderColor: palette.accent,
    borderRightColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  ringHole: {
    position: 'absolute',
    backgroundColor: palette.inkSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCenter: {
    color: palette.textOnDark,
    fontFamily: fonts.display,
    fontSize: fontSize.title,
    fontWeight: fontWeight.bold,
  },
  ringCaption: {
    color: palette.textMutedOnDark,
    fontFamily: fonts.body,
    fontSize: 8,
    fontWeight: fontWeight.semibold,
    letterSpacing: 1,
  },

  // --- Stat tile ---
  statTile: {
    flexGrow: 1,
    flexBasis: '22%',
    backgroundColor: palette.glassFill,
    borderWidth: 1,
    borderColor: palette.glassBorder,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  statValue: {
    color: palette.textOnDark,
    fontFamily: fonts.display,
    fontSize: fontSize.display,
    fontWeight: fontWeight.bold,
  },
  statLabel: {
    color: palette.textMutedOnDark,
    fontFamily: fonts.body,
    fontSize: 9,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.5,
  },

  tabBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#070A10',
    borderTopWidth: 1,
    borderTopColor: palette.borderOnDark,
    paddingVertical: spacing.md,
  },
  tabItem: { flex: 1, alignItems: 'center' },
  tabText: {
    color: palette.textMutedOnDark,
    fontFamily: fonts.body,
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
  },
});

// ---------------------------------------------------------------------------
// ErrorBoundary
// ---------------------------------------------------------------------------

export interface ErrorBoundaryProps {
  /** Texto del fallback (por defecto, un mensaje neutro). */
  readonly mensaje?: string;
  readonly children?: React.ReactNode;
}

interface ErrorBoundaryState {
  readonly error: Error | null;
}

/**
 * Límite de error de render. Evita que un fallo en un subárbol (p. ej. un
 * componente nativo que lanza en cierto dispositivo) deje la PANTALLA NEGRA:
 * captura el error y muestra un fallback legible sobre fondo oscuro. En dev,
 * el mensaje incluye el detalle real para diagnóstico.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error): void {
    // Registro visible en logcat/Metro para diagnóstico (no rompe la app).
    console.error('[ErrorBoundary] render falló:', error);
  }

  render(): React.ReactNode {
    const { error } = this.state;
    if (error !== null) {
      // Muestra el detalle del error también en release temporalmente para
      // diagnosticar el crash de "Mi temporada" en dispositivo real.
      const detalle = error.message ? `\n\n${error.message}` : '';
      return (
        <View style={ebStyles.wrap}>
          <Text style={ebStyles.icono}>⚠️</Text>
          <Text style={ebStyles.texto}>
            {this.props.mensaje ?? 'No pudimos mostrar esta sección. Intenta de nuevo.'}
            {detalle}
          </Text>
        </View>
      );
    }
    return this.props.children ?? null;
  }
}

const ebStyles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
    backgroundColor: palette.ink,
  },
  icono: { fontSize: 40 },
  texto: {
    color: palette.textOnDark,
    fontFamily: fonts.body,
    fontSize: fontSize.body,
    textAlign: 'center',
    lineHeight: 22,
  },
});

export default {
  Screen,
  Hero,
  ErrorBoundary,
  SectionCard,
  SectionTitle,
  PrimaryButton,
  SecondaryButton,
  DangerButton,
  Crest,
  Chip,
  Badge,
  LaminaIcon,
  StickerSlot,
  TabBar,
  GlassCard,
  Bento,
  BentoCell,
  LivePill,
  Scoreboard,
  ProgressRing,
  StatTile,
  useAppTheme,
};
