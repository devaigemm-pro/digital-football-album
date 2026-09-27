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
  type PartidosState,
  type ProfileState,
} from '../profile';
import type { ProfileClient } from '../adapters';
import { Badge, Crest, Screen, StickerSlot, useAppTheme } from '../ui/kit';
import {
  fonts,
  fontSize,
  fontWeight,
  palette,
  radius,
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
}

/** Progreso del álbum: montadas / total (recuadros con Foto_Principal). */
interface Progreso {
  readonly montadas: number;
  readonly total: number;
}

/** Deriva el progreso de la lista de partidos: cuántas láminas tienen foto. */
function derivarProgreso(partidos: PartidosState['partidos']): Progreso {
  let montadas = 0;
  for (const p of partidos) {
    if (p.tieneFotoPrincipal) {
      montadas += 1;
    }
  }
  return { montadas, total: partidos.length };
}

/** Nombre visible del usuario: nombre → alias → correo → genérico. */
function nombreVisible(perfil: ProfileState['perfil']): string {
  const u = perfil?.usuario;
  if (!u) {
    return 'Hincha';
  }
  return u.nombre ?? u.alias ?? u.email ?? 'Hincha';
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

  // Se SUSCRIBE al presentador compartido; solo dispara la carga si aún está
  // `idle`. Es clave NO re-lanzar `loadProfile` si el perfil ya está cargado (o
  // cargándose): el presentador es COMPARTIDO con el OnboardingGate, y volver a
  // ponerlo en `loading` haría que el gate ocultara esta pantalla, provocando un
  // bucle montar/desmontar (parpadeo). Solo leemos el estado y reaccionamos.
  useEffect(() => {
    const offProfile = pres.subscribeProfile(setProfile);
    const offPartidos = pres.subscribePartidos(setPartidos);
    if (pres.getProfileState().status === 'idle') {
      void pres.loadProfile();
    }
    return () => {
      offProfile();
      offPartidos();
    };
  }, [pres]);

  const temporadaId = profile.perfil?.temporadaActiva?.id ?? null;
  useEffect(() => {
    // Carga los partidos una sola vez por temporada (evita recargas en bucle).
    if (temporadaId && pres.getPartidosState().status === 'idle') {
      void pres.loadPartidos(temporadaId);
    }
  }, [pres, temporadaId]);

  const perfil = profile.perfil;
  const club = perfil?.club ?? null;
  const temporada = perfil?.temporadaActiva ?? null;
  const nombre = nombreVisible(profile);
  const progreso = useMemo(
    () => derivarProgreso(partidos.partidos),
    [partidos.partidos],
  );
  const cargandoPerfil =
    profile.status === 'loading' || profile.status === 'idle';

  // Temporada legible (nombre "externo" tal cual lo persiste el backend).
  const etiquetaTemporada = temporada ? temporada.temporadaExterna : null;

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
            {/* Avatar en formato lámina numerada (sticker) */}
            <View style={styles.stickerWrap}>
              <StickerSlot
                numero={progreso.montadas > 0 ? progreso.montadas : '★'}
                imageUri={perfil?.usuario.avatarUrl ?? null}
                label={perfil?.usuario.alias ? `@${perfil.usuario.alias}` : 'Tú'}
              />
            </View>

            {/* Identidad */}
            <View style={styles.identidad}>
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
                <Text style={styles.datoNumero}>
                  {progreso.montadas}
                  <Text style={styles.datoDe}> / {progreso.total}</Text>
                </Text>
                <Text style={styles.datoLabel}>
                  láminas montadas{etiquetaTemporada ? ` · temporada ${etiquetaTemporada}` : ''}
                </Text>

                {/* Barra de progreso (decorativa; el texto ya comunica el dato). */}
                <View style={styles.barra} accessibilityRole="progressbar">
                  <View
                    style={[
                      styles.barraFill,
                      {
                        backgroundColor: theme.palette.accent,
                        width: `${
                          progreso.total > 0
                            ? Math.round((progreso.montadas / progreso.total) * 100)
                            : 0
                        }%`,
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

        {/* Insignias/estado */}
        {temporada ? (
          <View style={styles.badges}>
            <Badge label={temporada.estado} tone="muted" />
            {progreso.total > 0 && progreso.montadas === progreso.total ? (
              <Badge label="¡Álbum completo!" tone="gold" style={styles.badgeSep} />
            ) : null}
          </View>
        ) : null}

        {/* Acción principal */}
        {temporadaId ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ver mis partidos y seguir coleccionando"
            onPress={() => onVerPartidos?.(temporadaId)}
            style={[styles.cta, { backgroundColor: theme.palette.accent }]}
          >
            <Text style={styles.ctaText}>Seguir coleccionando</Text>
          </Pressable>
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
  stickerWrap: { width: 108 },
  identidad: { flex: 1, justifyContent: 'center' },
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

  errorBox: { marginTop: spacing.lg },
  errorText: { color: palette.danger, fontFamily: fonts.body, marginBottom: spacing.xs },
  retry: { color: palette.info, fontFamily: fonts.body, fontWeight: fontWeight.semibold },
});

export default CarneScreen;
