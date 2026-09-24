// HomeAlbumScreen — pantalla de previsualización del álbum coleccionable.
//
// Task 29.1 — Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
// (backend Req 11.1/11.2/11.3; cliente Req 27.4/27.5 — no bloquear la UI).
//
// IMPORTANTE (entorno actual): las dependencias de React / React Native NO
// están instaladas en este entorno, por lo que este archivo `.tsx` está
// EXCLUIDO del typecheck de `app/tsconfig.json` (ver "exclude"). Es código real,
// listo para compilar cuando se instale el toolchain RN/React; hasta entonces no
// participa en `tsc --noEmit`.
//
// Este componente es intencionadamente DELGADO: NO contiene lógica sensible a la
// corrección. Toda la lógica (consumir `GET /album/{temporadaId}/preview`,
// derivar las entradas ordenadas, la lista de faltantes y la máquina de estados
// de carga no bloqueante) vive en `AlbumPreviewPresenter` (TypeScript puro,
// unit-testado en `album/album-preview-presenter.test.ts`). Aquí solo se enlaza
// ese presentador a React y se pinta:
//   - los Recuadros MONTADA con su miniatura optimizada (Req 4.1);
//   - los Recuadros VACIO como silueta punteada (Req 4.2);
//   - un indicador de faltantes (Recuadros sin Foto_Principal — Req 4.3);
// manteniendo la UI operable mientras la petición está en curso (Req 4.5).

import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
} from 'react-native';

import {
  AlbumPreviewPresenter,
  type AlbumPreviewClient,
  type AlbumPreviewEntry,
  type AlbumPreviewState,
} from '../album';
import { Hero, Screen, StickerSlot } from '../ui/kit';
import { fonts, fontSize, fontWeight, palette, radius, spacing } from '../theme/design-tokens';

export interface HomeAlbumScreenProps {
  /** Temporada cuyo álbum se previsualiza. */
  readonly temporadaId: string;
  /** Adaptador HTTP de `AlbumPreviewClient` (`GET /album/{temporadaId}/preview`). */
  readonly client: AlbumPreviewClient;
  /** Presentador ya construido (opcional, útil en tests/Storybook). */
  readonly presenter?: AlbumPreviewPresenter;
}

/**
 * Pinta la entrada de un Recuadro según su estado, con el look de sticker del
 * mockup: montado => miniatura + número; vacío => silueta punteada "Pega aquí"
 * (Req 4.1, 4.2). La celda va envuelta para respetar el gap entre columnas.
 */
function renderRecuadro({
  item,
}: ListRenderItemInfo<AlbumPreviewEntry>): React.ReactElement {
  const montada = item.estado === 'MONTADA';
  return (
    <View style={styles.cell}>
      <StickerSlot
        numero={item.numero}
        imageUri={montada ? item.miniaturaKey : null}
      />
    </View>
  );
}

/**
 * Pantalla de previsualización del álbum. Enlaza el `AlbumPreviewPresenter` al
 * árbol de React y re-renderiza cuando su estado cambia, sin bloquear la UI
 * (Req 4.5).
 */
export function HomeAlbumScreen({
  temporadaId,
  client,
  presenter,
}: HomeAlbumScreenProps): React.ReactElement {
  const pres = useMemo(
    () => presenter ?? new AlbumPreviewPresenter(client),
    [presenter, client],
  );

  const [state, setState] = useState<AlbumPreviewState>(() => pres.getState());

  useEffect(() => {
    // `subscribe` emite el estado actual de inmediato y en cada cambio.
    const unsubscribe = pres.subscribe(setState);
    // Dispara la carga (no bloqueante): actualiza el estado al resolver/fallar.
    void pres.load(temporadaId);
    return unsubscribe;
  }, [pres, temporadaId]);

  return (
    <Screen tone="light" flush>
      <Hero eyebrow="Temporada 2026" title="Mi álbum">
        {state.status === 'loading' ? (
          // Indicador no bloqueante: la lista sigue visible y operable (Req 4.5).
          <ActivityIndicator
            color={palette.textOnDark}
            accessibilityLabel="Cargando previsualización"
            style={styles.heroSpinner}
          />
        ) : null}
      </Hero>

      <View style={styles.body}>
        {/* Indicador de faltantes: Recuadros sin Foto_Principal (Req 4.3). */}
        {state.faltantesCount > 0 ? (
          <View style={styles.faltantesBox}>
            <Text style={styles.faltantes} accessibilityRole="text">
              Te faltan {state.faltantesCount} recuadros: {state.faltantes.join(', ')}
            </Text>
          </View>
        ) : null}

        {/* Estado de error no bloqueante con opción de reintento (Req 4.5). */}
        {state.status === 'error' && state.error !== null ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{state.error}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reintentar cargar la previsualización"
              onPress={() => {
                void pres.load(temporadaId);
              }}
            >
              <Text style={styles.retry}>Reintentar</Text>
            </Pressable>
          </View>
        ) : null}

        <FlatList
          data={state.recuadros}
          keyExtractor={(item) => String(item.numero)}
          renderItem={renderRecuadro}
          numColumns={3}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.grid}
          // La lista permanece desplazable durante la carga (UI operable — Req 4.5).
          scrollEnabled
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroSpinner: { alignSelf: 'flex-start', marginTop: spacing.sm },
  body: { flex: 1, paddingHorizontal: spacing.md, paddingTop: spacing.md },
  faltantesBox: {
    backgroundColor: palette.warningBg,
    borderRadius: radius.md,
    borderLeftWidth: 4,
    borderLeftColor: palette.accent,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  faltantes: { color: palette.warning, fontFamily: fonts.body, fontSize: fontSize.small, fontWeight: fontWeight.semibold },
  errorBox: { marginBottom: spacing.sm },
  errorText: { color: palette.danger, fontFamily: fonts.body, marginBottom: spacing.xs },
  retry: { color: palette.info, fontFamily: fonts.body, fontWeight: fontWeight.semibold },
  grid: { paddingBottom: spacing.lg },
  row: { gap: spacing.sm, marginBottom: spacing.sm },
  cell: { flex: 1 },
});

export default HomeAlbumScreen;
