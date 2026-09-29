// RevisarTemporadaScreen — presentación premium de la temporada en formato
// carrusel de láminas (cromos) montadas, en secuencia.
//
// Es un "pase" elegante de los recuerdos ya coleccionados:
//   - AUTO-AVANCE: el carrusel avanza solo cada pocos segundos y hace loop al
//     llegar al final. Se puede PAUSAR/reanudar con un botón, y se pausa solo
//     mientras el usuario arrastra.
//   - Cada lámina con su Foto_Principal se muestra como un cromo; la central se
//     agranda y las laterales se atenúan/encogen (profundidad).
//   - MARCO HOLOGRÁFICO/FOIL: el marco lleva un brillo (shimmer) animado que lo
//     cruza en diagonal + tintes de color, más intenso en Clásicos/Internac.
//
// IMPLEMENTACIÓN: `Animated.FlatList` horizontal + interpolación del scroll para
// escala/opacidad, `scrollToOffset` temporizado para el auto-avance, y capas
// `Animated.View` para el foil. Todo con la API `Animated` NATIVA de React Native
// (SIN dependencias nuevas: nada de reanimated/skia/expo-linear-gradient, que
// exigirían rebuild nativo). El holograma es un efecto por CAPAS (no un shader
// gyroscópico): brillo diagonal en bucle + tintes, el patrón sin-librería.
//
// DATOS REALES: las láminas montadas salen de la lista de partidos
// (`laminasMontadasEnSecuencia`); la miniatura, del preview del álbum. No se
// inventa nada; si no hay láminas montadas, se guía al usuario.
//
// `.tsx` EXCLUIDO del typecheck (`app/tsconfig.json`): usa React Native.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
} from 'react-native';

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
  /** Cliente de previsualización del álbum (miniaturas por número de recuadro). */
  readonly albumClient: AlbumPreviewClient;
  /** Presentador de perfil/partidos compartido (láminas montadas + escudo club). */
  readonly profilePresenter?: ProfilePresenter;
  /** Cliente de perfil (para construir el presentador si no se inyecta). */
  readonly profileClient?: ProfileClient;
  /** Abre el detalle del partido de la lámina mostrada. */
  readonly onAbrirPartido?: (partidoId: string) => void;
}

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_W = Math.min(320, SCREEN_W * 0.78);
const CARD_H = CARD_W * (4 / 3) + 64; // foto 3:4 + pie
const CARD_SPACING = spacing.md;
const SNAP = CARD_W + CARD_SPACING;
const AUTO_MS = 3500; // intervalo del auto-avance

/** Lámina lista para el carrusel: partido + miniatura resuelta. */
interface LaminaVista {
  readonly partido: PartidoLamina;
  readonly miniaturaUri: string | null;
}

/**
 * Marco holográfico animado (foil) para el cromo. Superpone un brillo diagonal
 * que cruza la tarjeta en bucle y unos tintes de color. `intenso` sube la
 * opacidad para Clásicos/Internacionales. Efecto por capas en RN puro.
 */
function HoloOverlay({ intenso }: { readonly intenso: boolean }): React.ReactElement {
  const shimmer = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: intenso ? 2600 : 3800,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }),
    );
    anim.start();
    return () => anim.stop();
  }, [shimmer, intenso]);

  const translateX = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [-CARD_W, CARD_W],
  });
  const tintOpacity = intenso ? 0.28 : 0.16;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {/* Tintes de color (arcoíris tenue) para el reflejo foil. */}
      <View style={[styles.holoTint, { backgroundColor: '#7A5CFF', opacity: tintOpacity }]} />
      <View style={[styles.holoTintB, { backgroundColor: '#38E0C8', opacity: tintOpacity }]} />
      <View style={[styles.holoTintC, { backgroundColor: palette.goldStrong, opacity: tintOpacity }]} />
      {/* Banda de brillo diagonal que cruza en bucle. */}
      <Animated.View
        style={[
          styles.shimmer,
          { opacity: intenso ? 0.5 : 0.32, transform: [{ translateX }, { rotate: '18deg' }] },
        ]}
      />
    </View>
  );
}

