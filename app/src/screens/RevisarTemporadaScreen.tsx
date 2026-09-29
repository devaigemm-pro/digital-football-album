// RevisarTemporadaScreen — presentación premium de la temporada en formato
// carrusel de láminas (cromos) montadas, en secuencia.
//
// Es un "pase" elegante de los recuerdos ya coleccionados: cada lámina con su
// Foto_Principal se muestra como un cromo a pantalla, y al deslizar, la lámina
// central se agranda y las laterales se atenúan/encogen (efecto de profundidad).
//
// IMPLEMENTACIÓN: carrusel horizontal con `Animated.FlatList` + `pagingEnabled`
// e interpolación del desplazamiento (`scrollX`) para escala/opacidad por tarjeta.
// Es la API `Animated` NATIVA de React Native (sin dependencias nuevas: nada de
// reanimated/skia, que exigirían rebuild nativo). Patrón estándar de carrusel con
// FlatList e interpolación de scrollX.
//
// DATOS REALES: las láminas montadas salen de la lista de partidos
// (`laminasMontadasEnSecuencia`); la miniatura de cada una, del preview del álbum
// (`GET /album/:id/preview`, por número de recuadro). No se inventa nada; si no
// hay láminas montadas aún, se guía al usuario.
//
// `.tsx` EXCLUIDO del typecheck (`app/tsconfig.json`): usa React Native. La
// lógica de selección/orden vive en `laminas.ts` (TS puro, testeado).

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
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
  type AlbumPreviewClient,
  type AlbumPreviewState,
} from '../album';
import { ProfilePresenter, type PartidosState } from '../profile';
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
const CARD_SPACING = spacing.md;
const SNAP = CARD_W + CARD_SPACING;

/** Lámina lista para el carrusel: partido + miniatura resuelta. */
interface LaminaVista {
  readonly partido: PartidoLamina;
  readonly miniaturaUri: string | null;
}

/**
 * Presentación en carrusel de las láminas montadas de la temporada. Cada tarjeta
 * es un cromo con la foto, el número, el rival, el marcador y el realce; la
 * central se destaca con una animación de escala/opacidad al desplazar.
 */
