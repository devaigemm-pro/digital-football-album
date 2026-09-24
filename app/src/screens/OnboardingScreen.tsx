// OnboardingScreen — alta guiada del hincha con datos REALES (API-Football).
//
// Pasos:
//   1. Bienvenida.
//   2. Buscar y elegir tu equipo REAL por nombre (`GET /equipos?buscar=`).
//      Al elegir, se persiste como Club real y se asigna (`POST /me/equipo`).
//   3. Elegir la liga/competición de tu equipo (`GET /equipos/:id/ligas?season=`),
//      filtrando amistosos.
//   4. Cargar la temporada (`POST /me/temporada` con "<ligaId>:<season>") → deriva
//      el álbum desde el fixture oficial.
//   5. Listo → entra a la app.
//
// Pantalla DELGADA: la lógica sensible vive en el ProfilePresenter (puro). Aquí
// se orquestan los pasos y se pinta con el kit de UI. `.tsx` excluido del
// typecheck (RN no instalado en este entorno).

import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import type { EquipoBusqueda, LigaEquipo, ProfileClient } from '../adapters';
import { ProfilePresenter } from '../profile';
import { Hero, PrimaryButton, Screen, SecondaryButton } from '../ui/kit';
import { fonts, fontSize, fontWeight, palette, radius, spacing } from '../theme/design-tokens';

export interface OnboardingScreenProps {
  /** Cliente de perfil/onboarding (búsqueda de equipos, ligas, selección, sync). */
  readonly profileClient: ProfileClient;
  /** Presentador de perfil compartido (opcional). */
  readonly presenter?: ProfilePresenter;
  /** Se invoca cuando el onboarding termina (temporada cargada). */
  readonly onDone?: () => void;
}

type Paso = 'bienvenida' | 'equipo' | 'liga' | 'cargando' | 'listo';

/** Temporada por defecto sugerida para buscar ligas (último año con cobertura amplia). */
const SEASON_DEFECTO = 2023;

/** ¿La liga es una competición real (no amistosos)? */
function esLigaReal(l: LigaEquipo): boolean {
  return !/friendl|amistos/i.test(l.nombre);
}

