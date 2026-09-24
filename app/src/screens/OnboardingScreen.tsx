// OnboardingScreen — flujo guiado multipaso de alta del hincha.
//
// Pasos:
//   1. Bienvenida.
//   2. Elegir club (catálogo real `GET /clubs`); al elegir se aplica el club
//      (`PUT /me/club`) vía el ClubThemeProvider y se personaliza el tema.
//   3. Datos: liga/temporada del proveedor deportivo (formato "<leagueId>:<season>",
//      p. ej. 39:2023 = Premier League 2023) para cargar el fixture.
//   4. Cargar temporada: `POST /me/temporada` (API deportiva) → deriva el álbum.
//   5. Listo: entra a la app.
//
// Pantalla DELGADA: la lógica sensible vive en el ClubThemeController y el
// ProfilePresenter (puros, testeados). Aquí solo se orquestan los pasos y se
// pinta con el kit de UI. `.tsx` excluido del typecheck (RN no instalado aquí).

import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';

import type { ClubsCatalogClient, ClubCatalogEntry, ProfileClient } from '../adapters';
import { ProfilePresenter, type SyncState } from '../profile';
import { useClubTheme } from '../theme/ClubThemeProvider';
import { Crest, Hero, PrimaryButton, Screen, SecondaryButton } from '../ui/kit';
import { fonts, fontSize, fontWeight, palette, radius, spacing } from '../theme/design-tokens';

export interface OnboardingScreenProps {
  /** Catálogo de clubes (`GET /clubs`). */
  readonly clubsCatalogClient: ClubsCatalogClient;
  /** Cliente de perfil/partidos (para sincronizar la temporada). */
  readonly profileClient: ProfileClient;
  /** Presentador de perfil compartido (opcional). */
  readonly presenter?: ProfilePresenter;
  /** Se invoca cuando el onboarding termina (temporada cargada). */
  readonly onDone?: () => void;
}

type Paso = 'bienvenida' | 'club' | 'datos' | 'cargando' | 'listo';

/**
 * Flujo de onboarding. Encadena los pasos y, al final, sincroniza la temporada
 * del club desde la API deportiva.
 */
