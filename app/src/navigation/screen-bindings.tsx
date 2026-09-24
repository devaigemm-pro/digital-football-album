// screen-bindings.tsx — enlace (binding) de cada pantalla del grafo con sus
// clientes/presentadores concretos. Wiring de la App_Móvil.
//
// ⚠️ Este archivo es `.tsx`: importa React y las pantallas RN. Está EXCLUIDO del
// typecheck de `app/tsconfig.json` (React/React Native no instalados en este
// entorno). Es código real para cuando se instale el toolchain del cliente.
//
// BACKEND DEPLOYADO (docs/FRONTEND_INTEGRATION.md): solo un subconjunto de
// pantallas tiene backend real. Las funciones NO disponibles todavía (§7) se
// sustituyen por un placeholder "No disponible todavía" para no cablear llamadas
// a rutas inexistentes y no romper la navegación:
//   DISPONIBLES: Login (Supabase email/password), Selección de Club (GET /clubs
//     + PUT /me/club), Home/Álbum (GET /album/:id/preview), Captura (POST
//     /partidos/:id/fotos), Digital Card (POST /cards/:momentoId), Ajustes
//     (logout Supabase).
//   NO DISPONIBLES: Suscripción/IAP, Envío/Pedido, Notificaciones, Cierre de
//     Temporada y la edición de contexto del Momento (Detalle más allá de la
//     foto/Card).
//
// IDs EN TIEMPO DE EJECUCIÓN: algunas pantallas necesitan datos de navegación
// (temporadaId, partidoId, momentoId). Se toman de `route.params`; si faltan, el
// wrapper muestra un placeholder ligero (sin crash) con un `// TODO` de cableado.

import * as React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { AuthSessionPresenter } from '../session';
import type { AlbumPreviewClient } from '../album';
import type {
  CaptureClient,
  CardsClient,
  ClubClient,
  DigitalCard,
} from '../viewmodels';
import type { ClubsCatalogClient, ClubCatalogEntry, ProfileClient } from '../adapters';
import type { SharePresenter } from '../share';
import type { CapturePresenter } from '../capture';
import type { CaptureNativeBridge } from '../screens/CapturaScreen';
import type { PermissionGate } from '../permissions';
import type { SubscriptionClient } from '../subscription';
import { ProfilePresenter, type ProfileState } from '../profile';

import { LoginScreen } from '../screens/LoginScreen';
import { AjustesScreen } from '../screens/AjustesScreen';
import { HomeAlbumScreen } from '../screens/HomeAlbumScreen';
import { CapturaScreen } from '../screens/CapturaScreen';
import { DigitalCardScreen } from '../screens/DigitalCardScreen';
import { CompartirSheet } from '../screens/CompartirSheet';
import { PerfilScreen } from '../screens/PerfilScreen';
import { PartidosScreen } from '../screens/PartidosScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { useClubTheme } from '../theme/ClubThemeProvider';
import { Badge, Crest, Hero, Screen } from '../ui/kit';
import { fonts, fontSize, fontWeight, palette, radius, spacing } from '../theme/design-tokens';

import type { ScreenBundle } from './RootNavigator';

/**
 * Dependencias de composición para enlazar las pantallas. Las construye App.tsx
 * a partir del stack de red (adaptadores HTTP) y de los puentes nativos.
 *
 * Se reduce al subconjunto con backend REAL: se eliminaron las dependencias de
 * las funciones no disponibles (IAP, envío, notificaciones, cierre) que ahora se
 * muestran como placeholder.
 */
