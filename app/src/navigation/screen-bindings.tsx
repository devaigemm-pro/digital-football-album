// screen-bindings.tsx — enlace (binding) de cada pantalla del grafo con sus
// clientes/presentadores concretos. Wiring de la App_Móvil (Task 27.2 + red).
//
// ⚠️ Este archivo es `.tsx`: importa React y las pantallas RN. Está EXCLUIDO del
// typecheck de `app/tsconfig.json` (React/React Native no instalados en este
// entorno). Es código real para cuando se instale el toolchain del cliente.
//
// PROBLEMA QUE RESUELVE: `RootNavigator` monta pantallas que exigen props
// inyectadas (presenter/client/temporadaId/…). Este módulo construye, a partir
// de un único `ScreenDeps` (adaptadores HTTP + presentadores + puentes nativos),
// un `ScreenBundle` de componentes YA ENLAZADOS que el navegador puede montar
// sin conocer el wiring.
//
// IDs EN TIEMPO DE EJECUCIÓN: algunas pantallas necesitan datos que no existen
// al componer la app (temporadaId, partidoId, usuarioId, momentoId, recuadroId,
// fotos, alineación). Esos valores se toman de `route.params` (fuente de verdad:
// `route-model.ts`). Cuando el id todavía no está disponible, el wrapper NO deja
// props obligatorias sin definir (evita un crash al montar): muestra un estado
// ligero "selecciona…" con un `// TODO` de cableado pendiente. Así la app
// compila y renderiza de forma segura mientras se completa el enrutado real.

import * as React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { AuthSessionPresenter } from '../session';
import type { AlbumPreviewClient } from '../album';
import type {
  CaptureClient,
  CardsClient,
  ClubClient,
  DigitalCard,
  Foto,
} from '../viewmodels';
import type { JugadorAlineacion } from '../../../src/domain/types';
import type { SharePresenter } from '../share';
import type { CapturePresenter } from '../capture';
import { MomentoDetailPresenter } from '../capture';
import type { CaptureNativeBridge } from '../screens/CapturaScreen';
import type { PermissionGate } from '../permissions';
import type { IapPurchaser, SubscriptionClient } from '../subscription';
import type { ShippingClient } from '../shipping';
import type { SeasonCloseClient } from '../season';
import type {
  NativeNotificationBridge,
  PushPlatform,
  PushRegistrationClient,
} from '../notifications';

import { LoginScreen } from '../screens/LoginScreen';
import { AjustesScreen } from '../screens/AjustesScreen';
import { HomeAlbumScreen } from '../screens/HomeAlbumScreen';
import { CapturaScreen } from '../screens/CapturaScreen';
import { DetalleCardScreen } from '../screens/DetalleCardScreen';
import { DigitalCardScreen } from '../screens/DigitalCardScreen';
import { CompartirSheet } from '../screens/CompartirSheet';
import { SuscripcionScreen } from '../screens/SuscripcionScreen';
import { EnvioPedidoScreen } from '../screens/EnvioPedidoScreen';
import { NotificacionesScreen } from '../screens/NotificacionesScreen';
import { CierreTemporadaScreen } from '../screens/CierreTemporadaScreen';
import { useClubTheme } from '../theme/ClubThemeProvider';

import type { ScreenBundle } from './RootNavigator';

/**
 * Dependencias de composición para enlazar las pantallas. Las construye App.tsx
 * a partir del stack de red (adaptadores HTTP) y de los puentes nativos.
 */