export function OnboardingScreen({
  profileClient,
  presenter,
  onDone,
}: OnboardingScreenProps): React.ReactElement {
  const pres = useMemo(
    () => presenter ?? new ProfilePresenter(profileClient),
    [presenter, profileClient],
  );

  const [paso, setPaso] = useState<Paso>('bienvenida');
  const [query, setQuery] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState<readonly EquipoBusqueda[]>([]);
  const [equipo, setEquipo] = useState<EquipoBusqueda | null>(null);
  const [ligas, setLigas] = useState<readonly LigaEquipo[]>([]);
  const [ligasSeason] = useState(SEASON_DEFECTO);
  const [error, setError] = useState<string | null>(null);
  const [resultadoRecuadros, setResultadoRecuadros] = useState(0);

  const buscar = (): void => {
    void (async () => {
      setBuscando(true);
      setError(null);
      try {
        setResultados(await profileClient.buscarEquipos(query.trim()));
      } catch {
        setError('No se pudo buscar equipos. Revisa tu conexión e inténtalo de nuevo.');
      } finally {
        setBuscando(false);
      }
    })();
  };

  const elegirEquipo = (e: EquipoBusqueda): void => {
    void (async () => {
      setBuscando(true);
      setError(null);
      setEquipo(e);
      try {
        await profileClient.seleccionarEquipo(e);
        const disponibles = await profileClient.ligasDeEquipo(e.id, ligasSeason);
        setLigas(disponibles.filter(esLigaReal));
        setPaso('liga');
      } catch {
        setError('No se pudo seleccionar el equipo. Inténtalo de nuevo.');
      } finally {
        setBuscando(false);
      }
    })();
  };

  const elegirLiga = (l: LigaEquipo): void => {
    setPaso('cargando');
    setError(null);
    void (async () => {
      try {
        const res = await profileClient.syncTemporada(`${l.ligaId}:${ligasSeason}`);
        setResultadoRecuadros(res.recuadros);
        await pres.loadProfile();
        setPaso('listo');
      } catch {
        setError('No se pudo cargar la temporada. Inténtalo de nuevo.');
      }
    })();
  };

  // --- Render por paso ------------------------------------------------------

  if (paso === 'bienvenida') {
    return (
      <Screen tone="dark" style={styles.center}>
        <Text style={styles.bigTitle}>Álbum del hincha</Text>
        <Text style={styles.lead}>
          Documenta tu temporada partido a partido y arma tu álbum coleccionable.
        </Text>
        <PrimaryButton title="Empezar" onPress={() => setPaso('equipo')} style={styles.cta} />
      </Screen>
    );
  }

  if (paso === 'equipo') {
    return (
      <Screen tone="light" flush>
        <Hero eyebrow="Paso 1 de 2" title="Busca tu equipo" />
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={styles.searchRow}>
            <TextInput
              style={styles.input}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Nombre del equipo (p. ej. Barcelona)"
              placeholderTextColor={palette.textMutedOnLight}
              onSubmitEditing={buscar}
              accessibilityLabel="Nombre del equipo"
            />
          </View>
          <PrimaryButton
            title={buscando ? 'Buscando…' : 'Buscar'}
            onPress={buscar}
            disabled={buscando || query.trim().length < 2}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}

          {resultados.map((e) => (
            <Pressable
              key={e.id}
              accessibilityRole="button"
              disabled={buscando}
              onPress={() => elegirEquipo(e)}
              style={styles.equipoRow}
            >
              {e.escudoUrl ? (
                <Image source={{ uri: e.escudoUrl }} style={styles.escudo} accessibilityRole="image" />
              ) : (
                <View style={styles.escudo} />
              )}
              <View style={styles.equipoInfo}>
                <Text style={styles.equipoNombre}>{e.nombre}</Text>
                {e.pais ? <Text style={styles.equipoPais}>{e.pais}</Text> : null}
              </View>
              {buscando && equipo?.id === e.id ? <ActivityIndicator color={palette.accent} /> : null}
            </Pressable>
          ))}
        </ScrollView>
      </Screen>
    );
  }

  if (paso === 'liga') {
    return (
      <Screen tone="light" flush>
        <Hero eyebrow="Paso 2 de 2" title="Elige tu competición" />
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.help}>
            Competiciones de {equipo?.nombre ?? 'tu equipo'} en la temporada {ligasSeason}.
          </Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {ligas.length === 0 ? (
            <Text style={styles.help}>
              No se encontraron competiciones para esa temporada. Vuelve a elegir tu equipo.
            </Text>
          ) : null}
          {ligas.map((l) => (
            <Pressable
              key={l.ligaId}
              accessibilityRole="button"
              onPress={() => elegirLiga(l)}
              style={styles.ligaRow}
            >
              <Text style={styles.ligaNombre}>{l.nombre}</Text>
              {l.tipo ? <Text style={styles.ligaTipo}>{l.tipo}</Text> : null}
            </Pressable>
          ))}
          <SecondaryButton
            title="Volver a buscar equipo"
            tone="light"
            onPress={() => setPaso('equipo')}
            style={styles.secondary}
          />
        </ScrollView>
      </Screen>
    );
  }

  if (paso === 'cargando') {
    return (
      <Screen tone="dark" style={styles.center}>
        {error ? (
          <>
            <Text style={styles.bigTitle}>No se pudo cargar</Text>
            <Text style={styles.lead}>{error}</Text>
            <SecondaryButton title="Elegir otra competición" onPress={() => setPaso('liga')} style={styles.cta} />
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
        Tu temporada se cargó con {resultadoRecuadros} láminas. Ya puedes empezar a documentar
        tus partidos.
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
  searchRow: { marginBottom: spacing.md },
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
  error: { color: palette.danger, fontFamily: fonts.body, marginTop: spacing.md },
  equipoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.borderOnLight,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  escudo: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: palette.canvas },
  equipoInfo: { flex: 1 },
  equipoNombre: { color: palette.textOnLight, fontFamily: fonts.body, fontSize: fontSize.body, fontWeight: fontWeight.semibold },
  equipoPais: { color: palette.textMutedOnLight, fontFamily: fonts.body, fontSize: fontSize.small, marginTop: 2 },
  help: { color: palette.textMutedOnLight, fontFamily: fonts.body, fontSize: fontSize.small, marginBottom: spacing.md, lineHeight: 20 },
  ligaRow: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.borderOnLight,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  ligaNombre: { color: palette.textOnLight, fontFamily: fonts.body, fontSize: fontSize.subtitle, fontWeight: fontWeight.semibold },
  ligaTipo: { color: palette.textMutedOnLight, fontFamily: fonts.body, fontSize: fontSize.caption, marginTop: 2 },
});

export default OnboardingScreen;