export interface ScreenDeps {
  /** Presenter de sesión (login/registro/logout) respaldado por Supabase. */
  readonly authPresenter: AuthSessionPresenter;
  /** Cliente de Club (`PUT /me/club`) para aplicar la identidad visual. */
  readonly clubClient: ClubClient;
  /** Catálogo de clubes (`GET /clubs`) para la selección/onboarding. */
  readonly clubsCatalogClient: ClubsCatalogClient;
  /** Cliente de previsualización del álbum (`GET /album/{id}/preview`). */
  readonly albumPreviewClient: AlbumPreviewClient;
  /**
   * Cliente de perfil/partidos (`GET /me`, `GET /temporadas/:id/partidos`). Es
   * la fuente del `temporadaId` (temporada activa) y de la lista de partidos
   * para tomar foto; reemplaza el `usuarioId` fijo y los placeholders.
   */
  readonly profileClient: ProfileClient;
  /** Presenter de captura (galería/cámara + subida). */
  readonly capturePresenter: CapturePresenter;
  /** Cliente de captura (`POST /partidos/{id}/fotos`). */
  readonly captureClient: CaptureClient;
  /** Puerta de permisos (cámara/almacenamiento/geo). */
  readonly permissionGate: PermissionGate;
  /** Puente nativo de galería/cámara. */
  readonly captureNative: CaptureNativeBridge;
  /** Cliente del Generador_Cards (`POST /cards/{momentoId}`). */
  readonly cardsClient: CardsClient;
  /**
   * Cliente de suscripción. Solo `getEntitlements` (`GET /me/entitlements`) está
   * disponible; el resto lanza `NotAvailableError`. La pantalla de Suscripción
   * se muestra como placeholder.
   */
  readonly subscriptionClient: SubscriptionClient;
  /**
   * Presentador de compartición ya construido con su `NativeShareBridge`. Lo
   * consume la hoja de compartir (`CompartirSheet`) para publicar la Digital
   * Card en redes (Req 6).
   */
  readonly sharePresenter: SharePresenter;
  /**
   * Usuario autenticado, si ya se conoce. El backend deriva el usuario del JWT,
   * por lo que puede ser `null`; los wrappers muestran un estado seguro.
   */
  readonly usuarioId: string | null;
  /** Navega al login (para AjustesScreen tras logout). */
  readonly onRedirectToLogin?: () => void;
}

/** Lee `route.params` de forma segura (puede venir `undefined`). */
function useParams<T extends Record<string, unknown>>(props: {
  route?: { params?: Partial<T> };
}): Partial<T> {
  return props.route?.params ?? {};
}

/** Estado "selecciona…" mostrado cuando falta un id de navegación (sin crash). */
function Placeholder({ mensaje }: { mensaje: string }): React.ReactElement {
  return (
    <Screen tone="light" style={styles.centered}>
      <View accessibilityRole="summary" style={styles.centeredInner}>
        <Text style={styles.placeholderText} accessibilityRole="text">
          {mensaje}
        </Text>
      </View>
    </Screen>
  );
}

/**
 * Pantalla "No disponible todavía" para funciones cuyo backend aún no se expone
 * (docs/FRONTEND_INTEGRATION.md §7). No cablea ninguna llamada de red.
 */
function NoDisponible({ titulo }: { titulo: string }): React.ReactElement {
  return (
    <Screen tone="light" flush>
      <Hero eyebrow="Próximamente" title={titulo} />
      <View style={styles.noDispBody} accessibilityRole="summary">
        <Badge label="No disponible" tone="muted" style={styles.noDispBadge} />
        <Text style={styles.placeholderText} accessibilityRole="text">
          Esta función aún no está disponible en el backend. Estará lista en una
          próxima versión.
        </Text>
      </View>
    </Screen>
  );
}

/**
 * Construye el `ScreenBundle` de pantallas enlazadas a partir de las
 * dependencias de composición. Cada componente es un wrapper delgado que aporta
 * las props concretas y toma los ids necesarios de `route.params`.
 */