export function OnboardingScreen({
  clubsCatalogClient,
  profileClient,
  presenter,
  onDone,
}: OnboardingScreenProps): React.ReactElement {
  const { selectClub } = useClubTheme();
  const pres = useMemo(() => presenter ?? new ProfilePresenter(profileClient), [presenter, profileClient]);

  const [paso, setPaso] = useState<Paso>('bienvenida');
  const [clubs, setClubs] = useState<readonly ClubCatalogEntry[]>([]);
  const [clubSel, setClubSel] = useState<ClubCatalogEntry | null>(null);
  const [errorClubs, setErrorClubs] = useState<string | null>(null);
  const [aplicandoClub, setAplicandoClub] = useState(false);
  // Liga/temporada del proveedor (por defecto Premier 2023 para pruebas).
  const [temporadaExterna, setTemporadaExterna] = useState('39:2023');
  const [sync, setSync] = useState<SyncState>(() => pres.getSyncState());

  useEffect(() => pres.subscribeSync(setSync), [pres]);

  // Carga el catálogo al entrar al paso de club.
  useEffect(() => {
    if (paso !== 'club') {return;}
    let cancelado = false;
    clubsCatalogClient
      .listClubs()
      .then((lista) => {
        if (!cancelado) {setClubs(lista);}
      })
      .catch(() => {
        if (!cancelado) {setErrorClubs('No se pudo cargar el catálogo de clubes.');}
      });
    return () => {
      cancelado = true;
    };
  }, [paso, clubsCatalogClient]);

  // Al completar la sincronización con éxito, pasa a "listo".
  useEffect(() => {
    if (paso === 'cargando' && sync.status === 'done') {setPaso('listo');}
  }, [paso, sync.status]);

  const elegirClub = (club: ClubCatalogEntry): void => {
    void (async () => {
      setAplicandoClub(true);
      setClubSel(club);
      try {
        // El backend deriva el usuario del token; usuarioId es indiferente.
        await selectClub('', club.id);
        setPaso('datos');
      } catch {
        setErrorClubs('No se pudo aplicar el club. Inténtalo de nuevo.');
      } finally {
        setAplicandoClub(false);
      }
    })();
  };

  const cargarTemporada = (): void => {
    setPaso('cargando');
    void pres.syncTemporada(temporadaExterna.trim());
  };

  // --- Render por paso ------------------------------------------------------

  if (paso === 'bienvenida') {
    return (
      <Screen tone="dark" style={styles.center}>
        <Text style={styles.bigTitle}>Álbum del hincha</Text>
        <Text style={styles.lead}>
          Documenta tu temporada partido a partido y arma tu álbum coleccionable.
        </Text>
        <PrimaryButton title="Empezar" onPress={() => setPaso('club')} style={styles.cta} />
      </Screen>
    );
  }

  if (paso === 'club') {
    return (
      <Screen tone="light" flush>
        <Hero eyebrow="Paso 1 de 3" title="Elige tu club" />
        <ScrollView contentContainerStyle={styles.body}>
          {errorClubs ? <Text style={styles.error}>{errorClubs}</Text> : null}
          {clubs.map((club) => (
            <Pressable
              key={club.id}
              accessibilityRole="button"
              disabled={aplicandoClub}
              onPress={() => elegirClub(club)}
              style={styles.clubRow}
            >
              <Crest monogram={club.nombre.slice(0, 3).toUpperCase()} size={40} />
              <Text style={styles.clubNombre}>{club.nombre}</Text>
              {aplicandoClub && clubSel?.id === club.id ? (
                <ActivityIndicator color={palette.accent} />
              ) : null}
            </Pressable>
          ))}
        </ScrollView>
      </Screen>
    );
  }

  if (paso === 'datos') {
    return (
      <Screen tone="light" flush>
        <Hero eyebrow="Paso 2 de 3" title="Tu temporada" />
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.label}>Liga y temporada</Text>
          <Text style={styles.help}>
            Indica la liga y el año de tu equipo. Formato: idLiga:año (por ejemplo,
            39:2023 para Premier League 2023).
          </Text>
          <TextInput
            style={styles.input}
            value={temporadaExterna}
            onChangeText={setTemporadaExterna}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="39:2023"
            placeholderTextColor={palette.textMutedOnLight}
            accessibilityLabel="Liga y temporada"
          />
          <PrimaryButton title="Cargar mi temporada" onPress={cargarTemporada} style={styles.cta} />
          <SecondaryButton
            title="Volver a elegir club"
            tone="light"
            onPress={() => setPaso('club')}
            style={styles.secondary}
          />
        </ScrollView>
      </Screen>
    );
  }

  if (paso === 'cargando') {
    return (
      <Screen tone="dark" style={styles.center}>
        {sync.status === 'error' ? (
          <>
            <Text style={styles.bigTitle}>No se pudo cargar</Text>
            <Text style={styles.lead}>{sync.error}</Text>
            <PrimaryButton title="Reintentar" onPress={cargarTemporada} style={styles.cta} />
            <SecondaryButton
              title="Cambiar liga/temporada"
              onPress={() => setPaso('datos')}
              style={styles.secondary}
            />
          </>
        ) : (
          <>
            <ActivityIndicator size="large" color={palette.accent} />
            <Text style={styles.lead}>Cargando el fixture de tu temporada…</Text>
          </>
        )}
      </Screen>
    );
  }

  // paso === 'listo'
  return (
    <Screen tone="dark" style={styles.center}>
      <Text style={styles.bigTitle}>¡Todo listo!</Text>
      <Text style={styles.lead}>
        Tu temporada se cargó con {sync.result?.recuadros ?? 0} láminas. Ya puedes empezar a
        documentar tus partidos.
      </Text>
      <PrimaryButton title="Ir a mi álbum" onPress={onDone} style={styles.cta} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  bigTitle: {
    color: palette.textOnDark,
    fontFamily: fonts.display,
    fontSize: fontSize.hero,
    fontWeight: fontWeight.bold,
    letterSpacing: 1,
    textAlign: 'center',
  },
  lead: {
    color: palette.textMutedOnDark,
    fontFamily: fonts.body,
    fontSize: fontSize.body,
    textAlign: 'center',
    marginTop: spacing.md,
    lineHeight: 22,
  },
  cta: { marginTop: spacing.xl, alignSelf: 'stretch' },
  secondary: { marginTop: spacing.md, alignSelf: 'stretch' },
  body: { padding: spacing.lg },
  error: { color: palette.danger, fontFamily: fonts.body, marginBottom: spacing.md },
  clubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.borderOnLight,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  clubNombre: {
    flex: 1,
    color: palette.textOnLight,
    fontFamily: fonts.body,
    fontSize: fontSize.subtitle,
    fontWeight: fontWeight.semibold,
  },
  label: {
    color: palette.textOnLight,
    fontFamily: fonts.body,
    fontSize: fontSize.body,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.xs,
  },
  help: { color: palette.textMutedOnLight, fontFamily: fonts.body, fontSize: fontSize.small, marginBottom: spacing.md, lineHeight: 20 },
  input: {
    borderWidth: 1,
    borderColor: palette.borderOnLight,
    borderRadius: radius.md,
    backgroundColor: palette.surface,
    color: palette.textOnLight,
    padding: spacing.md,
    fontFamily: fonts.body,
    fontSize: fontSize.body,
  },
});

export default OnboardingScreen;
