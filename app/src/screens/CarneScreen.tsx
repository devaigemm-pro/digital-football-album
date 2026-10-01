// CarneScreen — pantalla de aterrizaje: "carné del coleccionista".
//
// Es lo primero que ve el usuario al entrar (primera pestaña). Muestra su perfil
// con estética de LÁMINA/figurita del álbum:
//   - Foto de perfil en formato sticker numerado (StickerSlot), con la paleta
//     del club de fondo.
//   - Nombre grande (o alias/correo como respaldo).
//   - Escudo/insignia del club (Crest) y su nombre.
//   - Dato atractivo: PROGRESO REAL del álbum ("X de Y láminas · temporada Z"),
//     derivado de la lista de partidos (recuadros con Foto_Principal). Sin
//     inventar estadísticas: si no hay temporada/partidos, se guía al usuario.
//
// Componente DELGADO: no contiene lógica de negocio. Consume el `ProfilePresenter`
// (TypeScript puro, unit-testado) que ya expone el perfil (`GET /me`) y los
// partidos de la temporada (`GET /temporadas/:id/partidos`). El progreso se
// calcula aquí como pura presentación (conteo), no como regla de negocio.
//
// `.tsx` EXCLUIDO del typecheck (`app/tsconfig.json`): depende de React/RN.
// Colores EXPLÍCITOS con contraste AA (preferencia del usuario).

import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  ProfilePresenter,
  añoDeTemporada,
  type PartidosState,
  type ProfileState,
  type SyncState,
} from '../profile';
import {
  actividadReciente,
  derivarProgresoTemporada,
  estadisticasTemporada,
  etiquetaProgreso,
  etiquetaRealce,
  marcadorTexto,
  proximoPartido,
  type ProgresoTemporada,
} from '../album';
import type { PartidoLamina, ProfileClient } from '../adapters';
import { Badge, Crest, LaminaIcon, ProgressRing, Screen, StickerSlot, useAppTheme } from '../ui/kit';
import {
  fonts,
  fontSize,
  fontWeight,
  palette,
  radius,
  shadow,
  spacing,
} from '../theme/design-tokens';

export interface CarneScreenProps {
  /** Cliente de perfil/partidos (`GET /me`, `GET /temporadas/:id/partidos`). */
  readonly client: ProfileClient;
  /** Presentador de perfil compartido (recomendado inyectarlo desde el wiring). */
  readonly presenter?: ProfilePresenter;
  /** Navega a la lista de partidos (láminas) para seguir coleccionando. */
  readonly onVerPartidos?: (temporadaId: string) => void;
  /** Navega a la selección/cambio de club (si aún no tiene). */
  readonly onElegirClub?: () => void;
  /**
   * Agrega/cambia la foto de perfil del hincha (la que se monta en la lámina
   * del carné). Se dispara al tocar el "+" sobre la lámina del avatar. Debe
   * resolver cuando la subida terminó (o rechazar con el error) para que el
   * carné muestre el estado y refresque la foto.
   */
  readonly onAgregarFotoPerfil?: () => Promise<void>;
}

/** Progreso del álbum: montadas / total (recuadros con Foto_Principal). */
/** Fecha legible corta de un partido: "sáb 12 abr · 19:30" (zona local). */
function fechaPartido(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  const dia = d.toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' });
  const hora = d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  return `${dia} · ${hora}`;
}

/** Nombre visible del usuario: nombre → alias → correo → genérico. */
function nombreVisible(perfil: ProfileState['perfil']): string {
  const u = perfil?.usuario;
  if (!u) {
    return 'Sin nombre';
  }
  if (u.nombre && u.nombre.trim().length > 0) {
    return u.nombre.trim();
  }
  if (u.alias && u.alias.trim().length > 0) {
    return u.alias.trim();
  }
  // Parte local del correo (antes de la @) como identificador legible.
  if (u.email && u.email.includes('@')) {
    return u.email.split('@')[0] ?? u.email;
  }
  return u.email ?? 'Sin nombre';
}

/**
 * Pantalla de aterrizaje con el carné del coleccionista. Enlaza el
 * `ProfilePresenter` (perfil + partidos) y pinta el perfil en formato lámina con
 * el progreso real del álbum como dato destacado.
 */
