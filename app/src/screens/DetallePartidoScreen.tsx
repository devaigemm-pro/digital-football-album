// DetallePartidoScreen — detalle de un partido/lámina (UI React Native).
//
// Requerimientos del usuario (sobre backend Req 5 y 6):
//   - Al acceder a un partido se ve el RESULTADO y los GOLEADORES.
//   - Un botón "Detalles" que, al pulsarlo, muestra las FORMACIONES junto a la
//     LÁMINA donde el usuario adjunta la fotografía del partido y deja una
//     RESEÑA.
//
// Es un componente DELGADO: no contiene lógica de negocio. Compone tres piezas
// ya existentes y testeadas (TypeScript puro tras puertos inyectables):
//   - `ProfileClient.getPartido(partidoId)` → detalle vivo (resultado,
//     goleadores, formaciones) + estado de la lámina (recuadro, momento, fotos).
//   - `CapturePresenter.capturePhoto(...)` → adjunta la foto del partido
//     (`POST /momentos/{partidoId}/fotos`) tras asegurar el permiso.
//   - `MomentoDetailPresenter` → fija la Foto_Principal
//     (`PUT /recuadros/{id}/foto-principal`) y guarda la reseña como `notas`
//     (`PATCH /momentos/{id}`). La AUTORIDAD de las reglas (a-lo-sumo-una
//     Foto_Principal, ventana de edición) es del BACKEND; la pantalla solo
//     delega y refleja el mensaje devuelto.
//
// Este archivo es `.tsx` y queda EXCLUIDO del typecheck (`app/tsconfig.json`):
// depende de React/React Native, cuyo toolchain se instala aparte. Colores
// EXPLÍCITOS y con contraste AA (preferencia del usuario), tomados de los
// tokens del sistema.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { CapturePresenter, MomentoBusinessError, MomentoDetailPresenter } from '../capture';
import type { CaptureNativeBridge } from './CapturaScreen';
import type {
  FormacionEquipo,
  Goleador,
  PartidoDetalle,
  ProfileClient,
} from '../adapters';
import { Badge, Hero, PrimaryButton, Screen, SecondaryButton, StickerSlot } from '../ui/kit';
import {
  fonts,
  fontSize,
  fontWeight,
  palette,
  radius,
  spacing,
} from '../theme/design-tokens';

export interface DetallePartidoScreenProps {
  /** Partido oficial cuyo detalle se muestra (viene de la navegación). */
  readonly partidoId: string;
  /** Cliente de perfil/partidos (`GET /partidos/:partidoId`). */
  readonly client: ProfileClient;
  /** Presentador de captura: adjuntar la foto del partido a su Momento. */
  readonly capturePresenter: CapturePresenter;
  /** Presentador de detalle del Momento: Foto_Principal + reseña (notas). */
  readonly momentoPresenter: MomentoDetailPresenter;
  /** Puente nativo de galería/cámara para adjuntar la foto. */
  readonly native: CaptureNativeBridge;
}

