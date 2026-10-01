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
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { CapturePresenter, MomentoBusinessError, MomentoDetailPresenter } from '../capture';
import type { CapturePhotoInput } from '../capture';
import { encodeBase64 } from '../adapters';
import type { CaptureNativeBridge } from './CapturaScreen';
import type {
  FormacionEquipo,
  Goleador,
  PartidoDetalle,
  ProfileClient,
} from '../adapters';
import { Badge, Hero, PrimaryButton, Scoreboard, Screen, SecondaryButton, StickerSlot } from '../ui/kit';
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
  /**
   * Se invoca tras guardar la lámina con éxito (foto + reseña). El contenedor lo
   * usa para refrescar el álbum/contador y navegar a la lista de partidos.
   */
  readonly onGuardado?: () => void;
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

/**
 * Texto del marcador para el `Scoreboard`, o `null` si no hay marcador que
 * mostrar (entonces el Scoreboard pinta "VS").
 *   - Con `resultado`: "2 - 1".
 *   - FINALIZADO sin resultado (la API deportiva aún no lo trae): "– / –".
 *   - PROGRAMADO / EN_CURSO sin resultado: null → "VS".
 */
function marcador(p: PartidoDetalle): string | null {
  if (p.resultado) {
    return `${p.resultado.golesLocal} - ${p.resultado.golesVisita}`;
  }
  return p.estado === 'FINALIZADO' ? '– / –' : null;
}

/**
 * Abreviatura corta y legible del nombre de un equipo para la lista de
 * goleadores (donde el espacio es escaso). Reglas:
 *   - Quita prefijos comunes ("Club", "Deportes", "CD", "CSD").
 *   - Si tras limpiar hay varias palabras significativas, usa sus iniciales
 *     (p. ej. "Universidad de Chile" → "UDC", "Unión Española" → "UE").
 *   - Si es una sola palabra, usa sus primeras 3 letras en mayúscula
 *     (p. ej. "Cobresal" → "COB", "Palestino" → "PAL").
 * Devuelve el nombre original si no se puede abreviar con sentido.
 */
function abreviarEquipo(nombre: string): string {
  const limpio = nombre.trim();
  if (limpio.length === 0) {
    return nombre;
  }
  // Palabras "de relleno" que no aportan a la sigla.
  const relleno = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'fc', 'cd', 'cf', 'club', 'csd', 'sd']);
  const palabras = limpio
    .split(/\s+/)
    .filter((p) => !relleno.has(p.toLowerCase()));
  if (palabras.length === 0) {
    return limpio.slice(0, 3).toUpperCase();
  }
  if (palabras.length === 1) {
    return palabras[0]!.slice(0, 3).toUpperCase();
  }
  // Iniciales de hasta 4 palabras significativas.
  return palabras
    .slice(0, 4)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');
}

/**
 * URI renderizable de la Foto_Principal montada en la lámina, o null si vacía.
 * Prefiere la `url` firmada (renderizable por `<Image>`); el `objectKey` es una
 * clave interna del storage que NO se puede mostrar directamente.
 */
