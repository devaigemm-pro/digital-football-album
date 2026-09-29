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
import { ProfilePresenter, type PartidosState } from '../profile';
import type { ProfileClient } from '../adapters';
import { Hero, Screen, StickerSlot } from '../ui/kit';
import { fonts, fontSize, fontWeight, palette, radius, spacing } from '../theme/design-tokens';

export interface HomeAlbumScreenProps {
  /** Temporada cuyo álbum se previsualiza. */
  readonly temporadaId: string;
  /** Adaptador HTTP de `AlbumPreviewClient` (`GET /album/{temporadaId}/preview`). */
  readonly client: AlbumPreviewClient;
  /** Presentador ya construido (opcional, útil en tests/Storybook). */
  readonly presenter?: AlbumPreviewPresenter;
  /**
   * Presentador de perfil/partidos compartido. Aporta la lista de partidos para
   * mapear el número de recuadro → `partidoId` y así navegar a su detalle al
   * tocar la lámina (el preview del álbum no trae el `partidoId`).
   */
  readonly profilePresenter?: ProfilePresenter;
  /** Cliente de perfil/partidos (para construir el presentador si no se inyecta). */
  readonly profileClient?: ProfileClient;
  /** Navega al detalle del partido asociado a la lámina tocada. */
  readonly onAbrirPartido?: (partidoId: string) => void;
  /** Abre la presentación premium "Revisar mi temporada". */
  readonly onRevisarTemporada?: () => void;
}

/**
 * Pantalla de previsualización del álbum. Enlaza el `AlbumPreviewPresenter` al
 * árbol de React y re-renderiza cuando su estado cambia, sin bloquear la UI
 * (Req 4.5). Al tocar una lámina (montada o vacía "Pega aquí"), navega al detalle
 * del partido asociado a su recuadro.
 */
export function HomeAlbumScreen({
  temporadaId,
  client,
  presenter,
  profilePresenter,
  profileClient,
  onAbrirPartido,
  onRevisarTemporada,
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

  // Presentador de perfil/partidos (compartido, o construido desde el cliente)
  // para mapear el número de recuadro → partidoId (el preview no trae el id).
  const perfilPres = useMemo(
    () => profilePresenter ?? (profileClient ? new ProfilePresenter(profileClient) : null),
    [profilePresenter, profileClient],
  );
  const [partidos, setPartidos] = useState<PartidosState | null>(
    () => perfilPres?.getPartidosState() ?? null,
  );

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

  // Mapa numeroRecuadro → partidoId para navegar desde la lámina al partido.
  const partidoPorNumero = useMemo(() => {
    const map = new Map<number, string>();
    for (const p of partidos?.partidos ?? []) {
      if (p.numeroRecuadro != null) {
        map.set(p.numeroRecuadro, p.partidoId);
      }
    }
    return map;
  }, [partidos]);

  const renderRecuadro = ({
    item,
  }: ListRenderItemInfo<AlbumPreviewEntry>): React.ReactElement => {
    const montada = item.estado === 'MONTADA';
    const partidoId = partidoPorNumero.get(item.numero) ?? null;
    return (
      <Pressable
        style={styles.cell}
        accessibilityRole="button"
        accessibilityLabel={`Abrir el partido de la lámina ${item.numero}`}
        disabled={partidoId === null || !onAbrirPartido}
        onPress={() => {
          if (partidoId && onAbrirPartido) {
            onAbrirPartido(partidoId);
          }
        }}
      >
        <StickerSlot
          numero={item.numero}
          imageUri={montada ? item.miniaturaKey : null}
        />
      </Pressable>
    );
  };

  return (
    <Screen tone="dark" flush>
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
        {/* Presentación premium de la temporada (carrusel de láminas montadas). */}
        {onRevisarTemporada ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Revisar mi temporada"
            onPress={onRevisarTemporada}
            style={styles.revisarCta}
          >
            <Text style={styles.revisarText}>✨ Revisar mi temporada</Text>
          </Pressable>
        ) : null}

        {/* Los recuadros sin Foto_Principal ya se comunican con su silueta
            punteada en la propia rejilla (Req 4.2); no se muestra un aviso
            aparte de "faltantes" (decisión de diseño 2026-09-27). */}

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
  errorBox: { marginBottom: spacing.sm },
  errorText: { color: palette.danger, fontFamily: fonts.body, marginBottom: spacing.xs },
  retry: { color: palette.info, fontFamily: fonts.body, fontWeight: fontWeight.semibold },
  grid: { paddingBottom: spacing.lg },
  row: { gap: spacing.sm, marginBottom: spacing.sm },
  cell: { flex: 1 },
  revisarCta: {
    marginBottom: spacing.md,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: palette.goldStrong,
    backgroundColor: palette.glassFill,
  },
  revisarText: {
    color: palette.textOnDark,
    fontFamily: fonts.body,
    fontSize: fontSize.body,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.3,
  },
});

export default HomeAlbumScreen;
