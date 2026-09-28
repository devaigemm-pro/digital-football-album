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

import type { EquipoBusqueda, LigaPais, Pais, ProfileClient, Sexo } from '../adapters';
import { ProfilePresenter } from '../profile';
import { Chip, Hero, PrimaryButton, Screen, SecondaryButton } from '../ui/kit';
import { fonts, fontSize, fontWeight, palette, radius, spacing } from '../theme/design-tokens';

/** Puente opcional para elegir la foto de avatar desde la galería. */
export interface AvatarPickerBridge {
  /** Abre la galería y devuelve una URL/URI de imagen, o null si se cancela. */
  pickImage(): Promise<string | null>;
}

export interface OnboardingScreenProps {
  readonly profileClient: ProfileClient;
  readonly presenter?: ProfilePresenter;
  readonly onDone?: () => void;
  /** Puente opcional para elegir avatar (si falta, se omite el avatar). */
  readonly avatarPicker?: AvatarPickerBridge;
  /** Cierra la sesión (opción visible durante el alta). */
  readonly onLogout?: () => void;
}

type Paso = 'bienvenida' | 'perfil' | 'pais' | 'division' | 'equipo' | 'cargando' | 'listo';

/**
 * Temporada deportiva de trabajo. IMPORTANTE: la `SPORTS_API_KEY` es de plan
 * FREE de API-Football, que solo cubre ~2021-2023; la temporada en curso NO
 * está disponible en free. Por eso se usa 2023 como "temporada demo" con datos
 * reales y completos (fixtures, resultados, escudos, Copa Chile). Cuando se
 * suba a un plan de pago, cambiar por `new Date().getFullYear()` (o detectar la
 * última temporada disponible del equipo). Ver preferencias 2026-09-27.
 */
const SEASON_DEMO = 2023;

/** Opciones de sexo para el perfil. */
const OPCIONES_SEXO: ReadonlyArray<{ valor: Sexo; etiqueta: string }> = [
  { valor: 'MASCULINO', etiqueta: 'Masculino' },
  { valor: 'FEMENINO', etiqueta: 'Femenino' },
  { valor: 'OTRO', etiqueta: 'Otro' },
  { valor: 'PREFIERO_NO_DECIR', etiqueta: 'Prefiero no decir' },
];

/** ¿La liga es una competición de club real (no amistosos)? */
function esLigaReal(l: LigaPais): boolean {
  return !/friendl|amistos/i.test(l.nombre);
}