export function RevisarTemporadaScreen({
  temporadaId,
  albumClient,
  profilePresenter,
  profileClient,
  onAbrirPartido,
}: RevisarTemporadaScreenProps): React.ReactElement {
  const albumPres = useMemo(
    () => new AlbumPreviewPresenter(albumClient),
    [albumClient],
  );
  const perfilPres = useMemo(
    () => profilePresenter ?? (profileClient ? new ProfilePresenter(profileClient) : null),
    [profilePresenter, profileClient],
  );

  const [album, setAlbum] = useState<AlbumPreviewState>(() => albumPres.getState());
  const [partidos, setPartidos] = useState<PartidosState | null>(
    () => perfilPres?.getPartidosState() ?? null,
  );

  const scrollX = useRef(new Animated.Value(0)).current;
  const [indiceActual, setIndiceActual] = useState(0);

  useEffect(() => {
    const off = albumPres.subscribe(setAlbum);
    void albumPres.load(temporadaId);
    return off;
  }, [albumPres, temporadaId]);

  useEffect(() => {
    if (!perfilPres) {
      return;
    }
    const off = perfilPres.subscribePartidos(setPartidos);
    if (perfilPres.getPartidosState().status === 'idle') {
      void perfilPres.loadPartidos(temporadaId);
    }
    return off;
  }, [perfilPres, temporadaId]);

  // Miniatura por número de recuadro (del preview del álbum).
  const miniaturaPorNumero = useMemo(() => {
    const map = new Map<number, string>();
    for (const r of album.recuadros) {
      if (r.estado === 'MONTADA') {
        map.set(r.numero, r.miniaturaKey);
      }
    }
    return map;
  }, [album.recuadros]);

  // Láminas montadas en secuencia + su miniatura resuelta.
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

  const cargando =
    album.status === 'loading' ||
    album.status === 'idle' ||
    (partidos?.status ?? 'idle') === 'loading';

  const renderItem = ({
    item,
    index,
  }: ListRenderItemInfo<LaminaVista>): React.ReactElement => {
    // Rango de desplazamiento que centra esta tarjeta.
    const inputRange = [(index - 1) * SNAP, index * SNAP, (index + 1) * SNAP];
    const scale = scrollX.interpolate({
      inputRange,
      outputRange: [0.86, 1, 0.86],
      extrapolate: 'clamp',
    });
    const opacity = scrollX.interpolate({
      inputRange,
      outputRange: [0.5, 1, 0.5],
      extrapolate: 'clamp',
    });
    const realce = etiquetaRealce(item.partido);
    const marcador = marcadorTexto(item.partido);
    return (
      <Animated.View style={[styles.cardWrap, { transform: [{ scale }], opacity }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Lámina ${item.partido.numeroRecuadro} contra ${item.partido.rival}`}
          onPress={() => onAbrirPartido?.(item.partido.partidoId)}
          style={styles.card}
        >
          {/* Foto de la lámina (cromo). */}
          <View style={styles.foto}>
            {item.miniaturaUri ? (
              <Image
                source={{ uri: item.miniaturaUri }}
                style={styles.fotoImg}
                accessibilityRole="image"
              />
            ) : (
              <View style={styles.fotoVacia} />
            )}
            {/* Número del cromo, esquina superior. */}
            <View style={styles.numeroBadge}>
              <Text style={styles.numeroText}>{item.partido.numeroRecuadro}</Text>
            </View>
            {realce ? (
              <Badge label={realce} tone={item.partido.esClasico ? 'gold' : 'accent'} style={styles.realceBadge} />
            ) : null}
          </View>

          {/* Pie del cromo: rival + marcador. */}
          <View style={styles.pie}>
            <Text style={styles.rival} numberOfLines={1}>
              vs {item.partido.rival}
            </Text>
            <Text style={styles.marcador}>{marcador ?? '—'}</Text>
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
        <Animated.FlatList
          data={laminas}
          keyExtractor={(item: LaminaVista) => item.partido.partidoId}
          renderItem={renderItem}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={SNAP}
          decelerationRate="fast"
          contentContainerStyle={styles.lista}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { x: scrollX } } }],
            {
              useNativeDriver: true,
              listener: (e: { nativeEvent: { contentOffset: { x: number } } }) => {
                setIndiceActual(Math.round(e.nativeEvent.contentOffset.x / SNAP));
              },
            },
          )}
          scrollEventThrottle={16}
        />
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
  lista: {
    alignItems: 'center',
    paddingHorizontal: (SCREEN_W - CARD_W) / 2,
    paddingVertical: spacing.xl,
  },
  cardWrap: { width: CARD_W, marginRight: CARD_SPACING },
  card: {
    borderRadius: radius.card,
    borderWidth: 2,
    borderColor: palette.goldStrong,
    backgroundColor: palette.inkSoft,
    overflow: 'hidden',
  },
  foto: {
    width: '100%',
    aspectRatio: 3 / 4,
    backgroundColor: palette.ink,
    position: 'relative',
  },
  fotoImg: { width: '100%', height: '100%', resizeMode: 'cover' },
  fotoVacia: { width: '100%', height: '100%', backgroundColor: palette.inkSoft },
  numeroBadge: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    minWidth: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: '#000000B3',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  numeroText: {
    color: palette.textOnDark,
    fontFamily: fonts.display,
    fontSize: fontSize.subtitle,
    fontWeight: fontWeight.bold,
  },
  realceBadge: { position: 'absolute', top: spacing.sm, right: spacing.sm },
  pie: {
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  rival: {
    flex: 1,
    color: palette.textOnDark,
    fontFamily: fonts.body,
    fontSize: fontSize.body,
    fontWeight: fontWeight.bold,
  },
  marcador: {
    color: palette.textOnDark,
    fontFamily: fonts.display,
    fontSize: fontSize.title,
    fontWeight: fontWeight.bold,
  },
});

export default RevisarTemporadaScreen;
