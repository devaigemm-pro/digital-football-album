// PerfilScreen — perfil del usuario (club actual, temporada activa, datos).
//
// Consume `GET /me` a través del `ProfilePresenter` (TypeScript puro,
// unit-testado). Es una pantalla DELGADA: no contiene lógica sensible; solo
// enlaza el presentador a React y pinta el estado con el kit de UI del mockup.
//
// IMPORTANTE (entorno actual): las dependencias de React / React Native NO están
// instaladas; este `.tsx` está EXCLUIDO del typecheck de `app/tsconfig.json`. Es
// código real para cuando se instale el toolchain del cliente.

import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ProfilePresenter, type ProfileState } from '../profile';
import type { ProfileClient } from '../adapters';
import { Crest, Hero, SecondaryButton, Screen } from '../ui/kit';
import { fonts, fontSize, fontWeight, palette, radius, spacing } from '../theme/design-tokens';

export interface PerfilScreenProps {
  /** Cliente de perfil (`GET /me`). */
  readonly client: ProfileClient;
  /** Presentador ya construido (opcional, útil en tests/Storybook). */
  readonly presenter?: ProfilePresenter;
  /** Navega a Ajustes (privacidad, cerrar sesión, borrar cuenta). */
  readonly onAjustes?: () => void;
  /** Navega a la selección/cambio de club. */
  readonly onCambiarClub?: () => void;
}

/** Fila etiqueta/valor del perfil. */
function Fila({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <View style={styles.fila}>
      <Text style={styles.filaLabel}>{label}</Text>
      <Text style={styles.filaValue}>{value}</Text>
    </View>
  );
}

/**
 * Pantalla de perfil. Carga `GET /me` al montar (no bloqueante) y muestra el
 * club, la temporada activa y los datos del usuario.
 */
export function PerfilScreen({
  client,
  presenter,
  onAjustes,
  onCambiarClub,
}: PerfilScreenProps): React.ReactElement {
  const pres = useMemo(() => presenter ?? new ProfilePresenter(client), [presenter, client]);
  const [state, setState] = useState<ProfileState>(() => pres.getProfileState());

  useEffect(() => {
    const unsubscribe = pres.subscribeProfile(setState);
    void pres.loadProfile();
    return unsubscribe;
  }, [pres]);

  const perfil = state.perfil;
  const club = perfil?.club ?? null;
  const temporada = perfil?.temporadaActiva ?? null;

  return (
    <Screen tone="light" flush>
      <Hero eyebrow="Perfil" title={club?.nombre ?? 'Tu perfil'}>
        {state.status === 'loading' ? (
          <ActivityIndicator
            color={palette.textOnDark}
            accessibilityLabel="Cargando perfil"
            style={styles.heroSpinner}
          />
        ) : null}
      </Hero>

      <ScrollView contentContainerStyle={styles.body}>
        {/* Club actual */}
        <View style={styles.clubRow}>
          <Crest
            url={club?.escudoUrl}
            monogram={(club?.nombre ?? 'CLB').slice(0, 3).toUpperCase()}
            size={56}
          />
          <View style={styles.clubInfo}>
            <Text style={styles.clubNombre}>{club?.nombre ?? 'Sin club seleccionado'}</Text>
            <Text style={styles.clubSub}>
              {perfil?.usuario.email ?? '—'}
            </Text>
          </View>
        </View>

        {/* Datos del usuario y temporada */}
        <View style={styles.card}>
          <Fila label="Correo" value={perfil?.usuario.email ?? '—'} />
          <Fila label="Zona horaria" value={perfil?.usuario.zonaHoraria ?? '—'} />
          <Fila
            label="Temporada"
            value={temporada ? `${temporada.temporadaExterna} · ${temporada.estado}` : 'Sin temporada activa'}
          />
        </View>

        {/* Error no bloqueante con reintento */}
        {state.status === 'error' && state.error !== null ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{state.error}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reintentar cargar el perfil"
              onPress={() => {
                void pres.loadProfile();
              }}
            >
              <Text style={styles.retry}>Reintentar</Text>
            </Pressable>
          </View>
        ) : null}

        <SecondaryButton
          title="Cambiar de club"
          tone="light"
          onPress={onCambiarClub}
          style={styles.accion}
        />
        <SecondaryButton
          title="Ajustes y privacidad"
          tone="light"
          onPress={onAjustes}
          style={styles.accion}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroSpinner: { alignSelf: 'flex-start', marginTop: spacing.sm },
  body: { padding: spacing.lg },
  clubRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  clubInfo: { flex: 1 },
  clubNombre: {
    color: palette.textOnLight,
    fontFamily: fonts.display,
    fontSize: fontSize.title,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.5,
  },
  clubSub: { color: palette.textMutedOnLight, fontFamily: fonts.body, fontSize: fontSize.small, marginTop: 2 },
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.borderOnLight,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  fila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: palette.borderOnLight,
  },
  filaLabel: { color: palette.textMutedOnLight, fontFamily: fonts.body, fontSize: fontSize.small },
  filaValue: { color: palette.textOnLight, fontFamily: fonts.body, fontSize: fontSize.small, fontWeight: fontWeight.semibold },
  errorBox: { marginBottom: spacing.md },
  errorText: { color: palette.danger, fontFamily: fonts.body, marginBottom: spacing.xs },
  retry: { color: palette.info, fontFamily: fonts.body, fontWeight: fontWeight.semibold },
  accion: { marginTop: spacing.sm },
});

export default PerfilScreen;