export interface ScreenDeps {
  /** Presenter de sesión (login/registro/logout/borrado). */
  readonly authPresenter: AuthSessionPresenter;
  /** Cliente de Club (`PUT /usuario/club`) para la selección/onboarding. */
  readonly clubClient: ClubClient;
  /** Cliente de previsualización del álbum (`GET /album/{id}/preview`). */
  readonly albumPreviewClient: AlbumPreviewClient;
  /** Presenter de captura (galería/cámara + subida). */
  readonly capturePresenter: CapturePresenter;
  /** Cliente de captura (`POST /momentos/{id}/fotos`, etc.) para el detalle. */
  readonly captureClient: CaptureClient;
  /** Puerta de permisos (cámara/almacenamiento/geo). */
  readonly permissionGate: PermissionGate;
  /** Puente nativo de galería/cámara. */
  readonly captureNative: CaptureNativeBridge;
  /** Cliente del Generador_Cards (`POST /cards`). */
  readonly cardsClient: CardsClient;
  /** Cliente de suscripción (`GET/POST /subscription…`). */
  readonly subscriptionClient: SubscriptionClient;
  /** Puerto nativo de compra dentro de la app (StoreKit / BillingClient). */
  readonly iapPurchaser: IapPurchaser;
  /** Cliente de envío (`PUT /envio/direccion`, `GET /pedido/{id}`). */
  readonly shippingClient: ShippingClient;
  /** Cliente de cierre anticipado de la Temporada. */
  readonly seasonCloseClient: SeasonCloseClient;
  /** Puente nativo de notificaciones + cliente de registro push. */
  readonly notificationBridge: NativeNotificationBridge;
  readonly pushClient: PushRegistrationClient;
  readonly pushPlatform: PushPlatform;
  /**
   * Presentador de compartición ya construido con su `NativeShareBridge`
   * (envuelve el `NativeSharePort` nativo real). Lo consume la hoja de
   * compartir (`CompartirSheet`) para publicar la Digital_Card en redes (Req 6).
   */
  readonly sharePresenter: SharePresenter;
  /**
   * Usuario autenticado, si ya se conoce (para pantallas que lo requieren, p. ej.
   * la Digital_Card). Puede ser `null` justo tras el arranque; los wrappers
   * muestran un estado seguro mientras tanto.
   * TODO(wiring): poblar `usuarioId` desde el perfil tras autenticar.
   */
  readonly usuarioId: string | null;
  /** Navega al login (para AjustesScreen tras logout/borrado). */
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
    <View style={styles.placeholder} accessibilityRole="summary">
      <Text style={styles.placeholderText} accessibilityRole="text">
        {mensaje}
      </Text>
    </View>
  );
}

/**
 * Construye el `ScreenBundle` de pantallas enlazadas a partir de las
 * dependencias de composición. Cada componente es un wrapper delgado que aporta
 * las props concretas y toma los ids necesarios de `route.params`.
 */