export function CarneScreen({
  client,
  presenter,
  onVerPartidos,
  onElegirClub,
  onAgregarFotoPerfil,
}: CarneScreenProps): React.ReactElement {
  const theme = useAppTheme();
  const pres = useMemo(
    () => presenter ?? new ProfilePresenter(client),
    [presenter, client],
  );

  const [profile, setProfile] = useState<ProfileState>(() =>
    pres.getProfileState(),
  );
  const [partidos, setPartidos] = useState<PartidosState>(() =>
    pres.getPartidosState(),
  );
  const [sync, setSync] = useState<SyncState>(() => pres.getSyncState());
  // Estado de la subida de la foto de perfil (para dar feedback y mostrar error).
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  // Se SUSCRIBE al presentador compartido; solo dispara la carga si aún está
  // `idle`. Es clave NO re-lanzar `loadProfile` si el perfil ya está cargado (o
  // cargándose): el presentador es COMPARTIDO con el OnboardingGate, y volver a
  // ponerlo en `loading` haría que el gate ocultara esta pantalla, provocando un
  // bucle montar/desmontar (parpadeo). Solo leemos el estado y reaccionamos.
  useEffect(() => {
    const offProfile = pres.subscribeProfile(setProfile);
    const offPartidos = pres.subscribePartidos(setPartidos);
    const offSync = pres.subscribeSync(setSync);
    if (pres.getProfileState().status === 'idle') {
      void pres.loadProfile();
    }
    return () => {
      offProfile();
      offPartidos();
      offSync();
    };
  }, [pres]);

  const temporadaId = profile.perfil?.temporadaActiva?.id ?? null;
  const temporadaExterna = profile.perfil?.temporadaActiva?.temporadaExterna ?? null;

  // El indicador solo se muestra la primera vez que aún no hay partidos cargados;
  // si ya hay datos en pantalla, el refresco de fondo es del todo invisible.
  const syncEnCurso = sync.status === 'syncing' && partidos.partidos.length === 0;

  useEffect(() => {
    // Carga los partidos una sola vez por temporada (evita recargas en bucle).
    if (temporadaId && pres.getPartidosState().status === 'idle') {
      void pres.loadPartidos(temporadaId);
    }
  }, [pres, temporadaId]);

  useEffect(() => {
    // Sincronización en segundo plano: el backend refresca el fixture/resultados
    // al abrir el Carné, sin que el hincha tenga que pulsar nada. Se ejecuta una
    // sola vez por temporada y es best-effort: cualquier fallo de la API deportiva
    // se ignora aquí (no se muestra error técnico); los datos previos se conservan
    // y el job de 6h del backend reintentará. Al terminar, refresca los partidos.
    if (!temporadaId || !temporadaExterna) {
      return;
    }
    if (pres.getSyncState().status !== 'idle') {
      return;
    }
    void (async () => {
      await pres.syncTemporada(temporadaExterna);
      await pres.loadPartidos(temporadaId);
    })();
  }, [pres, temporadaId, temporadaExterna]);

  const perfil = profile.perfil;
  const club = perfil?.club ?? null;
  const temporada = perfil?.temporadaActiva ?? null;
  const nombre = nombreVisible(profile.perfil);
  const progreso: ProgresoTemporada = useMemo(
    () => derivarProgresoTemporada(partidos.partidos),
    [partidos.partidos],
  );
  const proximo = useMemo(() => proximoPartido(partidos.partidos), [partidos.partidos]);
  const recientes = useMemo(() => actividadReciente(partidos.partidos, 3), [partidos.partidos]);
  const stats = useMemo(() => estadisticasTemporada(partidos.partidos), [partidos.partidos]);
  const cargandoPerfil =
    profile.status === 'loading' || profile.status === 'idle';

  /**
   * Cambia/agrega la foto de perfil con feedback visible: marca "subiendo",
   * ejecuta la subida (galería → `POST /me/avatar` → refresco) y muestra el
   * error real si falla, en vez de tragarlo silenciosamente.
   */
  const onCambiarFoto = React.useCallback(() => {
    if (!onAgregarFotoPerfil) {
      return;
    }
    setAvatarError(null);
    setAvatarBusy(true);
    void (async () => {
      try {
        await onAgregarFotoPerfil();
      } catch (e) {
        setAvatarError(
          e instanceof Error ? e.message : 'No se pudo actualizar la foto.',
        );
      } finally {
        setAvatarBusy(false);
      }
    })();
  }, [onAgregarFotoPerfil]);

  // Temporada: solo el AÑO (el `temporadaExterna` crudo puede ser "team:33:2023").
  const etiquetaTemporada = temporada ? añoDeTemporada(temporada.temporadaExterna) : null;

  return (
    <Screen tone="dark" flush>
      <ScrollView contentContainerStyle={styles.body}>
        {/* Encabezado del carné */}
        <Text style={styles.eyebrow}>CARNÉ DEL COLECCIONISTA</Text>

        {/* Tarjeta lámina: avatar sticker + identidad */}
        <View
          style={[
            styles.card,
            { borderColor: theme.palette.accent },
          ]}
        >
          {/* Franja superior con el color del club */}
          <View style={[styles.franja, { backgroundColor: theme.palette.accent }]}>
            <Text style={styles.franjaText} numberOfLines={1}>
              {club?.nombre ?? 'Sin club'}
            </Text>
          </View>

          <View style={styles.cardRow}>
            {/* Avatar en formato lámina numerada (sticker). Tocable para
                agregar/cambiar la foto de perfil del hincha; muestra un "+"
                superpuesto como affordance (más visible si aún no hay foto). */}
            <View style={styles.stickerWrap}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: avatarBusy }}
                accessibilityLabel={
                  perfil?.usuario.avatarUrl
                    ? 'Cambiar la foto de perfil de tu lámina'
                    : 'Agregar la foto de perfil a tu lámina'
                }
                disabled={avatarBusy}
                onPress={onCambiarFoto}
              >
                <StickerSlot
                  numero={progreso.montadas > 0 ? progreso.montadas : '★'}
                  imageUri={perfil?.usuario.avatarUrl ?? null}
                  label={perfil?.usuario.alias ? `@${perfil.usuario.alias}` : 'Tú'}
                  hideNumero
                />
                <View
                  style={[styles.addFotoBadge, { backgroundColor: theme.palette.accent }]}
                  pointerEvents="none"
                >
                  {avatarBusy ? (
                    <ActivityIndicator color={palette.onAccent} size="small" />
                  ) : (
                    <Text style={styles.addFotoPlus}>+</Text>
                  )}
                </View>
              </Pressable>
            </View>

            {/* Identidad */}
            <View style={styles.identidad}>
              {/* Etiqueta fija "HINCHA" con el nombre del hincha DEBAJO. */}
              <Text style={styles.hinchaLabel}>HINCHA</Text>
              <Text style={styles.nombre} numberOfLines={2}>
                {nombre}
              </Text>
              {perfil?.usuario.alias ? (
                <Text style={styles.alias} numberOfLines={1}>
                  @{perfil.usuario.alias}
                </Text>
              ) : null}

              <View style={styles.clubLine}>
                <Crest
                  url={club?.escudoUrl}
                  monogram={(club?.nombre ?? 'CLB').slice(0, 3).toUpperCase()}
                  size={36}
                />
                <Text style={styles.clubNombre} numberOfLines={2}>
                  {club?.nombre ?? 'Elige tu club para empezar'}
                </Text>
              </View>
            </View>
          </View>

          {/* Dato atractivo: progreso REAL del álbum */}
          <View style={styles.datoBox}>
            {cargandoPerfil ? (
              <ActivityIndicator
                color={palette.textOnDark}
                accessibilityLabel="Cargando tu carné"
              />
            ) : temporada ? (
              <>
                <View style={styles.conteoRow}>
                  {/* Lámina con el número montadas DENTRO y la estrella dorada
                      superpuesta en el vértice inferior derecho (como el "+"). */}
                  <LaminaIcon glyph="star" size={44} corner numero={progreso.montadas} />
                  <Text style={styles.datoNumero}> / {progreso.total}</Text>
                </View>
                <Text style={styles.datoLabel}>
                  {etiquetaProgreso(progreso, etiquetaTemporada)}
                </Text>

                {/* Barra de progreso (decorativa; el texto ya comunica el dato). */}
                <View
                  style={styles.barra}
                  accessibilityRole="progressbar"
                  accessibilityValue={{ min: 0, max: 100, now: progreso.porcentaje }}
                >
                  <View
                    style={[
                      styles.barraFill,
                      {
                        backgroundColor: theme.palette.accent,
                        width: `${progreso.porcentaje}%`,
                      },
                    ]}
                  />
                </View>
              </>
            ) : (
              <Text style={styles.datoLabel}>
                Aún no tienes una temporada activa. Elige tu club para empezar tu
                álbum.
              </Text>
            )}
          </View>
        </View>

        {/* Error de subida de la foto de perfil (visible, no silencioso). */}
        {avatarError !== null ? (
          <Text style={styles.syncError}>{avatarError}</Text>
        ) : null}

        {/* Insignias/estado */}
        {temporada ? (
          <View style={styles.badges}>
            <Badge label={temporada.estado} tone="muted" />
            {progreso.total > 0 && progreso.montadas === progreso.total ? (
              <Badge label="¡Álbum completo!" tone="gold" style={styles.badgeSep} />
            ) : null}
          </View>
        ) : null}

        {/* Bento superior: anillo de progreso del álbum + métrica real. Igual
            que el mockup #4 (la celda de "racha" no es derivable sin local/visita,
            por eso se muestra una métrica real: partidos jugados). */}
        {temporada ? (
          <View style={styles.bento}>
            <View style={styles.bentoCell}>
              <ProgressRing
                percent={progreso.porcentaje}
                size={64}
                center={`${progreso.porcentaje}%`}
              />
              <View style={styles.bentoInfo}>
                <Text style={styles.bentoLabel}>ÁLBUM</Text>
                <Text style={styles.bentoValor}>
                  {progreso.montadas}
                  <Text style={styles.bentoValorSmall}> / {progreso.total}</Text>
                </Text>
              </View>
            </View>
            <View style={styles.bentoCell}>
              <View style={styles.bentoInfo}>
                <Text style={styles.bentoLabel}>JUGADOS</Text>
                <Text style={styles.bentoValor}>
                  {stats.jugados}
                  <Text style={styles.bentoValorSmall}> de {stats.totalPartidos}</Text>
                </Text>
                <Text style={styles.bentoSub}>{stats.programados} por jugar</Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* Próximo partido (el PROGRAMADO más cercano) con escudos. */}
        {proximo ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Ver el próximo partido contra ${proximo.rival}`}
            onPress={() => onVerPartidos?.(temporadaId ?? '')}
            style={styles.seccion}
          >
            <View style={styles.seccionHead}>
              <Text style={styles.seccionTitulo} numberOfLines={1}>
                Próximo partido · {fechaPartido(proximo.fechaHora)}
              </Text>
              {etiquetaRealce(proximo) ? (
                <Badge
                  label={etiquetaRealce(proximo) as string}
                  tone={proximo.esClasico ? 'gold' : 'accent'}
                />
              ) : null}
            </View>
            <View style={styles.proximoRow}>
              <Crest
                url={club?.escudoUrl}
                monogram={(club?.nombre ?? 'CLB').slice(0, 3).toUpperCase()}
                size={36}
              />
              <Text style={styles.proximoEquipo} numberOfLines={2}>
                {club?.nombre ?? 'Tu club'}
              </Text>
              <Text style={styles.proximoVs}>vs</Text>
              <Text style={[styles.proximoEquipo, styles.proximoEquipoDer]} numberOfLines={2}>
                {proximo.rival}
              </Text>
              <Crest monogram={proximo.rival.slice(0, 3).toUpperCase()} size={36} />
            </View>
          </Pressable>
        ) : null}

        {/* Actividad reciente (últimos partidos finalizados) con miniatura. */}
        {recientes.length > 0 ? (
          <>
            <Text style={styles.actividadTitulo}>Actividad reciente</Text>
            {recientes.map((p: PartidoLamina) => {
              const marcador = marcadorTexto(p);
              return (
                <Pressable
                  key={p.partidoId}
                  accessibilityRole="button"
                  accessibilityLabel={`Ver el partido contra ${p.rival}`}
                  onPress={() => onVerPartidos?.(temporadaId ?? '')}
                  style={styles.actividadFila}
                >
                  {/* Miniatura: si la lámina está montada, cuadro con el color del
                      club; si falta, silueta punteada (como el mockup). */}
                  {p.tieneFotoPrincipal ? (
                    <View style={[styles.actMini, { backgroundColor: theme.palette.accent }]} />
                  ) : (
                    <View style={styles.actMiniVacia} />
                  )}
                  <View style={styles.actividadInfo}>
                    {/* Línea principal: número de lámina + "vs RIVAL". El marcador
                        NO se atribuye al rival (el backend no expone si el club
                        jugó de local o visita), así que se muestra aparte y
                        neutro en la meta, sin siglas que confundan la autoría. */}
                    <Text style={styles.actividadRival} numberOfLines={1}>
                      {p.numeroRecuadro != null ? `#${p.numeroRecuadro} · ` : ''}
                      vs {p.rival}
                    </Text>
                    <Text style={styles.actividadMeta} numberOfLines={1}>
                      {p.competicion}
                      {marcador ? ` · ${marcador}` : ''}
                      {p.tieneFotoPrincipal ? ' · Lámina montada' : ' · Sin foto'}
                    </Text>
                  </View>
                  {p.tieneFotoPrincipal ? (
                    <Badge label="Lista" tone="accent" />
                  ) : (
                    <Badge label="Falta" tone="muted" />
                  )}
                </Pressable>
              );
            })}
          </>
        ) : null}

        {temporadaId ? (
          // La temporada se mantiene sola: el backend refresca el fixture y los
          // resultados en segundo plano al abrir el Carné (best-effort). No hay
          // acción manual ni se expone al hincha ningún error técnico de la API
          // deportiva; si el refresco falla, sencillamente se conservan los datos
          // ya guardados.
          <View
            accessibilityElementsHidden={!syncEnCurso}
            style={styles.syncSlot}
          >
            {syncEnCurso ? (
              <Text style={styles.syncHint} accessibilityRole="text">
                Actualizando tu temporada…
              </Text>
            ) : null}
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Elegir mi club"
            onPress={() => onElegirClub?.()}
            style={[styles.cta, { backgroundColor: theme.palette.accent }]}
          >
            <Text style={styles.ctaText}>Elegir mi club</Text>
          </Pressable>
        )}

        {/* Error no bloqueante */}
        {profile.status === 'error' && profile.error !== null ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{profile.error}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reintentar cargar tu carné"
              onPress={() => {
                void pres.loadProfile();
              }}
            >
              <Text style={styles.retry}>Reintentar</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.lg, paddingTop: spacing.xl },
  eyebrow: {
    color: palette.textMutedOnDark,
    fontFamily: fonts.body,
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
    letterSpacing: 1.5,
    marginBottom: spacing.md,
  },

  card: {
    backgroundColor: palette.inkSoft,
    borderRadius: radius.card,
    borderWidth: 2,
    overflow: 'hidden',
  },
  franja: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  franjaText: {
    color: palette.onAccent,
    fontFamily: fonts.display,
    fontSize: fontSize.subtitle,
    fontWeight: fontWeight.bold,
    letterSpacing: 1,
  },
  cardRow: {
    flexDirection: 'row',
    gap: spacing.lg,
    padding: spacing.lg,
  },
  // Lámina del avatar 1.5x más grande que antes (108 → 162).
  stickerWrap: { width: 162 },
  // Botón "+" superpuesto en la esquina de la lámina del avatar.
  addFotoBadge: {
    position: 'absolute',
    right: -6,
    bottom: -6,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: palette.inkSoft,
    ...shadow.crest,
  },
  addFotoPlus: {
    color: palette.onAccent,
    fontFamily: fonts.body,
    fontSize: 20,
    fontWeight: fontWeight.bold,
    lineHeight: 22,
  },
  identidad: { flex: 1, justifyContent: 'center' },
  hinchaLabel: {
    color: palette.textMutedOnDark,
    fontFamily: fonts.body,
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  nombre: {
    color: palette.textOnDark,
    fontFamily: fonts.display,
    fontSize: fontSize.display,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.5,
  },
  alias: {
    color: palette.textMutedOnDark,
    fontFamily: fonts.body,
    fontSize: fontSize.small,
    marginTop: 2,
  },
  clubLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  clubNombre: {
    flex: 1,
    color: palette.textOnDark,
    fontFamily: fonts.body,
    fontSize: fontSize.small,
    fontWeight: fontWeight.semibold,
  },

  conteoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  datoBox: {
    borderTopWidth: 1,
    borderTopColor: palette.borderOnDark,
    padding: spacing.lg,
    alignItems: 'flex-start',
  },
  datoNumero: {
    color: palette.textOnDark,
    fontFamily: fonts.display,
    fontSize: fontSize.hero,
    fontWeight: fontWeight.bold,
  },
  datoDe: {
    color: palette.textMutedOnDark,
    fontFamily: fonts.display,
    fontSize: fontSize.title,
    fontWeight: fontWeight.bold,
  },
  datoLabel: {
    color: palette.textMutedOnDark,
    fontFamily: fonts.body,
    fontSize: fontSize.small,
    marginTop: spacing.xs,
    lineHeight: 20,
  },
  barra: {
    marginTop: spacing.md,
    height: 8,
    width: '100%',
    borderRadius: radius.pill,
    backgroundColor: '#FFFFFF22',
    overflow: 'hidden',
  },
  barraFill: { height: '100%', borderRadius: radius.pill },

  badges: { flexDirection: 'row', marginTop: spacing.md },
  badgeSep: { marginLeft: spacing.sm },

  // --- Bento superior (anillo de progreso + métrica) ---
  bento: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  bentoCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: palette.glassFill,
    borderWidth: 1,
    borderColor: palette.borderOnDark,
    borderRadius: radius.lg,
    padding: spacing.md,
    minHeight: 96,
  },
  bentoInfo: { flex: 1, minWidth: 0 },
  bentoLabel: {
    color: palette.textMutedOnDark,
    fontFamily: fonts.body,
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
    letterSpacing: 1,
  },
  bentoValor: {
    color: palette.textOnDark,
    fontFamily: fonts.display,
    fontSize: fontSize.title,
    fontWeight: fontWeight.bold,
    marginTop: 2,
  },
  bentoValorSmall: {
    color: palette.textMutedOnDark,
    fontFamily: fonts.body,
    fontSize: fontSize.small,
  },
  bentoSub: {
    color: palette.textMutedOnDark,
    fontFamily: fonts.body,
    fontSize: fontSize.caption,
    marginTop: 2,
  },

  // --- Próximo partido ---
  seccion: {
    backgroundColor: palette.glassFill,
    borderWidth: 1,
    borderColor: palette.borderOnDark,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  seccionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  seccionTitulo: {
    flex: 1,
    color: palette.textMutedOnDark,
    fontFamily: fonts.body,
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  proximoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  proximoEquipo: {
    flex: 1,
    color: palette.textOnDark,
    fontFamily: fonts.body,
    fontSize: fontSize.small,
    fontWeight: fontWeight.bold,
  },
  proximoEquipoDer: { textAlign: 'right' },
  proximoVs: {
    color: palette.textMutedOnDark,
    fontFamily: fonts.body,
    fontSize: fontSize.small,
  },

  // --- Actividad reciente ---
  actividadTitulo: {
    color: palette.textMutedOnDark,
    fontFamily: fonts.body,
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  actividadFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: palette.glassFill,
    borderWidth: 1,
    borderColor: palette.borderOnDark,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  actMini: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
  },
  actMiniVacia: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: palette.textMutedOnDark,
    backgroundColor: '#FFFFFF08',
  },
  actividadInfo: { flex: 1, minWidth: 0 },
  actividadRival: {
    color: palette.textOnDark,
    fontFamily: fonts.body,
    fontSize: fontSize.small,
    fontWeight: fontWeight.bold,
  },
  actividadMeta: {
    color: palette.textMutedOnDark,
    fontFamily: fonts.body,
    fontSize: fontSize.small,
    marginTop: 2,
  },

  cta: {
    marginTop: spacing.lg,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    color: palette.onAccent,
    fontFamily: fonts.body,
    fontSize: fontSize.body,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.3,
  },
  // Ranura del indicador de sincronización de fondo. Reserva un mínimo de altura
  // solo mientras hay refresco visible para que el layout no salte al aparecer.
  syncSlot: {
    marginTop: spacing.md,
    minHeight: spacing.md,
    justifyContent: 'center',
  },
  syncHint: {
    color: palette.textMutedOnDark,
    fontFamily: fonts.body,
    fontSize: fontSize.caption,
    textAlign: 'center',
  },
  syncError: {
    color: palette.danger,
    fontFamily: fonts.body,
    fontSize: fontSize.caption,
    textAlign: 'center',
    marginTop: spacing.sm,
  },

  errorBox: { marginTop: spacing.lg },
  errorText: { color: palette.danger, fontFamily: fonts.body, marginBottom: spacing.xs },
  retry: { color: palette.info, fontFamily: fonts.body, fontWeight: fontWeight.semibold },
});

export default CarneScreen;