/** Formatea la fecha ISO a algo legible (dd/mm/aaaa hh:mm). */
function fechaLegible(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

/** Marcador si el partido está finalizado, o el estado en otro caso. */
function marcador(p: PartidoDetalle): string {
  if (p.resultado) {
    return `${p.resultado.golesLocal} - ${p.resultado.golesVisita}`;
  }
  return p.estado === 'PROGRAMADO' ? 'Próximo' : p.estado;
}

/** URI de la Foto_Principal montada en la lámina, o null si está vacía. */
function fotoPrincipalUri(p: PartidoDetalle): string | null {
  if (p.fotoPrincipalId == null) {
    return null;
  }
  const foto = p.fotos.find((f) => f.id === p.fotoPrincipalId);
  return foto?.objectKey ?? null;
}

/**
 * Pantalla de detalle de un partido. Carga el detalle al montar (resultado,
 * goleadores y estado de la lámina). El botón "Detalles" alterna la vista
 * ampliada con las formaciones, la lámina (adjuntar foto) y la reseña.
 */
export function DetallePartidoScreen({
  partidoId,
  client,
  capturePresenter,
  momentoPresenter,
  native,
}: DetallePartidoScreenProps): React.ReactElement {
  const [detalle, setDetalle] = useState<PartidoDetalle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [mostrarDetalles, setMostrarDetalles] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [resena, setResena] = useState('');

  const recargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const d = await client.getPartido(partidoId);
      setDetalle(d);
      setResena(d.notas);
    } catch (e) {
      setError('No se pudo cargar el detalle del partido.');
    } finally {
      setCargando(false);
    }
  }, [client, partidoId]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  const uriPrincipal = useMemo(
    () => (detalle ? fotoPrincipalUri(detalle) : null),
    [detalle],
  );

  /** Refleja el mensaje de negocio del backend (o un error genérico). */
  const mostrarErrorNegocio = useCallback((titulo: string, e: unknown) => {
    if (e instanceof MomentoBusinessError) {
      Alert.alert(titulo, e.message);
    } else {
      Alert.alert(titulo, String(e));
    }
  }, []);

  /**
   * Adjunta la foto del partido: la sube al Momento (asegurando permiso) y la
   * fija como Foto_Principal del recuadro (la lámina). El backend valida la
   * biunivocidad y la ventana de edición.
   */
  const adjuntarFoto = useCallback(
    async (fuente: 'galeria' | 'camara') => {
      if (!detalle) {
        return;
      }
      if (detalle.recuadroId == null) {
        Alert.alert(
          'Sin recuadro',
          'Este partido aún no tiene un recuadro en tu álbum.',
        );
        return;
      }
      const recuadroId = detalle.recuadroId;
      setOcupado(true);
      try {
        const seleccion =
          fuente === 'galeria'
            ? await native.pickFromGallery()
            : await native.takePhoto();
        if (!seleccion) {
          return; // el usuario canceló el picker.
        }
        // 1) Sube la foto al Momento del partido (asegura permiso).
        const foto = await capturePresenter.capturePhoto({
          ...seleccion,
          fuente,
          partidoId,
        });
        // 2) La fija como Foto_Principal del recuadro (la lámina). El backend
        //    valida la biunivocidad y la ventana de edición.
        await momentoPresenter.setFotoPrincipal(recuadroId, foto.id);
        // 3) Recarga el detalle para reflejar la lámina montada.
        await recargar();
      } catch (e) {
        mostrarErrorNegocio('No se pudo adjuntar la foto', e);
      } finally {
        setOcupado(false);
      }
    },
    [
      detalle,
      native,
      capturePresenter,
      partidoId,
      momentoPresenter,
      recargar,
      mostrarErrorNegocio,
    ],
  );

  /** Guarda la reseña del partido como `notas` del Momento (`PATCH /momentos/:id`). */
  const guardarResena = useCallback(async () => {
    if (!detalle || detalle.momentoId == null) {
      Alert.alert(
        'Sin momento',
        'Adjunta una foto primero para poder dejar tu reseña.',
      );
      return;
    }
    setOcupado(true);
    try {
      await momentoPresenter.updateContexto(detalle.momentoId, { notas: resena });
      Alert.alert('Reseña guardada', 'Se actualizó tu reseña del partido.');
    } catch (e) {
      mostrarErrorNegocio('No se pudo guardar la reseña', e);
    } finally {
      setOcupado(false);
    }
  }, [detalle, momentoPresenter, resena, mostrarErrorNegocio]);

  if (cargando && !detalle) {
    return (
      <Screen tone="light" style={styles.centered}>
        <ActivityIndicator
          color={palette.accent}
          accessibilityLabel="Cargando el detalle del partido"
        />
      </Screen>
    );
  }

  if (error && !detalle) {
    return (
      <Screen tone="light" style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
        <SecondaryButton title="Reintentar" tone="light" onPress={() => void recargar()} />
      </Screen>
    );
  }

  if (!detalle) {
    return (
      <Screen tone="light" style={styles.centered}>
        <Text style={styles.mutedText}>Partido no encontrado.</Text>
      </Screen>
    );
  }

  return (
    <Screen tone="light" flush>
      <Hero eyebrow={detalle.competicion} title={`vs ${detalle.rival}`}>
        <Text style={styles.heroMarcador}>{marcador(detalle)}</Text>
        <Text style={styles.heroFecha}>{fechaLegible(detalle.fechaHora)}</Text>
        <View style={styles.heroBadges}>
          {detalle.esClasico ? <Badge label="Clásico" tone="gold" style={styles.heroBadge} /> : null}
          {detalle.esInternacional ? (
            <Badge label="Internacional" tone="accent" style={styles.heroBadge} />
          ) : null}
        </View>
      </Hero>

      <ScrollView contentContainerStyle={styles.body}>
        {/* Goleadores */}
        <Text style={styles.titulo}>Goleadores</Text>
        {detalle.goleadores.length > 0 ? (
          detalle.goleadores.map((g: Goleador, i) => (
            <View key={`${g.jugador}-${g.minuto}-${i}`} style={styles.golFila}>
              <Text style={styles.golMinuto}>{`${g.minuto}'`}</Text>
              <Text style={styles.golJugador} numberOfLines={1}>
                {g.jugador}
              </Text>
              <Text style={styles.golEquipo} numberOfLines={1}>
                {g.equipo}
              </Text>
            </View>
          ))
        ) : (
          <Text style={styles.mutedText}>
            {detalle.estado === 'FINALIZADO'
              ? 'Sin goles en este partido.'
              : 'Los goleadores aparecerán cuando el partido termine.'}
          </Text>
        )}

        {/* Botón Detalles */}
        <PrimaryButton
          title={mostrarDetalles ? 'Ocultar detalles' : 'Detalles'}
          onPress={() => setMostrarDetalles((v) => !v)}
          style={styles.detallesBtn}
        />

        {mostrarDetalles ? (
          <View style={styles.detallesPanel}>
            {/* Formaciones junto a la lámina */}
            <View style={styles.detallesRow}>
              {/* Lámina: adjuntar la foto del partido */}
              <View style={styles.laminaCol}>
                <Text style={styles.subtitulo}>Tu lámina</Text>
                <StickerSlot
                  numero={detalle.numeroRecuadro ?? '—'}
                  imageUri={uriPrincipal}
                  label={`vs ${detalle.rival}`}
                  style={styles.lamina}
                />
                <View style={styles.laminaAcciones}>
                  <SecondaryButton
                    title="Galería"
                    tone="light"
                    onPress={() => void adjuntarFoto('galeria')}
                    disabled={ocupado}
                    style={styles.laminaBtn}
                  />
                  <SecondaryButton
                    title="Cámara"
                    tone="light"
                    onPress={() => void adjuntarFoto('camara')}
                    disabled={ocupado}
                    style={styles.laminaBtn}
                  />
                </View>
              </View>

              {/* Formaciones */}
              <View style={styles.formacionesCol}>
                <Text style={styles.subtitulo}>Formaciones</Text>
                {detalle.formaciones.length > 0 ? (
                  detalle.formaciones.map((f: FormacionEquipo) => (
                    <View key={f.equipo} style={styles.formacionEquipo}>
                      <Text style={styles.formacionNombre} numberOfLines={1}>
                        {f.equipo}
                        {f.formacion ? ` · ${f.formacion}` : ''}
                      </Text>
                      {f.titulares.map((j) => (
                        <Text key={j.id} style={styles.formacionJugador} numberOfLines={1}>
                          • {j.nombre}
                        </Text>
                      ))}
                    </View>
                  ))
                ) : (
                  <Text style={styles.mutedText}>
                    Las formaciones aparecerán cuando estén disponibles.
                  </Text>
                )}
              </View>
            </View>

            {/* Reseña */}
            <Text style={styles.subtitulo}>Tu reseña</Text>
            <TextInput
              style={styles.resenaInput}
              multiline
              editable={!ocupado}
              value={resena}
              onChangeText={setResena}
              placeholder="¿Cómo viviste el partido?"
              placeholderTextColor={palette.textMutedOnLight}
              accessibilityLabel="Reseña del partido"
            />
            <PrimaryButton
              title="Guardar reseña"
              onPress={() => void guardarResena()}
              disabled={ocupado}
              style={styles.resenaBtn}
            />
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xl },

  heroMarcador: {
    color: palette.textOnDark,
    fontFamily: fonts.display,
    fontSize: fontSize.hero,
    fontWeight: fontWeight.bold,
    marginTop: spacing.sm,
  },
  heroFecha: {
    color: palette.textMutedOnDark,
    fontFamily: fonts.body,
    fontSize: fontSize.small,
    marginTop: spacing.xs,
  },
  heroBadges: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  heroBadge: {},

  titulo: {
    color: palette.textOnLight,
    fontFamily: fonts.display,
    fontSize: fontSize.title,
    fontWeight: fontWeight.bold,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  subtitulo: {
    color: palette.textOnLight,
    fontFamily: fonts.body,
    fontSize: fontSize.subtitle,
    fontWeight: fontWeight.bold,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  mutedText: {
    color: palette.textMutedOnLight,
    fontFamily: fonts.body,
    fontSize: fontSize.small,
    lineHeight: 20,
  },
  errorText: {
    color: palette.danger,
    fontFamily: fonts.body,
    fontSize: fontSize.body,
    textAlign: 'center',
  },

  golFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: palette.borderOnLight,
  },
  golMinuto: {
    color: palette.accent,
    fontFamily: fonts.display,
    fontSize: fontSize.body,
    fontWeight: fontWeight.bold,
    width: 44,
  },
  golJugador: {
    flex: 1,
    color: palette.textOnLight,
    fontFamily: fonts.body,
    fontSize: fontSize.body,
    fontWeight: fontWeight.semibold,
  },
  golEquipo: {
    color: palette.textMutedOnLight,
    fontFamily: fonts.body,
    fontSize: fontSize.small,
    maxWidth: '35%',
  },

  detallesBtn: { marginTop: spacing.lg },
  detallesPanel: { marginTop: spacing.md, gap: spacing.sm },
  detallesRow: { flexDirection: 'row', gap: spacing.md },
  laminaCol: { flex: 1 },
  formacionesCol: { flex: 1 },
  lamina: { marginBottom: spacing.sm },
  laminaAcciones: { flexDirection: 'row', gap: spacing.sm },
  laminaBtn: { flex: 1 },

  formacionEquipo: { marginBottom: spacing.md },
  formacionNombre: {
    color: palette.textOnLight,
    fontFamily: fonts.body,
    fontSize: fontSize.small,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.xs,
  },
  formacionJugador: {
    color: palette.textMutedOnLight,
    fontFamily: fonts.body,
    fontSize: fontSize.small,
    lineHeight: 20,
  },

  resenaInput: {
    borderWidth: 1,
    borderColor: palette.borderOnLight,
    borderRadius: radius.lg,
    minHeight: 96,
    padding: spacing.md,
    color: palette.textOnLight,
    backgroundColor: palette.surface,
    fontFamily: fonts.body,
    fontSize: fontSize.body,
    textAlignVertical: 'top',
  },
  resenaBtn: { marginTop: spacing.sm },
});

export default DetallePartidoScreen;