export function createScreenBundle(deps: ScreenDeps): ScreenBundle {
  // Presentador de detalle compartido (envuelve el CaptureClient una sola vez).
  const momentoDetailPresenter = new MomentoDetailPresenter(deps.captureClient);

  // --- Auth stack ---------------------------------------------------------

  const Login = (): React.ReactElement => (
    <LoginScreen presenter={deps.authPresenter} />
  );

  // No existe un `SeleccionClubScreen.tsx` dedicado: se define aquí un binding
  // ligero de onboarding que consume el `ClubThemeProvider` (que ya envuelve al
  // navegador con el `clubClient`). Muestra el club aplicado o invita a elegir.
  // TODO(wiring): reemplazar por una pantalla de catálogo de clubes que llame a
  // `selectClub(usuarioId, clubId)` con la lista real de clubes del backend.
  const SeleccionClub = (): React.ReactElement => {
    const { theme } = useClubTheme();
    return (
      <View style={styles.placeholder}>
        <Text style={styles.title} accessibilityRole="header">
          Elige tu club
        </Text>
        <Text style={styles.placeholderText}>
          {theme
            ? `Club aplicado: ${theme.nombre ?? 'seleccionado'}.`
            : 'Aún no seleccionaste un club. Elige uno para personalizar tu álbum.'}
        </Text>
      </View>
    );
  };

  // --- Main tabs ----------------------------------------------------------

  const HomeAlbum = (
    props: { route?: { params?: { temporadaId?: string } } },
  ): React.ReactElement => {
    const { temporadaId } = useParams<{ temporadaId: string }>(props);
    if (!temporadaId) {
      // TODO(wiring): enrutar con `{ temporadaId }` una vez conocida la Temporada
      // activa del usuario (p. ej. desde el perfil/onboarding).
      return <Placeholder mensaje="Selecciona una temporada para ver tu álbum." />;
    }
    return (
      <HomeAlbumScreen
        temporadaId={temporadaId}
        client={deps.albumPreviewClient}
      />
    );
  };

  const Captura = (
    props: { route?: { params?: { partidoId?: string } } },
  ): React.ReactElement => {
    const { partidoId } = useParams<{ partidoId: string }>(props);
    if (!partidoId) {
      // TODO(wiring): navegar a Captura con `{ partidoId }` desde el álbum/detalle.
      return <Placeholder mensaje="Selecciona un partido para capturar fotos." />;
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

  const DetalleCard = (
    props: {
      route?: {
        params?: {
          recuadroId?: string;
          momentoId?: string;
          fotos?: readonly Foto[];
          fotoPrincipalId?: string | null;
          alineacion?: readonly JugadorAlineacion[];
        };
      };
    },
  ): React.ReactElement => {
    const params = useParams<{
      recuadroId: string;
      momentoId: string;
      fotos: readonly Foto[];
      fotoPrincipalId: string | null;
      alineacion: readonly JugadorAlineacion[];
    }>(props);
    // `recuadroId` es requerido por la ruta; `momentoId`/fotos/alineación se
    // pasan por params al navegar desde el álbum (donde ya se conocen).
    if (!params.recuadroId || !params.momentoId) {
      // TODO(wiring): navegar a DetalleCard con recuadroId + momentoId (+ fotos y
      // alineación del partido) desde HomeAlbum.
      return <Placeholder mensaje="Abre un recuadro desde tu álbum para ver el detalle." />;
    }
    return (
      <DetalleCardScreen
        recuadroId={params.recuadroId}
        momentoId={params.momentoId}
        fotos={params.fotos ?? []}
        fotoPrincipalId={params.fotoPrincipalId ?? null}
        alineacion={params.alineacion ?? []}
        presenter={momentoDetailPresenter}
      />
    );
  };

  const Suscripcion = (): React.ReactElement => (
    <SuscripcionScreen
      client={deps.subscriptionClient}
      iap={deps.iapPurchaser}
    />
  );

  const EnvioPedido = (
    props: { route?: { params?: { temporadaId?: string } } },
  ): React.ReactElement => {
    const { temporadaId } = useParams<{ temporadaId: string }>(props);
    if (!temporadaId) {
      // TODO(wiring): navegar a EnvioPedido con `{ temporadaId }` de la Temporada.
      return <Placeholder mensaje="Selecciona una temporada para ver tu pedido." />;
    }
    return (
      <EnvioPedidoScreen temporadaId={temporadaId} client={deps.shippingClient} />
    );
  };

  const Ajustes = (): React.ReactElement => (
    <AjustesScreen
      presenter={deps.authPresenter}
      onRedirectToLogin={deps.onRedirectToLogin}
    />
  );

  return {
    Login,
    SeleccionClub,
    HomeAlbum,
    Captura,
    DetalleCard,
    Suscripcion,
    EnvioPedido,
    Ajustes,
  };
}

/**
 * Pantallas adicionales (fuera de las pestañas principales) enlazadas para uso
 * modal / navegación secundaria, disponibles para el wiring de rutas futuras.
 * No forman parte del `ScreenBundle` del grafo base, pero se exponen ya
 * cableadas para evitar duplicar el binding.
 */
export function createAuxiliaryScreens(deps: ScreenDeps): {
  DigitalCard: (props: {
    route?: { params?: { usuarioId?: string; momentoId?: string } };
  }) => React.ReactElement;
  Compartir: (props: {
    route?: { params?: { card?: DigitalCard } };
  }) => React.ReactElement;
  Notificaciones: () => React.ReactElement;
  CierreTemporada: (props: {
    route?: { params?: { temporadaId?: string } };
  }) => React.ReactElement;
} {
  const DigitalCard = (props: {
    route?: { params?: { usuarioId?: string; momentoId?: string } };
  }): React.ReactElement => {
    const params = props.route?.params ?? {};
    const usuarioId = params.usuarioId ?? deps.usuarioId ?? null;
    if (!usuarioId || !params.momentoId) {
      // TODO(wiring): navegar con `{ usuarioId, momentoId }` desde el detalle.
      return <Placeholder mensaje="Genera tu Digital Card desde el detalle de un momento." />;
    }
    return (
      <DigitalCardScreen
        usuarioId={usuarioId}
        momentoId={params.momentoId}
        client={deps.cardsClient}
      />
    );
  };

  // Hoja de compartir la Digital_Card a redes (Req 6). Usa el `SharePresenter`
  // real (ya construido con el `NativeShareBridgeAdapter` sobre el
  // `NativeSharePort` nativo). La `card` a compartir llega por `route.params`
  // desde la pantalla de la Digital_Card.
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

  const Notificaciones = (): React.ReactElement => (
    <NotificacionesScreen
      bridge={deps.notificationBridge}
      client={deps.pushClient}
      platform={deps.pushPlatform}
    />
  );

  const CierreTemporada = (props: {
    route?: { params?: { temporadaId?: string } };
  }): React.ReactElement => {
    const temporadaId = props.route?.params?.temporadaId;
    if (!temporadaId) {
      return <Placeholder mensaje="Selecciona una temporada para cerrarla." />;
    }
    return (
      <CierreTemporadaScreen
        temporadaId={temporadaId}
        client={deps.seasonCloseClient}
      />
    );
  };

  return { DigitalCard, Compartir, Notificaciones, CierreTemporada };
}

const styles = StyleSheet.create({
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 12, textAlign: 'center' },
  placeholderText: { fontSize: 15, textAlign: 'center', color: '#555555' },
});
