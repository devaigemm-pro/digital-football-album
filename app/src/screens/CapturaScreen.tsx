// Pantalla de Captura (UI React Native) — Task 28.1 + 28.3.
//
// Requirements:
//   - Cliente Req 3.1/3.2/3.3 (backend Req 5.1–5.4): cargar desde galería o
//     tomar con cámara y subir una o varias fotos por partido vía
//     `POST /momentos/{partidoId}/fotos`.
//   - Cliente Req 24.1/24.2/24.4: solicitar el permiso (cámara/almacenamiento)
//     explicando el motivo antes de usar el recurso, y cesar el uso al revocar.
//
// Es un componente DELGADO: no contiene lógica de negocio ni de permisos. Toda
// la lógica verificable vive en `app/src/capture` (CapturePresenter) y en
// `app/src/permissions` (PermissionGate), que son TypeScript puro y testeados.
// Este archivo es `.tsx` y queda EXCLUIDO del typecheck (`app/tsconfig.json`):
// depende de React/React Native, cuyo toolchain se instala aparte.

import React, { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Image, StyleSheet, Text, View } from 'react-native';

import { CapturePresenter } from '../capture';
import { Hero, PrimaryButton, Screen, SecondaryButton } from '../ui/kit';
import { fonts, fontSize, palette, radius, spacing } from '../theme/design-tokens';
import type { CapturePhotoInput } from '../capture';
import {
  MOTIVOS_PERMISO,
  Permiso,
  PermisoNoConcedidoError,
  PermissionGate,
} from '../permissions';
import type { FuenteFoto } from '../viewmodels';

/**
 * Puente hacia las APIs nativas del dispositivo. Lo implementa la capa de
 * adaptadores (image picker / cámara / prompts de permisos del SO). Aquí solo
 * se declara el contrato para mantener la pantalla desacoplada.
 */
export interface CaptureNativeBridge {
  /** Abre la galería (Req 3.1) y devuelve la foto elegida, o null si se cancela. */
  pickFromGallery(): Promise<Omit<CapturePhotoInput, 'partidoId' | 'fuente'> | null>;
  /** Abre la cámara (Req 3.2) y devuelve la foto tomada, o null si se cancela. */
  takePhoto(): Promise<Omit<CapturePhotoInput, 'partidoId' | 'fuente'> | null>;
}

export interface CapturaScreenProps {
  /** Partido oficial al que se asocian las fotos capturadas. */
  readonly partidoId: string;
  /** Presentador de captura (inyectado; enlaza CaptureViewModel + PermissionGate). */
  readonly presenter: CapturePresenter;
  /** Puerta de permisos, para explicar el motivo en la UI (Req 24.1). */
  readonly gate: PermissionGate;
  /** Puente nativo de galería/cámara. */
  readonly native: CaptureNativeBridge;
}

/**
 * Pantalla de captura de momentos. Ofrece "Cargar de galería" y "Tomar foto";
 * al elegir la fuente, obtiene el binario del puente nativo y delega en el
 * `CapturePresenter`, que asegura el permiso adecuado (Req 24.2) antes de subir.
 */
export function CapturaScreen({
  partidoId,
  presenter,
  gate,
  native,
}: CapturaScreenProps): React.ReactElement {
  const [subidas, setSubidas] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState(false);

  const capturar = useCallback(
    async (fuente: FuenteFoto) => {
      setOcupado(true);
      try {
        const seleccion =
          fuente === 'galeria'
            ? await native.pickFromGallery()
            : await native.takePhoto();
        if (!seleccion) {
          return; // el usuario canceló el picker.
        }
        const foto = await presenter.capturePhoto({ ...seleccion, fuente, partidoId });
        setSubidas((prev) => [...prev, foto.objectKey]);
      } catch (e) {
        if (e instanceof PermisoNoConcedidoError) {
          // Req 24.1/24.2/24.4: el permiso no está concedido; explicar el motivo.
          Alert.alert('Permiso necesario', MOTIVOS_PERMISO[e.permiso]);
        } else {
          Alert.alert('No se pudo subir la foto', String(e));
        }
      } finally {
        setOcupado(false);
      }
    },
    [native, presenter, partidoId],
  );

  const explicacionGaleria = useMemo(
    () => gate.motivoDe(Permiso.ALMACENAMIENTO),
    [gate],
  );

  return (
    <Screen tone="light" flush>
      <Hero eyebrow="Nuevo momento" title="Fotos del partido" />

      <View style={styles.body}>
        <Text style={styles.motivo}>{explicacionGaleria}</Text>
        <View style={styles.acciones}>
          <PrimaryButton
            title="Cargar de galería"
            onPress={() => void capturar('galeria')}
            disabled={ocupado}
            style={styles.accion}
          />
          <SecondaryButton
            title="Tomar foto"
            tone="light"
            onPress={() => void capturar('camara')}
            disabled={ocupado}
            style={styles.accion}
          />
        </View>
        <FlatList
          data={subidas}
          keyExtractor={(key) => key}
          numColumns={3}
          columnWrapperStyle={styles.row}
          renderItem={({ item }) => (
            <Image style={styles.miniatura} source={{ uri: item }} />
          )}
          ListEmptyComponent={<Text style={styles.vacio}>Aún no hay fotos.</Text>}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, padding: spacing.lg },
  motivo: { color: palette.textMutedOnLight, fontFamily: fonts.body, fontSize: fontSize.small, marginBottom: spacing.md },
  acciones: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  accion: { flex: 1 },
  row: { gap: spacing.sm, marginBottom: spacing.sm },
  miniatura: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: palette.surface,
  },
  vacio: { color: palette.textMutedOnLight, fontFamily: fonts.body },
});

export default CapturaScreen;
