// RevisarTemporadaScreen — presentación premium de "Mi temporada" en carrusel de
// láminas (cromos) montadas, con animaciones fluidas (react-native-reanimated).
//
//   - AUTO-AVANCE: pasa de lámina cada pocos segundos, con loop; botón
//     pausar/reanudar y pausa automática al arrastrar.
//   - TRANSICIONES cover-flow: cada lámina rota en Y (perspectiva), escala y se
//     atenúa según su distancia al centro, con parallax de la foto interna.
//     Todo corre en el HILO UI con Reanimated (useAnimatedScrollHandler +
//     useAnimatedStyle + interpolate) → 60/120 fps.
//   - BORDES DE LÁMINA ANIMADOS: un brillo (foil) recorre el marco en bucle
//     (withRepeat), como el reflejo de una lámina real.
//   - RECUADRO DE DATOS TRANSLÚCIDO: la franja con rival/marcador va sobre la
//     foto con fondo semitransparente, para que se vea la foto completa detrás.
//
// DATOS REALES: láminas montadas (`laminasMontadasEnSecuencia`) + miniatura del
// preview del álbum + color/escudo del club (perfil). No se inventa nada.
//
// `.tsx` EXCLUIDO del typecheck (`app/tsconfig.json`): usa React Native y
// Reanimated. La lógica de selección/orden vive en `laminas.ts` (TS puro).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
  runOnJS,
  useAnimatedRef,
} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';

import {
  AlbumPreviewPresenter,
  laminasMontadasEnSecuencia,
  marcadorTexto,
  etiquetaRealce,
  tieneRealceEspecial,
  type AlbumPreviewClient,
  type AlbumPreviewState,
} from '../album';
import { ProfilePresenter, type PartidosState, type ProfileState } from '../profile';
import type { PartidoLamina, ProfileClient } from '../adapters';
import { Badge, Crest, Hero, Screen } from '../ui/kit';
import { fonts, fontSize, fontWeight, palette, radius, shadow, spacing } from '../theme/design-tokens';

export interface RevisarTemporadaScreenProps {
  readonly temporadaId: string;
  readonly albumClient: AlbumPreviewClient;
  readonly profilePresenter?: ProfilePresenter;
  readonly profileClient?: ProfileClient;
  readonly onAbrirPartido?: (partidoId: string) => void;
}

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_W = Math.min(320, SCREEN_W * 0.78);
const CARD_SPACING = spacing.md;
const SNAP = CARD_W + CARD_SPACING;
const SIDE_PAD = (SCREEN_W - CARD_W) / 2;
const AUTO_MS = 3500;

interface LaminaVista {
  readonly partido: PartidoLamina;
  readonly miniaturaUri: string | null;
}

/** LinearGradient animable con Reanimated (para el foil y el barrido del borde). */
const AnimatedGradient = Animated.createAnimatedComponent(LinearGradient);

/**
 * Emblema del torneo por tipo de competición. El backend no expone un logo de
 * competición, así que usamos un emblema representativo (mismo criterio que la
 * lista de Partidos): Liga 🏆, Copa nacional 🏅, Internacional 🌎.
 */
function emblemaTorneo(tipo: PartidoLamina['tipoCompeticion']): string {
  switch (tipo) {
    case 'LIGA':
      return '⚽'; // liga (no copa)
    case 'COPA_NACIONAL':
      return '🏆'; // copa nacional
    case 'INTERNACIONAL':
      return '🌎'; // internacional
    default:
      return '⚽';
  }
}

/** Colores del reflejo holográfico (arcoíris foil, translúcido). */
const HOLO_COLORS = [
  '#FF2D9B55',
  '#FFD23F55',
  '#3AF7C955',
  '#4D8CFF55',
  '#B14DFF55',
  '#FF2D9B55',
];

/**
 * Tarjeta-cromo animada. Deriva en el hilo UI la transformación cover-flow
 * (rotateY/escala/opacidad) y el parallax de la foto. El foil es un gradiente
 * arcoíris que se DESPLAZA en diagonal, y el borde un barrido de luz que
 * RECORRE el marco (ambos con react-native-linear-gradient + Reanimated).
 */
