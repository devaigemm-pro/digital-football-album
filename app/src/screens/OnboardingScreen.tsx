// OnboardingScreen — alta guiada del hincha con datos REALES (API-Football).
//
// Flujo por país → división → equipo (con logo), en vez de un buscador libre:
//   1. Bienvenida.
//   2. País: elegir el país (con bandera) — `GET /paises` (filtrable en la lista).
//   3. División/liga: ligas del país esa temporada — `GET /paises/:pais/ligas`.
//   4. Equipo: equipos de la división con su logo — `GET /ligas/:ligaId/equipos`.
//      Al elegir: `POST /me/equipo` (persiste el club real) y luego
//      `POST /me/temporada` con "<ligaId>:<season>" (deriva el álbum).
//   5. Listo → entra a la app.
//
// Pantalla DELGADA: la lógica sensible vive en presenter/servicios puros. `.tsx`
// excluido del typecheck (RN no instalado en este entorno).

import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import type { EquipoBusqueda, LigaPais, Pais, ProfileClient } from '../adapters';
import { ProfilePresenter } from '../profile';
import { Hero, PrimaryButton, Screen, SecondaryButton } from '../ui/kit';
import { fonts, fontSize, fontWeight, palette, radius, spacing } from '../theme/design-tokens';

export interface OnboardingScreenProps {
  readonly profileClient: ProfileClient;
  readonly presenter?: ProfilePresenter;
  readonly onDone?: () => void;
}

type Paso = 'bienvenida' | 'pais' | 'division' | 'equipo' | 'cargando' | 'listo';

/** Temporada por defecto con cobertura amplia en el plan free. */
const SEASON_DEFECTO = 2023;