export function createScreenBundle(deps: ScreenDeps): ScreenBundle {
  // --- Auth stack ---------------------------------------------------------

  // Login SOLO con correo/contraseña (Supabase Auth). Los botones sociales se
  // ocultan (emailOnly): el login social requeriría configuración extra en
  // Supabase/OAuth (docs · §2 documenta el flujo email/password).
  const Login = (): React.ReactElement => (
    <LoginScreen presenter={deps.authPresenter} emailOnly />
  );

  // Selección de Club: lista el catálogo real (`GET /clubs`) y, al elegir,
  // aplica el Club vía el `ClubThemeProvider` (`PUT /me/club`). El backend
  // deriva el usuario del JWT, así que el `usuarioId` es indiferente aquí.
  const SeleccionClub = (): React.ReactElement => {
    const { theme, selectClub } = useClubTheme();
    const [clubs, setClubs] = React.useState<readonly ClubCatalogEntry[]>([]);
    const [error, setError] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);

    React.useEffect(() => {
      let cancelado = false;
      void deps.clubsCatalogClient
        .listClubs()
        .then((lista) => {
          if (!cancelado) {
            setClubs(lista);
          }
        })
        .catch(() => {
          if (!cancelado) {
            setError('No se pudo cargar el catálogo de clubes.');
          }
        });
      return () => {
        cancelado = true;
      };
    }, []);

    const onElegir = React.useCallback(
      (clubId: string) => {
        void (async () => {
          setBusy(true);
          try {
            // El backend deriva el usuario del token; se pasa '' como usuarioId.
            await selectClub(deps.usuarioId ?? '', clubId);
            setError(null);
          } catch {
            setError('No se pudo aplicar el club. Inténtalo de nuevo.');
          } finally {
            setBusy(false);
          }
        })();
      },
      [selectClub],
    );

    return (
      <Screen tone="light" flush>
        <Hero eyebrow="Bienvenido, hincha" title="Elige tu club" />
        <ScrollView contentContainerStyle={styles.clubList}>
          <Text style={styles.clubHint}>
            {theme
              ? `Club aplicado: ${theme.clubNombre ?? 'seleccionado'}.`
              : 'Selecciona un club para personalizar tu álbum.'}
          </Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {clubs.map((club) => {
            const seleccionado = theme?.clubId === club.id;
            return (
              <Pressable
                key={club.id}
                accessibilityRole="button"
                accessibilityState={{ selected: seleccionado, disabled: busy }}
                disabled={busy}
                onPress={() => onElegir(club.id)}
                style={[styles.clubItem, seleccionado ? styles.clubItemSel : null]}
              >
                <Crest monogram={club.nombre.slice(0, 3).toUpperCase()} size={40} />
                <Text style={styles.clubNombre}>{club.nombre}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </Screen>
    );
  };

  // --- Perfil compartido --------------------------------------------------
  //
  // Un único `ProfilePresenter` compartido por las pantallas que necesitan el
  // `temporadaId` de la temporada activa (`GET /me`). Se carga una vez y las
  // pantallas se suscriben a su estado, evitando pedir `/me` en cada pestaña.
  const profilePresenter = new ProfilePresenter(deps.profileClient);
  let profileLoaded = false;

  /** Hook: estado del perfil compartido, disparando la carga una sola vez. */
  const useProfile = (): ProfileState => {
    const [state, setState] = React.useState<ProfileState>(() =>
      profilePresenter.getProfileState(),
    );
    React.useEffect(() => {
      const unsubscribe = profilePresenter.subscribeProfile(setState);
      if (!profileLoaded) {
        profileLoaded = true;
        void profilePresenter.loadProfile();
      }
      return unsubscribe;
    }, []);
    return state;
  };

  /** Deriva el `temporadaId` activo del perfil, o `null` si aún no se conoce. */
  const useTemporadaId = (): { temporadaId: string | null; cargando: boolean } => {
    const state = useProfile();
    return {
      temporadaId: state.perfil?.temporadaActiva?.id ?? null,
      cargando: state.status === 'loading' || state.status === 'idle',
    };
  };

  // --- Main tabs ----------------------------------------------------------

  // Home/Álbum: obtiene el `temporadaId` del perfil (temporada activa) y carga
  // la previsualización real. Si aún no hay temporada, guía al usuario en vez de
  // fingir contenido.
  const HomeAlbum = (): React.ReactElement => {
    const { temporadaId, cargando } = useTemporadaId();
    if (temporadaId) {
      return (
        <HomeAlbumScreen temporadaId={temporadaId} client={deps.albumPreviewClient} />
      );
    }
    return (
      <Placeholder
        mensaje={
          cargando
            ? 'Cargando tu temporada…'
            : 'Aún no tienes una temporada activa. Elige tu club para empezar tu álbum.'
        }
      />
    );
  };

  // Partidos (láminas): lista los partidos de la temporada activa y navega a la
  // captura con el `partidoId` del partido tocado (Req 3).
  const Partidos = (props: {
    navigation?: { navigate: (route: string, params?: Record<string, unknown>) => void };
  }): React.ReactElement => {
    const { temporadaId, cargando } = useTemporadaId();
    if (!temporadaId) {
      return (
        <Placeholder
          mensaje={
            cargando
              ? 'Cargando tus partidos…'
              : 'Aún no tienes una temporada activa. Elige tu club para ver tus partidos.'
          }
        />
      );
    }
    return (
      <PartidosScreen
        temporadaId={temporadaId}
        client={deps.profileClient}
        onTomarFoto={(partidoId) => props.navigation?.navigate('Captura', { partidoId })}
      />
    );
  };

  const Captura = (
    props: { route?: { params?: { partidoId?: string } } },
  ): React.ReactElement => {
    const { partidoId } = useParams<{ partidoId: string }>(props);
    if (!partidoId) {
      // Sin partido seleccionado: se llega a Captura desde la pestaña Partidos.
      return (
        <Placeholder mensaje="Elige un partido en la pestaña Partidos para tomar su foto." />
      );
    }
    return (
      <CapturaScreen
        partidoId={partidoId}
        presenter={deps.capturePresenter}
        gate={deps.permissionGate}
        native={deps.captureNative}
      />
    );
  };

  // Detalle del Momento: la edición de contexto/notas/votación y la selección de
  // Foto_Principal NO están disponibles (§7). En su lugar, esta ruta ofrece
  // generar la Digital Card del Momento (funcionalidad SÍ disponible,
  // `POST /cards/:momentoId`) si viene `momentoId`; si no, un placeholder.
  const DetalleCard = (
    props: { route?: { params?: { momentoId?: string } } },
  ): React.ReactElement => {
    const { momentoId } = useParams<{ momentoId: string }>(props);
    const usuarioId = deps.usuarioId ?? null;
    if (!momentoId) {
      return (
        <Placeholder mensaje="Abre un recuadro con foto para generar su Digital Card." />
      );
    }
    return (
      <DigitalCardScreen
        usuarioId={usuarioId ?? ''}
        momentoId={momentoId}
        client={deps.cardsClient}
      />
    );
  };

  // Suscripción/IAP no disponible (§7) → placeholder.
  const Suscripcion = (): React.ReactElement => (
    <NoDisponible titulo="Suscripción" />
  );

  // Envío/Pedido no disponible (§7) → placeholder.
  const EnvioPedido = (): React.ReactElement => (
    <NoDisponible titulo="Envío y pedido" />
  );

  // Perfil: club actual, temporada activa y datos del usuario (`GET /me`).
  // Reutiliza el mismo presentador de perfil compartido; navega a Ajustes y a la
  // selección de club.
  const Perfil = (props: {
    navigation?: { navigate: (route: string, params?: Record<string, unknown>) => void };
  }): React.ReactElement => (
    <PerfilScreen
      client={deps.profileClient}
      presenter={profilePresenter}
      onAjustes={() => props.navigation?.navigate('Ajustes')}
      onCambiarClub={() => props.navigation?.navigate('SeleccionClub')}
    />
  );

  const Ajustes = (): React.ReactElement => (
    <AjustesScreen
      presenter={deps.authPresenter}
      onRedirectToLogin={deps.onRedirectToLogin}
    />
  );

  // Compuerta de onboarding: mientras carga el perfil muestra un loader; si el
  // usuario aún no tiene club O no tiene temporada activa, muestra el flujo de
  // onboarding; si ya está listo, renderiza las pestañas (`children`). Reutiliza
  // el presentador de perfil compartido, así que al terminar el onboarding (que
  // recarga el perfil) la compuerta deja pasar automáticamente.
  const OnboardingGate = ({ children }: { children: React.ReactNode }): React.ReactElement => {
    const state = useProfile();
    const perfil = state.perfil;

    // Mientras carga (o aún no ha cargado), no dejamos pasar: loader.
    if (state.status === 'loading' || state.status === 'idle' || perfil === null) {
      return <Placeholder mensaje="Cargando tu perfil…" />;
    }
    // Sin club o sin temporada activa => alta guiada (onboarding).
    const necesitaOnboarding = perfil.club === null || perfil.temporadaActiva === null;
    if (necesitaOnboarding) {
      return (
        <OnboardingScreen
          profileClient={deps.profileClient}
          presenter={profilePresenter}
          onDone={() => {
            void profilePresenter.loadProfile();
          }}
        />
      );
    }
    return <>{children}</>;
  };

  return {
    Login,
    SeleccionClub,
    HomeAlbum,
    Partidos,
    Captura,
    DetalleCard,
    Suscripcion,
    EnvioPedido,
    Perfil,
    Ajustes,
    OnboardingGate,
  };
}

/**
 * Pantallas auxiliares (fuera de las pestañas) ya cableadas. Solo se exponen las
 * que tienen backend REAL: Digital Card (`POST /cards/:momentoId`) y la hoja de
 * Compartir. Notificaciones y Cierre de Temporada se muestran como
 * "No disponible todavía" (§7).
 */
export function createAuxiliaryScreens(deps: ScreenDeps): {
  DigitalCard: (props: {
    route?: { params?: { usuarioId?: string; momentoId?: string } };
  }) => React.ReactElement;
  Compartir: (props: {
    route?: { params?: { card?: DigitalCard } };
  }) => React.ReactElement;
  Notificaciones: () => React.ReactElement;
  CierreTemporada: () => React.ReactElement;
} {
  const DigitalCard = (props: {
    route?: { params?: { usuarioId?: string; momentoId?: string } };
  }): React.ReactElement => {
    const params = props.route?.params ?? {};
    const usuarioId = params.usuarioId ?? deps.usuarioId ?? null;
    if (!params.momentoId) {
      // TODO(wiring): navegar con `{ momentoId }` desde el detalle.
      return (
        <Placeholder mensaje="Genera tu Digital Card desde el detalle de un momento." />
      );
    }
    return (
      <DigitalCardScreen
        usuarioId={usuarioId ?? ''}
        momentoId={params.momentoId}
        client={deps.cardsClient}
      />
    );
  };

  const Compartir = (props: {
    route?: { params?: { card?: DigitalCard } };
  }): React.ReactElement => {
    const card = props.route?.params?.card;
    if (!card) {
      // TODO(wiring): navegar a Compartir con `{ card }` desde DigitalCardScreen.
      return <Placeholder mensaje="Genera tu Digital Card para poder compartirla." />;
    }
    return <CompartirSheet card={card} presenter={deps.sharePresenter} />;
  };

  // Notificaciones push y Cierre anticipado no disponibles (§7) → placeholder.
  const Notificaciones = (): React.ReactElement => (
    <NoDisponible titulo="Notificaciones" />
  );
  const CierreTemporada = (): React.ReactElement => (
    <NoDisponible titulo="Cierre de temporada" />
  );

  return { DigitalCard, Compartir, Notificaciones, CierreTemporada };
}

const styles = StyleSheet.create({
  // Placeholder centrado (falta un id de navegación).
  centered: { alignItems: 'center', justifyContent: 'center' },
  centeredInner: { alignItems: 'center', paddingHorizontal: spacing.lg },
  // Cuerpo de "No disponible" bajo el Hero.
  noDispBody: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  noDispBadge: { alignSelf: 'center', marginBottom: spacing.md },
  placeholderText: {
    color: palette.textMutedOnLight,
    fontFamily: fonts.body,
    fontSize: fontSize.body,
    textAlign: 'center',
    lineHeight: 22,
  },
  error: {
    color: palette.accent,
    fontFamily: fonts.body,
    fontSize: fontSize.small,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  // Selección de Club.
  clubList: { padding: spacing.lg },
  clubHint: {
    color: palette.textMutedOnLight,
    fontFamily: fonts.body,
    fontSize: fontSize.small,
    marginBottom: spacing.md,
  },
  clubItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.borderOnLight,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  clubItemSel: { borderColor: palette.accent, borderWidth: 2 },
  clubNombre: {
    flex: 1,
    color: palette.textOnLight,
    fontFamily: fonts.body,
    fontSize: fontSize.subtitle,
    fontWeight: fontWeight.semibold,
  },
});
