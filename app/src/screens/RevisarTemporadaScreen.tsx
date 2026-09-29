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
import { fonts, fontSize, fontWeight, palette, radius, spacing } from '../theme/design-tokens';

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

/**
 * Tarjeta-cromo animada. Recibe el `scrollX` compartido y su índice; deriva en
 * el hilo UI la transformación cover-flow (rotateY/escala/opacidad) y el
 * parallax de la foto, más el brillo del borde (foil) en bucle.
 */
function LaminaCard({
  item,
  index,
  scrollX,
  colorClub,
  colorClub2,
  escudoUrl,
  clubNombre,
  onPress,
}: {
  readonly item: LaminaVista;
  readonly index: number;
  readonly scrollX: Animated.SharedValue<number>;
  readonly colorClub: string;
  readonly colorClub2: string;
  readonly escudoUrl?: string | null;
  readonly clubNombre: string;
  readonly onPress: () => void;
}): React.ReactElement {
  const realce = etiquetaRealce(item.partido);
  const marcador = marcadorTexto(item.partido);
  const especial = tieneRealceEspecial(item.partido);
  const codigo = (item.partido.rival ?? '').slice(0, 3).toUpperCase();

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

  // Borde animado (foil): un brillo recorre el marco en bucle.
  const shine = useSharedValue(0);
  useEffect(() => {
    shine.value = withRepeat(
      withTiming(1, { duration: especial ? 2400 : 3600, easing: Easing.inOut(Easing.sin) }),
      -1,
      false,
    );
  }, [shine, especial]);
  const bordeStyle = useAnimatedStyle(() => {
    // El brillo del borde alterna su opacidad para "recorrer" el marco.
    const opacity = interpolate(shine.value, [0, 0.5, 1], [0.25, 0.9, 0.25]);
    return { opacity };
  });
  const shimmerStyle = useAnimatedStyle(() => {
    const translateX = interpolate(shine.value, [0, 1], [-CARD_W, CARD_W]);
    return { transform: [{ translateX }, { rotate: '18deg' }] };
  });

  return (
    <Animated.View style={[styles.cardWrap, cardStyle]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Lámina ${item.partido.numeroRecuadro} contra ${item.partido.rival}`}
        onPress={onPress}
        style={styles.cardPress}
      >
        {/* Marco base con el color del club + brillo animado superpuesto. */}
        <View style={[styles.card, { borderColor: colorClub }]}>
          <Animated.View
            pointerEvents="none"
            style={[styles.bordeShine, { borderColor: '#FFFFFF' }, bordeStyle]}
          />

          {/* Foto sobre fondo gráfico con el color del club. */}
          <View style={[styles.foto, { backgroundColor: colorClub2 }]}>
            <Text style={[styles.fondoNumero, { color: colorClub }]} numberOfLines={1}>
              {item.partido.numeroRecuadro ?? ''}
            </Text>
            {item.miniaturaUri ? (
              <Animated.Image
                source={{ uri: item.miniaturaUri }}
                style={[styles.fotoImg, fotoStyle]}
                accessibilityRole="image"
              />
            ) : (
              <View style={styles.fotoVacia} />
            )}

            {/* Foil holográfico (banda de brillo diagonal). */}
            <Animated.View pointerEvents="none" style={[styles.shimmer, shimmerStyle, { opacity: especial ? 0.5 : 0.3 }]} />

            <View style={styles.escudoEsquina}>
              <Crest
                url={escudoUrl}
                monogram={clubNombre.slice(0, 3).toUpperCase()}
                size={30}
              />
            </View>
            <Text style={styles.codigoLateral}>{codigo}</Text>
            {realce ? (
              <Badge label={realce} tone={item.partido.esClasico ? 'gold' : 'accent'} style={styles.realceBadge} />
            ) : null}

            {/* Recuadro de datos TRANSLÚCIDO, sobre la foto (no la tapa del todo). */}
            <View style={styles.datosOverlay}>
              <Text style={styles.rival} numberOfLines={1}>
                {item.partido.rival.toUpperCase()}
              </Text>
              <View style={styles.datosRow}>
                <Text style={styles.datos} numberOfLines={1}>
                  {item.partido.competicion}
                </Text>
                <Text style={styles.marcador}>{marcador ?? '—'}</Text>
              </View>
            </View>
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
                escudoUrl={club?.escudoUrl}
                clubNombre={club?.nombre ?? 'CLB'}
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
  card: {
    borderRadius: radius.card,
    borderWidth: 6,
    backgroundColor: palette.inkSoft,
    overflow: 'hidden',
    position: 'relative',
  },
  // Borde interior brillante que se anima (foil recorriendo el marco).
  bordeShine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 2,
    borderRadius: radius.card,
    zIndex: 5,
  },
  foto: {
    width: '100%',
    aspectRatio: 3 / 4,
    position: 'relative',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fondoNumero: {
    position: 'absolute',
    right: -8,
    top: -20,
    fontFamily: fonts.display,
    fontSize: 180,
    fontWeight: fontWeight.bold,
    opacity: 0.28,
  },
  fotoImg: { width: '112%', height: '100%', resizeMode: 'cover' },
  fotoVacia: { width: '100%', height: '100%', backgroundColor: palette.inkSoft },
  shimmer: {
    position: 'absolute',
    top: -CARD_W,
    bottom: -CARD_W,
    width: CARD_W * 0.5,
    backgroundColor: '#FFFFFF',
  },
  escudoEsquina: { position: 'absolute', top: spacing.sm, right: spacing.sm },
  codigoLateral: {
    position: 'absolute',
    right: 2,
    top: '42%',
    color: '#FFFFFF',
    fontFamily: fonts.display,
    fontSize: fontSize.title,
    fontWeight: fontWeight.bold,
    opacity: 0.9,
    letterSpacing: 2,
  },
  realceBadge: { position: 'absolute', top: spacing.sm, left: spacing.sm },
  // Franja de datos TRANSLÚCIDA sobre la foto (deja ver la imagen detrás).
  datosOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: '#00000066',
  },
  rival: {
    color: '#FFFFFF',
    fontFamily: fonts.display,
    fontSize: fontSize.title,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.5,
  },
  datosRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: 2,
  },
  datos: {
    flex: 1,
    color: '#FFFFFFCC',
    fontFamily: fonts.body,
    fontSize: fontSize.small,
  },
  marcador: {
    color: '#FFFFFF',
    fontFamily: fonts.display,
    fontSize: fontSize.subtitle,
    fontWeight: fontWeight.bold,
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
