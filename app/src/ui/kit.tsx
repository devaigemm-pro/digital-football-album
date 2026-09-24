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
  return (
    <View
      style={[
        styles.screen,
        tone === 'dark' ? styles.screenDark : styles.screenLight,
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
  /** Contenido extra bajo el título (marcador, escudos, etc.). */
  readonly children?: React.ReactNode;
  readonly style?: StyleProp<ViewStyle>;
}

/** Cabecera inmersiva estilo "cartel" con degradado hacia la tinta. */
export function Hero({ eyebrow, title, children, style }: HeroProps): React.ReactElement {
  const theme = useAppTheme();
  return (
    <View style={[styles.hero, { borderBottomColor: theme.palette.accent }, style]}>
      {eyebrow ? <Text style={styles.heroEyebrow}>{eyebrow.toUpperCase()}</Text> : null}
      <Text style={styles.heroTitle}>{title}</Text>
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
        { backgroundColor: theme.palette.accent },
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
  const theme = useAppTheme();
  const box: ViewStyle = {
    width: size,
    height: size * 1.18,
    borderRadius: radius.sm,
    borderBottomLeftRadius: size / 2,
    borderBottomRightRadius: size / 2,
    borderColor: theme.palette.accent,
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

export interface StickerSlotProps {
  /** Número del Recuadro (== número del Sticker; tolerante a huecos). */
  readonly numero: number | string;
  /** URI de la miniatura si el Recuadro está MONTADO; ausente => VACÍO. */
  readonly imageUri?: string | null;
  /** Etiqueta breve bajo el número (opcional). */
  readonly label?: string;
  /** Resalta el recuadro (p. ej. momento clave/holograma). */
  readonly highlight?: boolean;
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
  onPress,
  style,
}: StickerSlotProps): React.ReactElement {
  const theme = useAppTheme();
  const montado = Boolean(imageUri);
  const content = montado ? (
    <>
      <Image source={{ uri: imageUri as string }} style={styles.slotImg} accessibilityRole="image" />
      <View style={[styles.slotNum, { backgroundColor: theme.palette.accent }]}>
        <Text style={styles.slotNumText}>{numero}</Text>
      </View>
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
// Estilos (derivados de los tokens puros)
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  screen: { flex: 1 },
  screenLight: { backgroundColor: palette.canvas },
  screenDark: { backgroundColor: palette.ink },
  screenPadded: { padding: spacing.lg },

  hero: {
    backgroundColor: palette.ink,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    borderBottomWidth: 4,
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
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: palette.borderOnLight,
    ...shadow.card,
  },
  cardTitle: {
    color: palette.textOnLight,
    fontFamily: fonts.body,
    fontSize: fontSize.subtitle,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.sm,
  },

  sectionTitle: {
    color: palette.textOnLight,
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
  btnPressed: { opacity: 0.85 },
  btnDisabled: { opacity: 0.45 },
  btnText: { fontFamily: fonts.body, fontSize: fontSize.body, fontWeight: fontWeight.bold, letterSpacing: 0.3 },
  btnTextOnDanger: { color: '#FFFFFF' },

  crest: {
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: palette.ink,
    ...shadow.crest,
  },
  crestMono: { backgroundColor: palette.inkSoft },
  crestImg: { width: '100%', height: '100%', resizeMode: 'contain' },
  crestText: {
    color: palette.textOnDark,
    fontFamily: fonts.display,
    fontWeight: fontWeight.bold,
    letterSpacing: 1,
  },

  chip: {
    borderWidth: 1.5,
    borderColor: palette.textOnLight,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  chipText: {
    color: palette.textOnLight,
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
    // #8A8168 sobre papel claro ≈ 3.9:1 para borde/decorativo; el texto usa un
    // gris más oscuro (abajo) para cumplir AA en contenido.
    borderColor: '#8A8168',
    backgroundColor: 'transparent',
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
  // #5F5A45 sobre papel claro alcanza ≈ 6.4:1 (AA) para el contenido del vacío.
  slotEmptyNum: {
    color: '#5F5A45',
    fontFamily: fonts.display,
    fontSize: fontSize.title,
    fontWeight: fontWeight.bold,
  },
  slotEmptyLabel: {
    color: '#5F5A45',
    fontFamily: fonts.body,
    fontSize: fontSize.caption,
    marginTop: spacing.xs,
  },

  tabBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: palette.ink,
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

export default {
  Screen,
  Hero,
  SectionCard,
  SectionTitle,
  PrimaryButton,
  SecondaryButton,
  DangerButton,
  Crest,
  Chip,
  Badge,
  StickerSlot,
  TabBar,
  useAppTheme,
};