export function OnboardingScreen({
  profileClient,
  presenter,
  onDone,
  avatarPicker,
  onLogout,
}: OnboardingScreenProps): React.ReactElement {
  const pres = useMemo(
    () => presenter ?? new ProfilePresenter(profileClient),
    [presenter, profileClient],
  );

  const [paso, setPaso] = useState<Paso>('bienvenida');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Datos de perfil.
  const [nombre, setNombre] = useState('');
  const [alias, setAlias] = useState('');
  const [fechaNacimiento, setFechaNacimiento] = useState('');
  const [sexo, setSexo] = useState<Sexo | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [guardandoPerfil, setGuardandoPerfil] = useState(false);

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
        const ligas = await profileClient.ligasDePais(p.nombre, SEASON_DEMO);
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
        setEquipos(await profileClient.equiposDeLiga(l.ligaId, SEASON_DEMO));
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
        // temporadaExterna = "team:<teamId>:<season>" para traer TODOS los
        // partidos del equipo en TODAS las competiciones (liga + Copa Chile +
        // internacional), no solo una liga (Req 4.2).
        const res = await profileClient.syncTemporada(
          `team:${e.id}:${SEASON_DEMO}`,
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

  /** Valida fecha ISO (YYYY-MM-DD) no futura, o vacía (opcional). */
  const fechaValida = (): boolean => {
    if (fechaNacimiento.trim() === '') return true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaNacimiento)) return false;
    const t = Date.parse(fechaNacimiento);
    return !Number.isNaN(t) && t <= Date.now();
  };

  const elegirAvatar = (): void => {
    if (!avatarPicker) return;
    void (async () => {
      try {
        const uri = await avatarPicker.pickImage();
        if (uri) setAvatarUrl(uri);
      } catch {
        // Cancelado o sin permiso: se omite el avatar.
      }
    })();
  };

  /** Guarda el perfil (PATCH /me) y avanza a elegir país. */
  const guardarPerfil = (): void => {
    if (nombre.trim().length === 0) {
      setError('Ingresa tu nombre para continuar.');
      return;
    }
    if (!fechaValida()) {
      setError('La fecha de nacimiento debe tener formato AAAA-MM-DD y no ser futura.');
      return;
    }
    setGuardandoPerfil(true);
    setError(null);
    void (async () => {
      try {
        await profileClient.actualizarPerfil({
          nombre: nombre.trim(),
          ...(alias.trim() ? { alias: alias.trim() } : {}),
          ...(fechaNacimiento.trim() ? { fechaNacimiento: fechaNacimiento.trim() } : {}),
          ...(sexo ? { sexo } : {}),
          ...(avatarUrl ? { avatarUrl } : {}),
        });
        setPaso('pais');
      } catch {
        setError('No se pudo guardar tu perfil. Inténtalo de nuevo.');
      } finally {
        setGuardandoPerfil(false);
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
        <PrimaryButton title="Empezar" onPress={() => setPaso('perfil')} style={styles.cta} />
        {onLogout ? (
          <SecondaryButton title="Cerrar sesión" onPress={onLogout} style={styles.secondary} />
        ) : null}
      </Screen>
    );
  }

  if (paso === 'perfil') {
    return (
      <Screen tone="light" flush>
        <Hero eyebrow="Paso 1 de 4" title="Tu perfil" />
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {/* Avatar */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Elegir foto de perfil"
            onPress={elegirAvatar}
            style={styles.avatarWrap}
          >
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatar} accessibilityRole="image" />
            ) : (
              <View style={[styles.avatar, styles.avatarVacio]}>
                <Text style={styles.avatarTexto}>
                  {avatarPicker ? 'Foto' : 'Sin foto'}
                </Text>
              </View>
            )}
          </Pressable>
          {avatarPicker ? (
            <Text style={styles.help}>Toca la imagen para elegir tu foto de perfil.</Text>
          ) : null}

          <Text style={styles.label}>Nombre</Text>
          <TextInput
            style={styles.input}
            value={nombre}
            onChangeText={setNombre}
            placeholder="Tu nombre"
            placeholderTextColor={palette.textMutedOnDark}
            accessibilityLabel="Nombre"
          />

          <Text style={styles.label}>Alias</Text>
          <TextInput
            style={styles.input}
            value={alias}
            onChangeText={setAlias}
            autoCapitalize="none"
            placeholder="Cómo te dicen (opcional)"
            placeholderTextColor={palette.textMutedOnDark}
            accessibilityLabel="Alias"
          />

          <Text style={styles.label}>Fecha de nacimiento</Text>
          <TextInput
            style={styles.input}
            value={fechaNacimiento}
            onChangeText={setFechaNacimiento}
            autoCapitalize="none"
            keyboardType="numbers-and-punctuation"
            placeholder="AAAA-MM-DD (opcional)"
            placeholderTextColor={palette.textMutedOnDark}
            accessibilityLabel="Fecha de nacimiento"
          />

          <Text style={styles.label}>Sexo</Text>
          <View style={styles.chips}>
            {OPCIONES_SEXO.map((o) => (
              <Chip
                key={o.valor}
                label={o.etiqueta}
                selected={sexo === o.valor}
                onPress={() => setSexo(o.valor)}
                style={styles.chip}
              />
            ))}
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}
          <PrimaryButton
            title={guardandoPerfil ? 'Guardando…' : 'Continuar'}
            onPress={guardarPerfil}
            disabled={guardandoPerfil}
            style={styles.cta}
          />
          {onLogout ? (
            <SecondaryButton title="Cerrar sesión" tone="light" onPress={onLogout} style={styles.secondary} />
          ) : null}
        </ScrollView>
      </Screen>
    );
  }

  if (paso === 'pais') {
    return (
      <Screen tone="light" flush>
        <Hero eyebrow="Paso 2 de 4" title="Elige tu país" />
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <TextInput
            style={styles.input}
            value={filtroPais}
            onChangeText={setFiltroPais}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Filtrar país (p. ej. Chile)"
            placeholderTextColor={palette.textMutedOnDark}
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
        <Hero eyebrow="Paso 3 de 4" title="Elige tu división" />
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.help}>Competiciones de {pais?.nombre ?? 'tu país'} · {SEASON_DEMO}</Text>
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
        <Hero eyebrow="Paso 4 de 4" title="Elige tu equipo" />
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
  avatarWrap: { alignSelf: 'center', marginBottom: spacing.sm },
  avatar: { width: 96, height: 96, borderRadius: 48, backgroundColor: palette.canvas },
  avatarVacio: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: palette.borderOnDark,
    borderStyle: 'dashed',
  },
  avatarTexto: { color: palette.textMutedOnDark, fontFamily: fonts.body, fontSize: fontSize.small },
  label: {
    color: palette.textOnDark,
    fontFamily: fonts.body,
    fontSize: fontSize.small,
    fontWeight: fontWeight.semibold,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  chip: { marginBottom: spacing.xs },
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
    borderColor: palette.borderOnDark,
    borderRadius: radius.md,
    backgroundColor: palette.glassFill,
    color: palette.textOnDark,
    padding: spacing.md,
    fontFamily: fonts.body,
    fontSize: fontSize.body,
    marginBottom: spacing.md,
  },
  error: { color: palette.danger, fontFamily: fonts.body, marginBottom: spacing.md },
  help: { color: palette.textMutedOnDark, fontFamily: fonts.body, fontSize: fontSize.small, marginBottom: spacing.md },
  row: {
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
  rowInfo: { flex: 1 },
  rowNombre: { flex: 1, color: palette.textOnDark, fontFamily: fonts.body, fontSize: fontSize.body, fontWeight: fontWeight.semibold },
  rowSub: { color: palette.textMutedOnDark, fontFamily: fonts.body, fontSize: fontSize.caption, marginTop: 2 },
  bandera: { width: 32, height: 22, borderRadius: 3, backgroundColor: palette.canvas },
  logo: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: palette.canvas },
});

export default OnboardingScreen;
