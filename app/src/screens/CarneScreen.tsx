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
  derivarProgresoTemporada,
  etiquetaProgreso,
  type ProgresoTemporada,
} from '../album';
import type { ProfileClient } from '../adapters';
import { Badge, Crest, LaminaIcon, Screen, StickerSlot, useAppTheme } from '../ui/kit';
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

  /**
   * Re-sincroniza la temporada activa desde la API deportiva (`POST /me/temporada`
   * con la `temporadaExterna` ya existente). Sirve para refrescar los datos de
   * los partidos (resultado, escudo del rival, etc.) sin rehacer el onboarding.
   * Al terminar, recarga los partidos para reflejar los cambios en el carné.
   */
  const onActualizarTemporada = React.useCallback(() => {
    const externa = profile.perfil?.temporadaActiva?.temporadaExterna;
    const tId = profile.perfil?.temporadaActiva?.id ?? null;
    if (!externa) {
      return;
    }
    void (async () => {
      await pres.syncTemporada(externa);
      if (tId) {
        await pres.loadPartidos(tId);
      }
    })();
  }, [pres, profile.perfil?.temporadaActiva?.temporadaExterna, profile.perfil?.temporadaActiva?.id]);
  useEffect(() => {
    // Carga los partidos una sola vez por temporada (evita recargas en bucle).
    if (temporadaId && pres.getPartidosState().status === 'idle') {
      void pres.loadPartidos(temporadaId);
    }
  }, [pres, temporadaId]);

  const perfil = profile.perfil;
  const club = perfil?.club ?? null;
  const temporada = perfil?.temporadaActiva ?? null;
  const nombre = nombreVisible(profile.perfil);
  const progreso: ProgresoTemporada = useMemo(
    () => derivarProgresoTemporada(partidos.partidos),
    [partidos.partidos],
  );
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
                  {/* Ícono de lámina con la estrella en el vértice inferior derecho. */}
                  <LaminaIcon glyph="star" size={34} corner />
                  <Text style={styles.datoNumero}>
                    {progreso.montadas}
                    <Text style={styles.datoDe}> / {progreso.total}</Text>
                  </Text>
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

        {/* Acción principal: cada lámina es un partido; para agregar la foto a
            una lámina se elige el partido y se sube ahí su Foto_Principal. */}
        {temporadaId ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Agregar la foto a una lámina de mi álbum"
              onPress={() => onVerPartidos?.(temporadaId)}
              style={[styles.cta, { backgroundColor: theme.palette.accent }]}
            >
              <Text style={styles.ctaText}>Agregar foto a mi lámina</Text>
            </Pressable>
            <Text style={styles.ctaHint}>
              Elige un partido para montar su foto en la lámina.
            </Text>
            {/* Re-sincroniza los datos de la temporada (resultados, escudos). */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Actualizar los datos de mi temporada"
              disabled={sync.status === 'syncing'}
              onPress={onActualizarTemporada}
              style={[styles.cta, styles.ctaSecundario]}
            >
              <Text style={styles.ctaSecundarioText}>
                {sync.status === 'syncing' ? 'Actualizando…' : 'Actualizar temporada'}
              </Text>
            </Pressable>
            {sync.status === 'error' && sync.error !== null ? (
              <Text style={styles.syncError}>{sync.error}</Text>
            ) : null}
            {sync.status === 'done' ? (
              <Text style={styles.ctaHint}>Temporada actualizada.</Text>
            ) : null}
          </>
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
  ctaHint: {
    color: palette.textMutedOnDark,
    fontFamily: fonts.body,
    fontSize: fontSize.caption,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  ctaSecundario: {
    marginTop: spacing.md,
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: palette.borderOnDark,
  },
  ctaSecundarioText: {
    color: palette.textOnDark,
    fontFamily: fonts.body,
    fontSize: fontSize.body,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.3,
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