/** ¿La liga es una competición de club real (no amistosos)? */
function esLigaReal(l: LigaPais): boolean {
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
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [paises, setPaises] = useState<readonly Pais[]>([]);
  const [filtroPais, setFiltroPais] = useState('');
  const [pais, setPais] = useState<Pais | null>(null);

  const [divisiones, setDivisiones] = useState<readonly LigaPais[]>([]);
  const [division, setDivision] = useState<LigaPais | null>(null);

  const [equipos, setEquipos] = useState<readonly EquipoBusqueda[]>([]);
  const [resultadoRecuadros, setResultadoRecuadros] = useState(0);

  // Carga la lista de países al entrar al paso 'pais' (una vez).
  useEffect(() => {
    if (paso !== 'pais' || paises.length > 0) return;
    let cancelado = false;
    setCargando(true);
    setError(null);
    profileClient
      .listarPaises()
      .then((lista) => {
        if (!cancelado) setPaises(lista);
      })
      .catch(() => {
        if (!cancelado) setError('No se pudieron cargar los países. Inténtalo de nuevo.');
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [paso, paises.length, profileClient]);

  const elegirPais = (p: Pais): void => {
    void (async () => {
      setPais(p);
      setCargando(true);
      setError(null);
      try {
        const ligas = await profileClient.ligasDePais(p.nombre, SEASON_DEFECTO);
        setDivisiones(ligas.filter(esLigaReal));
        setPaso('division');
      } catch {
        setError('No se pudieron cargar las divisiones. Inténtalo de nuevo.');
      } finally {
        setCargando(false);
      }
    })();
  };

  const elegirDivision = (l: LigaPais): void => {
    void (async () => {
      setDivision(l);
      setCargando(true);
      setError(null);
      try {
        setEquipos(await profileClient.equiposDeLiga(l.ligaId, SEASON_DEFECTO));
        setPaso('equipo');
      } catch {
        setError('No se pudieron cargar los equipos. Inténtalo de nuevo.');
      } finally {
        setCargando(false);
      }
    })();
  };

  const elegirEquipo = (e: EquipoBusqueda): void => {
    setPaso('cargando');
    setError(null);
    void (async () => {
      try {
        await profileClient.seleccionarEquipo(e);
        // temporadaExterna = "<ligaId>:<season>:<teamId>" para traer SOLO los
        // partidos del equipo elegido (no toda la liga).
        const res = await profileClient.syncTemporada(
          `${division!.ligaId}:${SEASON_DEFECTO}:${e.id}`,
        );
        setResultadoRecuadros(res.recuadros);
        await pres.loadProfile();
        setPaso('listo');
      } catch {
        setError('No se pudo cargar tu temporada. Inténtalo de nuevo.');
      }
    })();
  };

  const paisesFiltrados = useMemo(() => {
    const q = filtroPais.trim().toLocaleLowerCase();
    return q.length === 0 ? paises : paises.filter((p) => p.nombre.toLocaleLowerCase().includes(q));
  }, [paises, filtroPais]);

  // --- Render por paso ------------------------------------------------------

  if (paso === 'bienvenida') {
    return (
      <Screen tone="dark" style={styles.center}>
        <Text style={styles.bigTitle}>Álbum del hincha</Text>
        <Text style={styles.lead}>
          Documenta tu temporada partido a partido y arma tu álbum coleccionable.
        </Text>
        <PrimaryButton title="Empezar" onPress={() => setPaso('pais')} style={styles.cta} />
      </Screen>
    );
  }

  if (paso === 'pais') {
    return (
      <Screen tone="light" flush>
        <Hero eyebrow="Paso 1 de 3" title="Elige tu país" />
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <TextInput
            style={styles.input}
            value={filtroPais}
            onChangeText={setFiltroPais}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Filtrar país (p. ej. Chile)"
            placeholderTextColor={palette.textMutedOnLight}
            accessibilityLabel="Filtrar país"
          />
          {cargando ? <ActivityIndicator color={palette.accent} style={styles.spinner} /> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {paisesFiltrados.slice(0, 60).map((p) => (
            <Pressable
              key={p.nombre}
              accessibilityRole="button"
              disabled={cargando}
              onPress={() => elegirPais(p)}
              style={styles.row}
            >
              {p.banderaUrl ? (
                <Image source={{ uri: p.banderaUrl }} style={styles.bandera} accessibilityRole="image" />
              ) : (
                <View style={styles.bandera} />
              )}
              <Text style={styles.rowNombre}>{p.nombre}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </Screen>
    );
  }

  if (paso === 'division') {
    return (
      <Screen tone="light" flush>
        <Hero eyebrow="Paso 2 de 3" title="Elige tu división" />
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.help}>Competiciones de {pais?.nombre ?? 'tu país'} · {SEASON_DEFECTO}</Text>
          {cargando ? <ActivityIndicator color={palette.accent} style={styles.spinner} /> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {divisiones.map((l) => (
            <Pressable
              key={l.ligaId}
              accessibilityRole="button"
              disabled={cargando}
              onPress={() => elegirDivision(l)}
              style={styles.row}
            >
              {l.logoUrl ? (
                <Image source={{ uri: l.logoUrl }} style={styles.logo} accessibilityRole="image" />
              ) : (
                <View style={styles.logo} />
              )}
              <View style={styles.rowInfo}>
                <Text style={styles.rowNombre}>{l.nombre}</Text>
                {l.tipo ? <Text style={styles.rowSub}>{l.tipo}</Text> : null}
              </View>
            </Pressable>
          ))}
          <SecondaryButton title="Volver a país" tone="light" onPress={() => setPaso('pais')} style={styles.secondary} />
        </ScrollView>
      </Screen>
    );
  }

  if (paso === 'equipo') {
    return (
      <Screen tone="light" flush>
        <Hero eyebrow="Paso 3 de 3" title="Elige tu equipo" />
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.help}>{division?.nombre ?? 'División'} · {pais?.nombre ?? ''}</Text>
          {cargando ? <ActivityIndicator color={palette.accent} style={styles.spinner} /> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {equipos.map((e) => (
            <Pressable
              key={e.id}
              accessibilityRole="button"
              disabled={cargando}
              onPress={() => elegirEquipo(e)}
              style={styles.row}
            >
              {e.escudoUrl ? (
                <Image source={{ uri: e.escudoUrl }} style={styles.logo} accessibilityRole="image" />
              ) : (
                <View style={styles.logo} />
              )}
              <Text style={styles.rowNombre}>{e.nombre}</Text>
            </Pressable>
          ))}
          <SecondaryButton title="Volver a división" tone="light" onPress={() => setPaso('division')} style={styles.secondary} />
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
            <SecondaryButton title="Elegir otro equipo" onPress={() => setPaso('equipo')} style={styles.cta} />
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
  spinner: { marginVertical: spacing.md },
  input: {
    borderWidth: 1,
    borderColor: palette.borderOnLight,
    borderRadius: radius.md,
    backgroundColor: palette.surface,
    color: palette.textOnLight,
    padding: spacing.md,
    fontFamily: fonts.body,
    fontSize: fontSize.body,
    marginBottom: spacing.md,
  },
  error: { color: palette.danger, fontFamily: fonts.body, marginBottom: spacing.md },
  help: { color: palette.textMutedOnLight, fontFamily: fonts.body, fontSize: fontSize.small, marginBottom: spacing.md },
  row: {
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
  rowInfo: { flex: 1 },
  rowNombre: { flex: 1, color: palette.textOnLight, fontFamily: fonts.body, fontSize: fontSize.body, fontWeight: fontWeight.semibold },
  rowSub: { color: palette.textMutedOnLight, fontFamily: fonts.body, fontSize: fontSize.caption, marginTop: 2 },
  bandera: { width: 32, height: 22, borderRadius: 3, backgroundColor: palette.canvas },
  logo: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: palette.canvas },
});

export default OnboardingScreen;