function fotoPrincipalUri(p: PartidoDetalle): string | null {
  if (p.fotoPrincipalId == null) {
    return null;
  }
  const foto = p.fotos.find((f) => f.id === p.fotoPrincipalId);
  return foto?.url ?? null;
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
  onGuardado,
}: DetallePartidoScreenProps): React.ReactElement {
  const [detalle, setDetalle] = useState<PartidoDetalle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [resena, setResena] = useState('');
  // Foto elegida PENDIENTE de guardar (no se sube hasta pulsar "Guardar lámina").
  // Guarda la selección del bridge nativo + su fuente, y una data-URI para la
  // vista previa. `null` = no hay foto nueva pendiente.
  const [fotoPendiente, setFotoPendiente] = useState<{
    readonly seleccion: Omit<CapturePhotoInput, 'partidoId' | 'fuente'>;
    readonly fuente: 'galeria' | 'camara';
    readonly previewUri: string;
  } | null>(null);
  // Escudo del club PROPIO (equipo local del marcador). Viene de `GET /me`.
  const [escudoPropio, setEscudoPropio] = useState<string | null>(null);
  // Monograma del club propio como respaldo si aún no hay escudo.
  const [monogramaPropio, setMonogramaPropio] = useState<string>('FC');
  // Formaciones desplegables: conjunto de equipos cuya alineación está abierta.
  const [formacionesAbiertas, setFormacionesAbiertas] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const toggleFormacion = useCallback((equipo: string) => {
    setFormacionesAbiertas((prev) => {
      const next = new Set(prev);
      if (next.has(equipo)) {
        next.delete(equipo);
      } else {
        next.add(equipo);
      }
      return next;
    });
  }, []);

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

  // Carga el escudo/monograma del club propio (una vez) para el marcador.
  useEffect(() => {
    let cancelado = false;
    void client
      .getPerfil()
      .then((perfil) => {
        if (cancelado) {
          return;
        }
        setEscudoPropio(perfil.club?.escudoUrl ?? null);
        if (perfil.club?.nombre) {
          setMonogramaPropio(perfil.club.nombre.slice(0, 3).toUpperCase());
        }
      })
      .catch(() => {
        // No bloquea el detalle: sin escudo se cae al monograma por defecto.
      });
    return () => {
      cancelado = true;
    };
  }, [client]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  const uriPrincipal = useMemo(
    () => (detalle ? fotoPrincipalUri(detalle) : null),
    [detalle],
  );
  // La lámina muestra la foto PENDIENTE (preview) si hay una elegida; si no, la
  // Foto_Principal ya montada.
  const uriLamina = fotoPendiente?.previewUri ?? uriPrincipal;

  /** Refleja el mensaje de negocio del backend (o un error genérico). */
  const mostrarErrorNegocio = useCallback((titulo: string, e: unknown) => {
    if (e instanceof MomentoBusinessError) {
      Alert.alert(titulo, e.message);
    } else {
      Alert.alert(titulo, String(e));
    }
  }, []);

  /**
   * Elige una foto (galería o cámara) y la deja PENDIENTE para la vista previa,
   * SIN subirla aún. La subida ocurre al pulsar "Guardar lámina". Así la foto y
   * la reseña se almacenan juntas en un solo gesto.
   */
  const elegirFoto = useCallback(
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
      try {
        const seleccion =
          fuente === 'galeria'
            ? await native.pickFromGallery()
            : await native.takePhoto();
        if (!seleccion) {
          return; // el usuario canceló el picker.
        }
        // data-URI para previsualizar la foto elegida sin subirla todavía.
        const previewUri = `data:image/jpeg;base64,${encodeBase64(seleccion.binario)}`;
        setFotoPendiente({ seleccion, fuente, previewUri });
      } catch (e) {
        mostrarErrorNegocio('No se pudo elegir la foto', e);
      }
    },
    [detalle, native, mostrarErrorNegocio],
  );

  /**
   * Guarda la LÁMINA en un solo gesto (Req 4.1, 5.1, 5.5, 7.1):
   *   1. si hay foto pendiente nueva, la sube al Momento del partido (asegura
   *      permiso) y la fija como Foto_Principal del recuadro;
   *   2. guarda la reseña como `notas` del Momento.
   * El backend valida la biunivocidad y la ventana de edición. Requiere o bien
   * una foto nueva pendiente, o una lámina ya montada (momentoId) para la reseña.
   */
  const guardarLamina = useCallback(async () => {
    if (!detalle) {
      return;
    }
    const hayFotoNueva = fotoPendiente !== null;
    const hayMomento = detalle.momentoId != null;
    if (!hayFotoNueva && !hayMomento) {
      Alert.alert(
        'Agrega una foto',
        'Elige la foto de tu lámina para guardarla junto a tu reseña.',
      );
      return;
    }
    setOcupado(true);
    try {
      // 1) Foto nueva: subir + fijar como Foto_Principal del recuadro.
      let momentoId = detalle.momentoId;
      if (hayFotoNueva && detalle.recuadroId != null) {
        const foto = await capturePresenter.capturePhoto({
          ...fotoPendiente.seleccion,
          fuente: fotoPendiente.fuente,
          partidoId,
        });
        await momentoPresenter.setFotoPrincipal(detalle.recuadroId, foto.id);
        // La subida crea el Momento si no existía; si aún no lo teníamos, se
        // resolverá al recargar (el PATCH de reseña se hace tras recargar).
        if (momentoId == null) {
          const refrescado = await client.getPartido(partidoId);
          momentoId = refrescado.momentoId;
        }
      }
      // 2) Reseña como `notas` del Momento (si ya hay Momento).
      if (momentoId != null) {
        await momentoPresenter.updateContexto(momentoId, { notas: resena });
      }
      setFotoPendiente(null);
      await recargar();
      // Notifica al contenedor para refrescar álbum/contador y navegar a la
      // lista de partidos. Si no hay callback, al menos avisa en el sitio.
      if (onGuardado) {
        onGuardado();
      } else {
        Alert.alert('Lámina guardada', 'Se guardó tu foto y tu reseña del partido.');
      }
    } catch (e) {
      mostrarErrorNegocio('No se pudo guardar la lámina', e);
    } finally {
      setOcupado(false);
    }
  }, [
    detalle,
    fotoPendiente,
    capturePresenter,
    partidoId,
    momentoPresenter,
    client,
    resena,
    recargar,
    mostrarErrorNegocio,
    onGuardado,
  ]);

  if (cargando && !detalle) {
    return (
      <Screen tone="dark" style={styles.centered}>
        <ActivityIndicator
          color={palette.accent}
          accessibilityLabel="Cargando el detalle del partido"
        />
      </Screen>
    );
  }

  if (error && !detalle) {
    return (
      <Screen tone="dark" style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
        <SecondaryButton title="Reintentar" tone="dark" onPress={() => void recargar()} />
      </Screen>
    );
  }

  if (!detalle) {
    return (
      <Screen tone="dark" style={styles.centered}>
        <Text style={styles.mutedText}>Partido no encontrado.</Text>
      </Screen>
    );
  }

  return (
    <Screen tone="dark" flush>
      <Hero eyebrow={detalle.competicion} title={`vs ${detalle.rival}`} adaptiveTitle>
        {/* Marcador tipo transmisión: resultado gigante flanqueado por escudos. */}
        <Scoreboard
          homeMonogram={monogramaPropio}
          homeCrestUrl={escudoPropio}
          awayMonogram={detalle.rival.slice(0, 3).toUpperCase()}
          awayCrestUrl={detalle.escudoRivalUrl ?? null}
          score={marcador(detalle)}
          status={detalle.estado === 'FINALIZADO' ? 'FINAL' : fechaLegible(detalle.fechaHora)}
          live={detalle.estado === 'EN_CURSO'}
          style={styles.heroScore}
        />
        {/* Estadio donde se jugó, bajo el marcador. */}
        {detalle.estadio ? (
          <Text style={styles.heroEstadio} numberOfLines={1}>
            📍 {detalle.estadio}
          </Text>
        ) : null}
        <View style={styles.heroBadges}>
          {detalle.esClasico ? <Badge label="Clásico" tone="gold" style={styles.heroBadge} /> : null}
          {detalle.esInternacional ? (
            <Badge label="Internacional" tone="accent" style={styles.heroBadge} />
          ) : null}
        </View>
      </Hero>

      <ScrollView contentContainerStyle={styles.body}>
        {/* LÁMINA DEL HINCHA (arriba): cada recuadro es ESTE partido (Req 4.1).
            La foto principal es la que se monta e imprime. Adjuntar foto sube
            al Momento del partido y la fija como Foto_Principal del recuadro;
            el backend valida biunivocidad y ventana de edición. */}
        <View style={styles.laminaHero}>
          <Text style={styles.subtitulo}>Tu lámina</Text>
          <StickerSlot
            numero={detalle.numeroRecuadro ?? '—'}
            imageUri={uriLamina}
            label={`vs ${detalle.rival}`}
            style={styles.lamina}
          />
          <View style={styles.laminaAcciones}>
            <SecondaryButton
              title={uriLamina ? 'Cambiar foto' : 'Añadir de galería'}
              tone="dark"
              onPress={() => void elegirFoto('galeria')}
              disabled={ocupado}
              style={styles.laminaBtn}
            />
            <SecondaryButton
              title="Cámara"
              tone="dark"
              onPress={() => void elegirFoto('camara')}
              disabled={ocupado}
              style={styles.laminaBtn}
            />
          </View>
          {fotoPendiente ? (
            <Text style={styles.laminaHint}>
              Foto lista. Pulsa “Guardar lámina” para montarla con tu reseña.
            </Text>
          ) : null}
        </View>

        {/* INFORMACIÓN DEL ENCUENTRO (abajo): resultado, goleadores,
            formaciones y tu reseña. Siempre visible (sin toggle). */}
        <Text style={styles.titulo}>Goleadores</Text>
        {detalle.goleadores.length > 0 ? (
          detalle.goleadores.map((g: Goleador, i) => (
            <View key={`${g.jugador}-${g.minuto}-${i}`} style={styles.golFila}>
              <Text style={styles.golMinuto}>{`${g.minuto}'`}</Text>
              <Text style={styles.golJugador} numberOfLines={1}>
                {g.jugador}
              </Text>
              {/* Equipo del goleador, abreviado, como píldora (a qué equipo
                  corresponde cada jugador). El nombre completo queda en
                  accessibilityLabel para lectores de pantalla. */}
              <View style={styles.golEquipoPill} accessibilityLabel={`Equipo: ${g.equipo}`}>
                <Text style={styles.golEquipoText} numberOfLines={1}>
                  {abreviarEquipo(g.equipo)}
                </Text>
              </View>
            </View>
          ))
        ) : (
          <Text style={styles.mutedText}>
            {detalle.estado === 'FINALIZADO'
              ? 'Sin goles en este partido.'
              : 'Los goleadores aparecerán cuando el partido termine.'}
          </Text>
        )}

        {/* Formaciones (desplegables): toca el equipo para ver/ocultar su once. */}
        <Text style={styles.titulo}>Formaciones</Text>
        {detalle.formaciones.length > 0 ? (
          detalle.formaciones.map((f: FormacionEquipo) => {
            const abierta = formacionesAbiertas.has(f.equipo);
            return (
              <View key={f.equipo} style={styles.formacionEquipo}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: abierta }}
                  accessibilityLabel={`${abierta ? 'Ocultar' : 'Ver'} la formación de ${f.equipo}`}
                  onPress={() => toggleFormacion(f.equipo)}
                  style={styles.formacionHeader}
                >
                  <Text style={styles.formacionNombre} numberOfLines={1}>
                    {f.equipo}
                    {f.formacion ? ` · ${f.formacion}` : ''}
                  </Text>
                  <Text style={styles.formacionChevron}>{abierta ? '▾' : '▸'}</Text>
                </Pressable>
                {abierta
                  ? f.titulares.map((j) => (
                      <Text key={j.id} style={styles.formacionJugador} numberOfLines={1}>
                        • {j.nombre}
                      </Text>
                    ))
                  : null}
              </View>
            );
          })
        ) : (
          <Text style={styles.mutedText}>
            Las formaciones aparecerán cuando estén disponibles.
          </Text>
        )}

        {/* Reseña */}
        <Text style={styles.titulo}>Tu reseña</Text>
        <TextInput
          style={styles.resenaInput}
          multiline
          editable={!ocupado}
          value={resena}
          onChangeText={setResena}
          placeholder="¿Cómo viviste el partido?"
          placeholderTextColor={palette.textMutedOnDark}
          accessibilityLabel="Reseña del partido"
        />
        <PrimaryButton
          title={ocupado ? 'Guardando…' : 'Guardar lámina'}
          onPress={() => void guardarLamina()}
          disabled={ocupado}
          style={styles.resenaBtn}
        />
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
  heroScore: { marginTop: spacing.sm },
  heroEstadio: {
    color: palette.textMutedOnDark,
    fontFamily: fonts.body,
    fontSize: fontSize.small,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  heroBadges: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, alignSelf: 'center' },
  heroBadge: {},

  titulo: {
    color: palette.textOnDark,
    fontFamily: fonts.display,
    fontSize: fontSize.title,
    fontWeight: fontWeight.bold,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  subtitulo: {
    color: palette.textOnDark,
    fontFamily: fonts.body,
    fontSize: fontSize.subtitle,
    fontWeight: fontWeight.bold,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  mutedText: {
    color: palette.textMutedOnDark,
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
    borderBottomColor: palette.borderOnDark,
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
    color: palette.textOnDark,
    fontFamily: fonts.body,
    fontSize: fontSize.body,
    fontWeight: fontWeight.semibold,
  },
  golEquipoPill: {
    backgroundColor: palette.glassFill,
    borderWidth: 1,
    borderColor: palette.glassBorder,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  golEquipoText: {
    color: palette.textOnDark,
    fontFamily: fonts.body,
    fontSize: fontSize.caption,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.5,
  },

  // Lámina del hincha destacada arriba del detalle del encuentro.
  laminaHero: {
    alignItems: 'center',
    backgroundColor: palette.glassFill,
    borderWidth: 1,
    borderColor: palette.glassBorder,
    borderRadius: radius.glass,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  lamina: { width: 168, marginTop: spacing.sm, marginBottom: spacing.md },
  laminaAcciones: { flexDirection: 'row', gap: spacing.sm, alignSelf: 'stretch' },
  laminaBtn: { flex: 1 },
  laminaHint: {
    color: palette.textMutedOnDark,
    fontFamily: fonts.body,
    fontSize: fontSize.small,
    textAlign: 'center',
    marginTop: spacing.sm,
  },

  formacionEquipo: {
    marginBottom: spacing.sm,
    backgroundColor: palette.glassFill,
    borderWidth: 1,
    borderColor: palette.glassBorder,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  formacionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  formacionChevron: {
    color: palette.textMutedOnDark,
    fontFamily: fonts.body,
    fontSize: fontSize.body,
    marginLeft: spacing.sm,
  },
  formacionNombre: {
    color: palette.textOnDark,
    fontFamily: fonts.body,
    fontSize: fontSize.small,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.xs,
  },
  formacionJugador: {
    color: palette.textMutedOnDark,
    fontFamily: fonts.body,
    fontSize: fontSize.small,
    lineHeight: 20,
  },

  resenaInput: {
    borderWidth: 1,
    borderColor: palette.borderOnDark,
    borderRadius: radius.lg,
    minHeight: 96,
    padding: spacing.md,
    color: palette.textOnDark,
    backgroundColor: palette.glassFill,
    fontFamily: fonts.body,
    fontSize: fontSize.body,
    textAlignVertical: 'top',
  },
  resenaBtn: { marginTop: spacing.sm },
});

export default DetallePartidoScreen;