function LaminaCard({
  item,
  index,
  scrollX,
  colorClub,
  colorClub2,
  colorClub3,
  escudoUrl,
  aliasUsuario,
  onPress,
}: {
  readonly item: LaminaVista;
  readonly index: number;
  readonly scrollX: Animated.SharedValue<number>;
  readonly colorClub: string;
  readonly colorClub2: string;
  readonly colorClub3: string;
  readonly escudoUrl?: string | null;
  readonly aliasUsuario: string;
  readonly onPress: () => void;
}): React.ReactElement {
  const realce = etiquetaRealce(item.partido);
  const marcador = marcadorTexto(item.partido);
  const especial = tieneRealceEspecial(item.partido);
  // Código de la esquina: el ALIAS del usuario (su "firma" en la lámina).
  const codigo = aliasUsuario.toUpperCase();

  const inputRange = [(index - 1) * SNAP, index * SNAP, (index + 1) * SNAP];

  // Cover-flow (hilo UI): perspectiva + rotación Y + escala + opacidad.
  const cardStyle = useAnimatedStyle(() => {
    const scale = interpolate(scrollX.value, inputRange, [0.82, 1, 0.82], Extrapolation.CLAMP);
    const rotateY = interpolate(scrollX.value, inputRange, [34, 0, -34], Extrapolation.CLAMP);
    const opacity = interpolate(scrollX.value, inputRange, [0.35, 1, 0.35], Extrapolation.CLAMP);
    return {
      opacity,
      transform: [{ perspective: 1000 }, { scale }, { rotateY: `${rotateY}deg` }],
    };
  });

  // Parallax de la foto interna (se mueve a distinta velocidad que la tarjeta).
  const fotoStyle = useAnimatedStyle(() => {
    const translateX = interpolate(
      scrollX.value,
      inputRange,
      [CARD_W * 0.16, 0, -CARD_W * 0.16],
      Extrapolation.CLAMP,
    );
    return { transform: [{ translateX }] };
  });

  // Ciclo de animación compartido para el foil y el borde (0→1 en bucle).
  const shine = useSharedValue(0);
  useEffect(() => {
    shine.value = withRepeat(
      withTiming(1, { duration: especial ? 2600 : 4200, easing: Easing.linear }),
      -1,
      false,
    );
  }, [shine, especial]);

  // Foil: el gradiente arcoíris se DESPLAZA en diagonal cruzando la foto.
  const foilStyle = useAnimatedStyle(() => {
    const translateX = interpolate(shine.value, [0, 1], [-CARD_W * 1.4, CARD_W * 1.4]);
    return { transform: [{ translateX }, { rotate: '20deg' }] };
  });

  return (
    <Animated.View style={[styles.cardWrap, cardStyle]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Lámina ${item.partido.numeroRecuadro} contra ${item.partido.rival}`}
        onPress={onPress}
        style={styles.cardPress}
      >
        {/* Lámina estilo Panini: marco crema con esquinas diagonales del color del
            club, ventana de foto al centro y pie con escudo + código del rival. */}
        <View style={styles.card}>
          {/* Esquina diagonal superior izquierda (bloque de color del club). */}
          <LinearGradient
            colors={[colorClub, colorClub2]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.esquinaTL}
          />
          {/* Franjas de acento (banda tricolor) en el lado izquierdo. */}
          <View style={[styles.franjaAcento, styles.franjaAcentoIzq, { backgroundColor: colorClub3 }]} />
          {/* Esquina diagonal inferior derecha. */}
          <LinearGradient
            colors={[colorClub2, colorClub]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.esquinaBR}
          />
          <View style={[styles.franjaAcento, styles.franjaAcentoDer, { backgroundColor: colorClub3 }]} />

          {/* Emblema superior: número de la lámina sobre una estrella dorada
              (estrella de fondo, número en negro al frente). */}
          <View style={styles.emblemaEstrella}>
            <Text style={styles.estrella}>★</Text>
            <Text style={styles.estrellaNum}>{item.partido.numeroRecuadro ?? '—'}</Text>
          </View>

          {/* Ventana de la foto con filete claro (marco interior blancuzco). */}
          <View style={styles.ventana}>
            <View style={styles.foto}>
              {item.miniaturaUri ? (
                <Animated.Image
                  source={{ uri: item.miniaturaUri }}
                  style={[styles.fotoImg, fotoStyle]}
                  accessibilityRole="image"
                />
              ) : (
                <View style={[styles.fotoVacia, { backgroundColor: colorClub2 }]} />
              )}
              {/* Foil holográfico sobre la foto (más intenso en Clásico/Internac.). */}
              <AnimatedGradient
                pointerEvents="none"
                colors={HOLO_COLORS}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.foil, foilStyle, { opacity: especial ? 0.8 : 0.45 }]}
              />
              {/* Emblema del torneo, sobre la foto en la esquina superior izquierda. */}
              <View style={styles.torneoOverlay}>
                <Text style={styles.torneoIcon}>{emblemaTorneo(item.partido.tipoCompeticion)}</Text>
              </View>
              {/* Escudo del rival (solo el escudo), esquina inferior derecha. */}
              {escudoUrl ? (
                <Image source={{ uri: escudoUrl }} style={styles.escudoOverlay} accessibilityRole="image" />
              ) : (
                <View style={styles.escudoOverlayMono}>
                  <Text style={styles.escudoMonoText}>{codigo}</Text>
                </View>
              )}
              {realce ? (
                <Badge label={realce} tone={item.partido.esClasico ? 'gold' : 'accent'} style={styles.realceBadge} />
              ) : null}
            </View>
          </View>

          {/* Pie: nombre + datos a la izquierda; código del rival a la derecha. */}
          <View style={styles.pie}>
            <View style={styles.pieInfo}>
              <Text style={[styles.pieNombre, { color: colorClub }]} numberOfLines={1}>
                {item.partido.rival.toUpperCase()}
              </Text>
              <Text style={[styles.pieDatos, { color: colorClub }]} numberOfLines={1}>
                {item.partido.competicion}
                {marcador ? ` · ${marcador}` : ''}
              </Text>
            </View>
            <Text style={[styles.pieCodigo, { color: colorClub }]} numberOfLines={1}>
              {codigo}
            </Text>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

/** Presentación en carrusel de las láminas montadas de "Mi temporada". */
export function RevisarTemporadaScreen({
  temporadaId,
  albumClient,
  profilePresenter,
  profileClient,
  onAbrirPartido,
}: RevisarTemporadaScreenProps): React.ReactElement {
  const albumPres = useMemo(() => new AlbumPreviewPresenter(albumClient), [albumClient]);
  const perfilPres = useMemo(
    () => profilePresenter ?? (profileClient ? new ProfilePresenter(profileClient) : null),
    [profilePresenter, profileClient],
  );

  const [album, setAlbum] = useState<AlbumPreviewState>(() => albumPres.getState());
  const [partidos, setPartidos] = useState<PartidosState | null>(
    () => perfilPres?.getPartidosState() ?? null,
  );
  const [profile, setProfile] = useState<ProfileState | null>(
    () => perfilPres?.getProfileState() ?? null,
  );
  const [indiceActual, setIndiceActual] = useState(0);
  const [reproduciendo, setReproduciendo] = useState(true);

  const scrollX = useSharedValue(0);
  const listRef = useAnimatedRef<Animated.ScrollView>();

  useEffect(() => {
    const off = albumPres.subscribe(setAlbum);
    void albumPres.load(temporadaId);
    return off;
  }, [albumPres, temporadaId]);

  useEffect(() => {
    if (!perfilPres) {
      return;
    }
    const offP = perfilPres.subscribePartidos(setPartidos);
    const offPr = perfilPres.subscribeProfile(setProfile);
    if (perfilPres.getPartidosState().status === 'idle') {
      void perfilPres.loadPartidos(temporadaId);
    }
    if (perfilPres.getProfileState().status === 'idle') {
      void perfilPres.loadProfile();
    }
    return () => {
      offP();
      offPr();
    };
  }, [perfilPres, temporadaId]);

  const club = profile?.perfil?.club ?? null;
  const colorClub = club?.paletaColores?.primario ?? palette.goldStrong;
  const colorClub2 = club?.paletaColores?.secundario ?? palette.ink;
  const colorClub3 = club?.paletaColores?.acento ?? colorClub;
  // Alias del usuario para la "firma" de la lámina (alias → nombre → correo → TÚ).
  const usuario = profile?.perfil?.usuario ?? null;
  const aliasUsuario =
    usuario?.alias?.trim() ||
    usuario?.nombre?.trim() ||
    usuario?.email?.split('@')[0] ||
    'Tú';

  const miniaturaPorNumero = useMemo(() => {
    const map = new Map<number, string>();
    for (const r of album.recuadros) {
      if (r.estado === 'MONTADA') {
        map.set(r.numero, r.miniaturaKey);
      }
    }
    return map;
  }, [album.recuadros]);

  const laminas: readonly LaminaVista[] = useMemo(() => {
    const montadas = laminasMontadasEnSecuencia(partidos?.partidos ?? []);
    return montadas.map((partido) => ({
      partido,
      miniaturaUri:
        partido.numeroRecuadro != null
          ? miniaturaPorNumero.get(partido.numeroRecuadro) ?? null
          : null,
    }));
  }, [partidos, miniaturaPorNumero]);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollX.value = e.contentOffset.x;
      const i = Math.round(e.contentOffset.x / SNAP);
      runOnJS(setIndiceActual)(i);
    },
    onBeginDrag: () => {
      runOnJS(setReproduciendo)(false);
    },
  });

  // Auto-avance: mueve el scroll a la siguiente lámina en el hilo UI.
  useEffect(() => {
    if (!reproduciendo || laminas.length <= 1) {
      return;
    }
    const id = setInterval(() => {
      const siguiente = (Math.round(scrollX.value / SNAP) + 1) % laminas.length;
      listRef.current?.scrollTo({ x: siguiente * SNAP, animated: true });
    }, AUTO_MS);
    return () => clearInterval(id);
  }, [reproduciendo, laminas.length, listRef, scrollX]);

  const cargando =
    album.status === 'loading' ||
    album.status === 'idle' ||
    (partidos?.status ?? 'idle') === 'loading';

  const onTogglePlay = useCallback(() => {
    setReproduciendo((v) => !v);
  }, []);

  return (
    <Screen tone="dark" flush>
      <Hero eyebrow="Recuerdos de la temporada" title="Mi temporada">
        {laminas.length > 0 ? (
          <Text style={styles.contador}>
            Lámina {Math.min(indiceActual + 1, laminas.length)} de {laminas.length}
          </Text>
        ) : null}
      </Hero>

      {cargando ? (
        <View style={styles.centro}>
          <ActivityIndicator color={palette.textOnDark} accessibilityLabel="Cargando tu temporada" />
        </View>
      ) : laminas.length === 0 ? (
        <View style={styles.centro}>
          <Crest monogram="★" size={64} />
          <Text style={styles.vacio}>
            Aún no has montado ninguna lámina. Sube la foto principal de tus
            partidos y vuelve para revivir tu temporada.
          </Text>
        </View>
      ) : (
        <View style={styles.carruselWrap}>
          <Animated.ScrollView
            ref={listRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={SNAP}
            decelerationRate="fast"
            contentContainerStyle={styles.lista}
            onScroll={scrollHandler}
            scrollEventThrottle={16}
          >
            {laminas.map((item, index) => (
              <LaminaCard
                key={item.partido.partidoId}
                item={item}
                index={index}
                scrollX={scrollX}
                colorClub={colorClub}
                colorClub2={colorClub2}
                colorClub3={colorClub3}
                escudoUrl={club?.escudoUrl}
                aliasUsuario={aliasUsuario}
                onPress={() => onAbrirPartido?.(item.partido.partidoId)}
              />
            ))}
          </Animated.ScrollView>

          {laminas.length > 1 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={reproduciendo ? 'Pausar la presentación' : 'Reanudar la presentación'}
              onPress={onTogglePlay}
              style={styles.playBtn}
            >
              <Text style={styles.playIcon}>{reproduciendo ? '❚❚' : '▶'}</Text>
              <Text style={styles.playText}>{reproduciendo ? 'Pausar' : 'Reproducir'}</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  contador: {
    color: palette.textMutedOnDark,
    fontFamily: fonts.body,
    fontSize: fontSize.small,
    marginTop: spacing.sm,
  },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  vacio: {
    color: palette.textMutedOnDark,
    fontFamily: fonts.body,
    fontSize: fontSize.body,
    textAlign: 'center',
    lineHeight: 22,
  },
  carruselWrap: { flex: 1, justifyContent: 'center' },
  lista: { alignItems: 'center', paddingHorizontal: SIDE_PAD, paddingVertical: spacing.xl },
  cardWrap: { width: CARD_W, marginRight: CARD_SPACING },
  cardPress: { width: '100%' },
  // Lámina estilo Panini: fondo crema, marco con esquinas de color del club.
  card: {
    borderRadius: radius.card,
    backgroundColor: '#EFEBE0',
    padding: spacing.md,
    overflow: 'hidden',
    position: 'relative',
    ...shadow.crest,
  },
  // Esquina diagonal superior izquierda (bloque de color del club, rotado 45°).
  esquinaTL: {
    position: 'absolute',
    top: -CARD_W * 0.5,
    left: -CARD_W * 0.5,
    width: CARD_W,
    height: CARD_W,
    transform: [{ rotate: '45deg' }],
  },
  // Esquina diagonal inferior derecha.
  esquinaBR: {
    position: 'absolute',
    bottom: -CARD_W * 0.5,
    right: -CARD_W * 0.5,
    width: CARD_W,
    height: CARD_W,
    transform: [{ rotate: '45deg' }],
  },
  // Franja de acento (tricolor del equipo) que cruza en diagonal.
  franjaAcento: {
    position: 'absolute',
    width: CARD_W * 1.4,
    height: 10,
    transform: [{ rotate: '45deg' }],
    opacity: 0.9,
  },
  franjaAcentoIzq: { top: CARD_W * 0.42, left: -CARD_W * 0.5 },
  franjaAcentoDer: { bottom: CARD_W * 0.42, right: -CARD_W * 0.5 },
  // Emblema: número de la lámina centrado sobre una estrella dorada (arriba-der.).
  emblemaEstrella: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  estrella: {
    position: 'absolute',
    color: palette.goldStrong,
    fontSize: 44,
    lineHeight: 46,
    textAlign: 'center',
    // Sombra sutil para separar la estrella del fondo crema.
    textShadowColor: '#00000055',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  // Número centrado en la estrella (la estrella tiene su punta arriba, así que
  // el centro óptico está ligeramente bajo el centro geométrico).
  estrellaNum: {
    marginTop: 4,
    color: '#000000',
    fontFamily: fonts.display,
    fontSize: fontSize.subtitle,
    fontWeight: fontWeight.extrabold,
  },
  // Emblema del torneo sobre la foto (esquina superior izquierda).
  torneoOverlay: {
    position: 'absolute',
    top: spacing.xs,
    left: spacing.xs,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#00000066',
    alignItems: 'center',
    justifyContent: 'center',
  },
  torneoIcon: { fontSize: 15 },
  // Escudo del rival sobre la foto (esquina inferior derecha, sin marco).
  escudoOverlay: {
    position: 'absolute',
    right: spacing.xs,
    bottom: spacing.xs,
    width: 34,
    height: 34,
    resizeMode: 'contain',
  },
  escudoOverlayMono: {
    position: 'absolute',
    right: spacing.xs,
    bottom: spacing.xs,
    width: 34,
    height: 34,
    borderRadius: 6,
    backgroundColor: '#000000A0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  escudoMonoText: {
    color: '#FFFFFF',
    fontFamily: fonts.display,
    fontSize: fontSize.small,
    fontWeight: fontWeight.bold,
  },
  // Ventana de la foto: filete claro alrededor (marco interior blancuzco).
  ventana: {
    marginTop: 34,
    padding: 3,
    backgroundColor: '#F7F4EC',
    borderRadius: radius.sm,
    ...shadow.crest,
  },
  foto: {
    width: '100%',
    aspectRatio: 3 / 4,
    position: 'relative',
    overflow: 'hidden',
    borderRadius: radius.sm - 2,
    backgroundColor: palette.inkSoft,
  },
  fotoImg: { width: '112%', height: '100%', resizeMode: 'cover' },
  fotoVacia: { width: '100%', height: '100%' },
  foil: {
    position: 'absolute',
    top: -CARD_W,
    bottom: -CARD_W,
    width: CARD_W * 0.9,
  },
  realceBadge: { position: 'absolute', top: spacing.sm, left: spacing.sm },
  // Pie: nombre + datos a la izquierda; escudo + código a la derecha.
  pie: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xs,
    gap: spacing.sm,
  },
  pieInfo: { flex: 1, minWidth: 0 },
  pieNombre: {
    fontFamily: fonts.display,
    fontSize: fontSize.subtitle,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.5,
  },
  // Datos bajo el nombre: en negrita y con el color del club para resaltar
  // sobre el fondo crema de la lámina.
  pieDatos: {
    fontFamily: fonts.body,
    fontSize: fontSize.small,
    fontWeight: fontWeight.bold,
    marginTop: 1,
  },
  pieCodigo: {
    maxWidth: CARD_W * 0.4,
    fontFamily: fonts.display,
    fontSize: fontSize.subtitle,
    fontWeight: fontWeight.bold,
    letterSpacing: 1,
  },
  playBtn: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.borderOnDark,
    backgroundColor: palette.glassFill,
  },
  playIcon: { color: palette.textOnDark, fontFamily: fonts.body, fontSize: fontSize.small },
  playText: {
    color: palette.textOnDark,
    fontFamily: fonts.body,
    fontSize: fontSize.small,
    fontWeight: fontWeight.semibold,
  },
});

export default RevisarTemporadaScreen;
