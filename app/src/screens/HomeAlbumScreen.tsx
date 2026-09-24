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
  Image,
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

export interface HomeAlbumScreenProps {
  /** Temporada cuyo álbum se previsualiza. */
  readonly temporadaId: string;
  /** Adaptador HTTP de `AlbumPreviewClient` (`GET /album/{temporadaId}/preview`). */
  readonly client: AlbumPreviewClient;
  /** Presentador ya construido (opcional, útil en tests/Storybook). */
  readonly presenter?: AlbumPreviewPresenter;
}

/** Resuelve la URI de una miniatura optimizada a una fuente de `Image` de RN. */
function thumbnailSource(miniaturaKey: string): { uri: string } {
  return { uri: miniaturaKey };
}

/** Celda de un Recuadro MONTADA: miniatura optimizada de la Foto_Principal (Req 4.1). */
function RecuadroMontada({
  numero,
  miniaturaKey,
}: {
  numero: number;
  miniaturaKey: string;
}): React.ReactElement {
  return (
    <View style={styles.recuadro} accessibilityLabel={`Recuadro ${numero} montado`}>
      <Image
        style={styles.miniatura}
        source={thumbnailSource(miniaturaKey)}
        accessibilityRole="image"
        accessibilityLabel={`Foto del recuadro ${numero}`}
      />
      <Text style={styles.numero}>{numero}</Text>
    </View>
  );
}

/** Celda de un Recuadro VACIO: silueta punteada de un Recuadro faltante (Req 4.2). */
function RecuadroVacio({ numero }: { numero: number }): React.ReactElement {
  return (
    <View
      style={[styles.recuadro, styles.silueta]}
      accessibilityLabel={`Recuadro ${numero} vacío, falta la foto`}
    >
      <Text style={styles.numeroVacio}>{numero}</Text>
    </View>
  );
}

/** Pinta la entrada de un Recuadro según su estado (montada o vacía). */
function renderRecuadro({
  item,
}: ListRenderItemInfo<AlbumPreviewEntry>): React.ReactElement {
  if (item.estado === 'MONTADA') {
    return <RecuadroMontada numero={item.numero} miniaturaKey={item.miniaturaKey} />;
  }
  return <RecuadroVacio numero={item.numero} />;
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
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Mi álbum</Text>
        {state.status === 'loading' ? (
          // Indicador no bloqueante: la lista sigue visible y operable (Req 4.5).
          <ActivityIndicator accessibilityLabel="Cargando previsualización" />
        ) : null}
      </View>

      {/* Indicador de faltantes: Recuadros sin Foto_Principal (Req 4.3). */}
      {state.faltantesCount > 0 ? (
        <Text style={styles.faltantes} accessibilityRole="text">
          Te faltan {state.faltantesCount} recuadros:{' '}
          {state.faltantes.join(', ')}
        </Text>
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
        // La lista permanece desplazable durante la carga (UI operable — Req 4.5).
        scrollEnabled
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: { fontSize: 20, fontWeight: '600' },
  faltantes: { marginBottom: 8, fontSize: 14 },
  errorBox: { marginBottom: 8 },
  errorText: { color: '#b00020', marginBottom: 4 },
  retry: { color: '#1565c0', fontWeight: '600' },
  recuadro: {
    flex: 1,
    margin: 4,
    aspectRatio: 3 / 4,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#f2f2f2',
  },
  silueta: {
    borderWidth: 2,
    borderStyle: 'dashed',
    // #616161 (grey 700) sobre fondo claro alcanza ~6.19:1 (≥ 4.5:1, WCAG AA).
    borderColor: '#616161',
    backgroundColor: 'transparent',
  },
  miniatura: { ...StyleSheet.absoluteFillObject, resizeMode: 'cover' },
  numero: {
    position: 'absolute',
    bottom: 4,
    right: 6,
    color: '#ffffff',
    fontWeight: '700',
    textShadowColor: '#000000',
    textShadowRadius: 2,
  },
  // #616161 sobre fondo claro alcanza ~6.19:1 de contraste (≥ 4.5:1, WCAG AA).
  numeroVacio: { color: '#616161', fontWeight: '700' },
});

export default HomeAlbumScreen;