/**
 * Presentación en carrusel de las láminas montadas de la temporada, con
 * auto-avance pausable y marco holográfico animado.
 */
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

  const scrollX = useRef(new Animated.Value(0)).current;
  const listRef = useRef<Animated.FlatList<LaminaVista> | null>(null);
  const [indiceActual, setIndiceActual] = useState(0);
  const indiceRef = useRef(0);
  const [reproduciendo, setReproduciendo] = useState(true);

  useEffect(() => {
    const off = albumPres.subscribe(setAlbum);
    void albumPres.load(temporadaId);
    return off;
  }, [albumPres, temporadaId]);

  useEffect(() => {
    if (!perfilPres) {
      return;
    }
    const offPartidos = perfilPres.subscribePartidos(setPartidos);
    const offProfile = perfilPres.subscribeProfile(setProfile);
    if (perfilPres.getPartidosState().status === 'idle') {
      void perfilPres.loadPartidos(temporadaId);
    }
    if (perfilPres.getProfileState().status === 'idle') {
      void perfilPres.loadProfile();
    }
    return () => {
      offPartidos();
      offProfile();
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

  // Auto-avance: cada AUTO_MS pasa a la siguiente lámina y hace loop al final.
  // Se detiene si está pausado o si hay 0/1 láminas. Se limpia al desmontar.
  useEffect(() => {
    if (!reproduciendo || laminas.length <= 1) {
      return;
    }
    const id = setInterval(() => {
      const siguiente = (indiceRef.current + 1) % laminas.length;
      listRef.current?.scrollToOffset({ offset: siguiente * SNAP, animated: true });
    }, AUTO_MS);
    return () => clearInterval(id);
  }, [reproduciendo, laminas.length]);

  const cargando =
    album.status === 'loading' ||
    album.status === 'idle' ||
    (partidos?.status ?? 'idle') === 'loading';

  const onScrollBeginDrag = useCallback(() => {
    // Al tocar/arrastrar, pausamos el auto-avance (el usuario toma el control).
    setReproduciendo(false);
  }, []);

  const renderItem = ({
    item,
    index,
  }: ListRenderItemInfo<LaminaVista>): React.ReactElement => {
    const inputRange = [(index - 1) * SNAP, index * SNAP, (index + 1) * SNAP];
    // Cover-flow: rotación 3D + perspectiva + escala/opacidad al alejarse del centro.
    const scale = scrollX.interpolate({
      inputRange,
      outputRange: [0.82, 1, 0.82],
      extrapolate: 'clamp',
    });
    const opacity = scrollX.interpolate({
      inputRange,
      outputRange: [0.35, 1, 0.35],
      extrapolate: 'clamp',
    });
    const rotateY = scrollX.interpolate({
      inputRange,
      outputRange: ['32deg', '0deg', '-32deg'],
      extrapolate: 'clamp',
    });
    // Parallax: la foto interna se desplaza a distinta velocidad que la tarjeta.
    const fotoTranslate = scrollX.interpolate({
      inputRange,
      outputRange: [CARD_W * 0.18, 0, -CARD_W * 0.18],
      extrapolate: 'clamp',
    });
    const realce = etiquetaRealce(item.partido);
    const marcador = marcadorTexto(item.partido);
    const especial = tieneRealceEspecial(item.partido);
    const codigo = (item.partido.rival ?? '').slice(0, 3).toUpperCase();
    return (
      <Animated.View
        style={[
          styles.cardWrap,
          { opacity, transform: [{ perspective: 1000 }, { scale }, { rotateY }] },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Lámina ${item.partido.numeroRecuadro} contra ${item.partido.rival}`}
          onPress={() => onAbrirPartido?.(item.partido.partidoId)}
          style={[styles.card, { borderColor: colorClub }]}
        >
          {/* Zona superior: foto sobre fondo gráfico con el color del club. */}
          <View style={[styles.foto, { backgroundColor: colorClub2 }]}>
            {/* Bloque gráfico de fondo (número gigante tipo cromo). */}
            <Text style={[styles.fondoNumero, { color: colorClub }]} numberOfLines={1}>
              {item.partido.numeroRecuadro ?? ''}
            </Text>
            {item.miniaturaUri ? (
              <Animated.Image
                source={{ uri: item.miniaturaUri }}
                style={[styles.fotoImg, { transform: [{ translateX: fotoTranslate }] }]}
                accessibilityRole="image"
              />
            ) : (
              <View style={styles.fotoVacia} />
            )}
            {/* Foil holográfico (más intenso si Clásico/Internacional). */}
            <HoloOverlay intenso={especial} />
            {/* Escudo del club en la esquina superior derecha (como el emblema). */}
            <View style={styles.escudoEsquina}>
              <Crest
                url={club?.escudoUrl}
                monogram={(club?.nombre ?? 'CLB').slice(0, 3).toUpperCase()}
                size={30}
              />
            </View>
            {/* Código vertical lateral (abreviatura del rival), como los cromos. */}
            <Text style={styles.codigoLateral}>{codigo}</Text>
            {realce ? (
              <Badge label={realce} tone={item.partido.esClasico ? 'gold' : 'accent'} style={styles.realceBadge} />
            ) : null}
          </View>

          {/* Franja inferior tipo Panini: nombre + datos + barra de club. */}
          <View style={styles.pie}>
            <Text style={styles.rival} numberOfLines={1}>
              {item.partido.rival.toUpperCase()}
            </Text>
            <Text style={styles.datos} numberOfLines={1}>
              {item.partido.competicion}
              {marcador ? ` · ${marcador}` : ''}
            </Text>
            <View style={[styles.barraClub, { backgroundColor: colorClub }]}>
              <Text style={styles.barraClubText} numberOfLines={1}>
                {(club?.nombre ?? 'MI CLUB').toUpperCase()}
              </Text>
              <Text style={styles.barraClubNum}>N°{item.partido.numeroRecuadro ?? '—'}</Text>
            </View>
          </View>
        </Pressable>
      </Animated.View>
    );
  };

  return (
    <Screen tone="dark" flush>
      <Hero eyebrow="Recuerdos de la temporada" title="Revisar mi temporada">
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
          <Animated.FlatList
            ref={listRef}
            data={laminas}
            keyExtractor={(item: LaminaVista) => item.partido.partidoId}
            renderItem={renderItem}
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={SNAP}
            decelerationRate="fast"
            contentContainerStyle={styles.lista}
            onScrollBeginDrag={onScrollBeginDrag}
            onScroll={Animated.event(
              [{ nativeEvent: { contentOffset: { x: scrollX } } }],
              {
                useNativeDriver: true,
                listener: (e: { nativeEvent: { contentOffset: { x: number } } }) => {
                  const i = Math.round(e.nativeEvent.contentOffset.x / SNAP);
                  indiceRef.current = i;
                  setIndiceActual(i);
                },
              },
            )}
            scrollEventThrottle={16}
          />

          {/* Control de reproducción del auto-avance. */}
          {laminas.length > 1 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={reproduciendo ? 'Pausar la presentación' : 'Reanudar la presentación'}
              onPress={() => setReproduciendo((v) => !v)}
              style={styles.playBtn}
            >
              <Text style={styles.playIcon}>{reproduciendo ? '❚❚' : '▶'}</Text>
              <Text style={styles.playText}>
                {reproduciendo ? 'Pausar' : 'Reproducir'}
              </Text>
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
  lista: {
    alignItems: 'center',
    paddingHorizontal: (SCREEN_W - CARD_W) / 2,
    paddingVertical: spacing.xl,
  },
  cardWrap: { width: CARD_W, marginRight: CARD_SPACING },
  card: {
    borderRadius: radius.card,
    // Marco de color del club (como el borde turquesa del cromo Panini).
    borderWidth: 6,
    backgroundColor: palette.inkSoft,
    overflow: 'hidden',
  },
  foto: {
    width: '100%',
    aspectRatio: 1,
    position: 'relative',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Número gigante de fondo (como el "23" de los cromos del Mundial).
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
  escudoEsquina: { position: 'absolute', top: spacing.sm, right: spacing.sm },
  codigoLateral: {
    position: 'absolute',
    right: 2,
    bottom: spacing.sm,
    color: '#FFFFFF',
    fontFamily: fonts.display,
    fontSize: fontSize.title,
    fontWeight: fontWeight.bold,
    opacity: 0.9,
    letterSpacing: 2,
  },

  // --- Foil holográfico ---
  holoTint: { position: 'absolute', top: 0, left: 0, right: 0, height: '45%' },
  holoTintB: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '45%' },
  holoTintC: { position: 'absolute', top: '30%', left: 0, right: 0, height: '40%' },
  shimmer: {
    position: 'absolute',
    top: -CARD_H,
    bottom: -CARD_H,
    width: CARD_W * 0.5,
    backgroundColor: '#FFFFFF',
  },

  // Badge de realce arriba a la izquierda (el escudo va a la derecha).
  realceBadge: { position: 'absolute', top: spacing.sm, left: spacing.sm },
  // Franja inferior del cromo (estilo Panini): fondo claro, nombre + datos + barra.
  pie: {
    backgroundColor: palette.surface,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    alignItems: 'center',
  },
  rival: {
    color: palette.textOnDark,
    fontFamily: fonts.display,
    fontSize: fontSize.title,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  datos: {
    color: palette.textMutedOnDark,
    fontFamily: fonts.body,
    fontSize: fontSize.small,
    marginTop: 2,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  barraClub: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  barraClubText: {
    flex: 1,
    color: '#FFFFFF',
    fontFamily: fonts.body,
    fontSize: fontSize.caption,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.5,
  },
  barraClubNum: {
    color: '#FFFFFF',
    fontFamily: fonts.body,
    fontSize: fontSize.caption,
    fontWeight: fontWeight.bold,
  },

  // --- Control de reproducción ---
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
