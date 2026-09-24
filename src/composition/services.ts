// Composition root de la capa de servicios.
//
// Ensambla, en un solo lugar, la capa de persistencia (vía `createRepositories`)
// con los colaboradores (puertos) y construye todos los servicios de dominio
// listos para usar. El resto de la app depende del objeto `AppServices` que
// devuelve, no de cómo se construyó.
//
// Los colaboradores externos que aún no tienen adaptador de producción se
// cablean con los adaptadores de DESARROLLO (`./dev-adapters.js`). Sustituirlos
// por adaptadores reales se hace aquí, sin tocar los servicios.

import {
  createRepositories,
  type CreateRepositoriesOptions,
  type PersistenceContext,
} from '../persistence/index.js';
import type { UUID } from '../domain/types.js';

// Servicios (importados desde su archivo concreto para evitar la ambigüedad de
// los namespaces del barrel de `../services`).
import { AuthService } from '../services/auth/auth-service.js';
import { AccountDeletionService } from '../services/auth/account-deletion-service.js';
import { InMemoryObjectStorage as AuthObjectStorage } from '../services/auth/object-storage.js';
import { SubscriptionService } from '../services/subscription/subscription-service.js';
import { EntitlementsService } from '../services/subscription/entitlements.js';
import { ClassifierService } from '../services/classifier/classifier-service.js';
import { AlbumPreviewService } from '../services/album/preview-service.js';
import { PrefixThumbnailResolver } from '../services/album/thumbnail-resolver.js';
import { CardsService } from '../services/cards/cards-service.js';
import { ConfigAdminService } from '../services/admin/config-admin-service.js';
import { TemporadaClosingService } from '../services/closing/temporada-closing-service.js';
import { NotificationService } from '../services/notifications/notification-service.js';
import { ShippingService } from '../services/shipping/shipping-service.js';
import { PrintEngineService } from '../services/print-engine/print-engine-service.js';
import { ClubService } from '../services/club/club-service.js';
import {
  ApiFootballSportsTransport,
  OnboardingService,
  ResilientSportsApiClient,
  SeasonSyncService,
  UnavailableSportsTransport,
} from '../services/sports/index.js';
import type { SportsApiTransport } from '../services/sports/index.js';
import { InMemoryObjectStorage as MomentosObjectStorage } from '../services/momentos/object-storage.js';
import {
  uploadFoto,
  type UploadFotoInput,
  type UploadFotoResult,
} from '../services/momentos/upload-foto.js';
import { SupabaseObjectStorage } from '../persistence/supabase/object-storage.js';
import type { ObjectStorage as MomentosObjectStoragePort } from '../services/momentos/object-storage.js';
import type { ObjectStorage as AuthObjectStoragePort } from '../services/auth/object-storage.js';

import {
  DevCardComposer,
  DevIAPReceiptValidator,
  DevOperatorNotifier,
  DevPdfRenderer,
  DevProviderVerifier,
  DevPushNotifier,
  DevSportsNotifier,
  DevTempStorage,
} from './dev-adapters.js';

/** Configuración del composition root. */
export interface AppConfig {
  /** Secreto HMAC del access token JWT. DEBE coincidir con el del gateway. */
  readonly accessTokenSecret: string;
  /** TTL del access token en segundos. */
  readonly accessTokenTtlSeconds: number;
  /** TTL del refresh token en segundos. */
  readonly refreshTokenTtlSeconds: number;
  /**
   * API deportiva (opcional). Si no se provee `apiKey`, la sincronización de
   * temporada queda NO disponible (transporte stub que falla con un mensaje
   * claro, sin fingir éxito).
   */
  readonly sports?: {
    readonly provider: 'none' | 'api-football';
    readonly baseUrl?: string;
    readonly apiKey?: string;
  };
}

/** Servicios de dominio ya ensamblados y listos para inyectar en el borde. */
export interface AppServices {
  readonly persistence: PersistenceContext;
  readonly auth: AuthService;
  readonly accountDeletion: AccountDeletionService;
  readonly subscription: SubscriptionService;
  readonly entitlements: EntitlementsService;
  readonly classifier: ClassifierService;
  readonly albumPreview: AlbumPreviewService;
  readonly cards: CardsService;
  readonly configAdmin: ConfigAdminService;
  readonly closing: TemporadaClosingService;
  readonly notifications: NotificationService;
  readonly shipping: ShippingService;
  readonly printEngine: PrintEngineService;
  readonly club: ClubService;
  /**
   * Sincronización de la Temporada del usuario desde la API deportiva
   * (fetch fixture → clasificar → derivar álbum). Si no hay API key configurada,
   * sus llamadas fallan con un mensaje "no disponible" (no finge éxito).
   */
  readonly seasonSync: SeasonSyncService;
  /**
   * Onboarding con datos reales de la API deportiva: buscar equipo, listar sus
   * ligas y persistir el Club real elegido asignándolo al usuario.
   */
  readonly onboarding: OnboardingService;
  /**
   * `true` si hay un proveedor de API deportiva configurado (API key presente).
   * Se expone en `/health` para diagnóstico, sin revelar la key.
   */
  readonly sportsConfigured: boolean;
  /** Almacén de objetos usado por la carga de fotos (Motor_Momentos). */
  readonly momentosStorage: MomentosObjectStoragePort;
  /** Notificador de asociación pendiente para los flujos de sports. */
  readonly sportsNotifier: DevSportsNotifier;
  /**
   * Carga/captura de una foto para un partido (Motor_Momentos), ya cableada con
   * los repositorios y el object storage. Sube el binario y agrupa la Foto en el
   * Momento del partido.
   */
  readonly uploadFoto: (partidoId: UUID, input: UploadFotoInput) => Promise<UploadFotoResult>;
}

/** Opciones de ensamblado del composition root. */
export interface CreateServicesOptions {
  readonly config: AppConfig;
  /** Opciones del selector de persistencia (driver/env/cliente). */
  readonly persistence?: CreateRepositoriesOptions;
}

/**
 * Ensambla la capa de persistencia + colaboradores + servicios y devuelve el
 * agregado `AppServices`. Punto único que conoce las implementaciones concretas.
 */
export function createServices(options: CreateServicesOptions): AppServices {
  const persistence = createRepositories(options.persistence);
  const repos = persistence.repositories;

  // --- Colaboradores (puertos). Reales donde existen; de dev donde no. ---
  const verifier = new DevProviderVerifier();
  const iapValidator = new DevIAPReceiptValidator();
  const cardComposer = new DevCardComposer();
  const pushNotifier = new DevPushNotifier();
  const sportsNotifier = new DevSportsNotifier();
  const pdfRenderer = new DevPdfRenderer();
  const tempStorage = new DevTempStorage();
  const operatorNotifier = new DevOperatorNotifier();
  const thumbnails = new PrefixThumbnailResolver();
  const clock = { now: () => Date.now() };

  // Object storage: con driver Supabase se usa el bucket real (una sola
  // instancia cumple ambas interfaces, upload y delete); en memoria se usan los
  // dobles. Con Supabase, el prefijo por usuario lo aplica cada carga concreta;
  // aquí se usa el cliente compartido (service_role) para el backend de confianza.
  let momentosStorage: MomentosObjectStoragePort;
  let authStorage: AuthObjectStoragePort;
  if (persistence.driver === 'supabase' && persistence.supabase) {
    const supabaseStorage = new SupabaseObjectStorage(persistence.supabase);
    momentosStorage = supabaseStorage;
    authStorage = supabaseStorage;
  } else {
    momentosStorage = new MomentosObjectStorage();
    authStorage = new AuthObjectStorage();
  }

  // --- Servicios ---
  const auth = new AuthService({
    usuarios: repos.usuarios,
    refreshTokens: repos.refreshTokens,
    verifier,
    config: {
      accessTokenSecret: options.config.accessTokenSecret,
      accessTokenTtlSeconds: options.config.accessTokenTtlSeconds,
      refreshTokenTtlSeconds: options.config.refreshTokenTtlSeconds,
    },
  });

  const accountDeletion = new AccountDeletionService({
    repositories: repos,
    objectStorage: authStorage,
  });

  const subscription = new SubscriptionService({
    suscripciones: repos.suscripciones,
    iapValidator,
  });

  const entitlements = new EntitlementsService({
    suscripciones: repos.suscripciones,
  });

  const classifier = new ClassifierService(repos.rivalidades);

  const albumPreview = new AlbumPreviewService({
    albums: repos.albumes,
    recuadros: repos.recuadros,
    fotos: repos.fotos,
    thumbnails,
  });

  // Resuelve el Club dueño de un Momento: Momento -> Partido -> Temporada -> Club.
  const resolverClubId = async (momentoId: UUID): Promise<UUID | null> => {
    const momento = await repos.momentos.findById(momentoId);
    if (momento === null) return null;
    const partido = await repos.partidos.findById(momento.partidoOficialId);
    if (partido === null) return null;
    const temporada = await repos.temporadas.findById(partido.temporadaId);
    return temporada?.clubId ?? null;
  };

  const cards = new CardsService({
    momentos: repos.momentos,
    partidos: repos.partidos,
    recuadros: repos.recuadros,
    fotos: repos.fotos,
    clubs: repos.clubes,
    entitlements,
    composer: cardComposer,
    resolverClubId,
  });

  const configAdmin = new ConfigAdminService({
    configAdmins: repos.configAdmin,
    temporadas: repos.temporadas,
  });

  // PrintEngine se construye antes que Closing (que lo consume como trigger).
  const printEngine = new PrintEngineService({
    albums: repos.albumes,
    recuadros: repos.recuadros,
    fotos: repos.fotos,
    partidos: repos.partidos,
    temporadas: repos.temporadas,
    pedidos: repos.pedidos,
    renderer: pdfRenderer,
    storage: tempStorage,
    notifier: operatorNotifier,
    clock,
  });

  const closing = new TemporadaClosingService({
    temporadas: repos.temporadas,
    albums: repos.albumes,
    recuadros: repos.recuadros,
    printEngine,
  });

  const notifications = new NotificationService({
    usuarios: repos.usuarios,
    temporadas: repos.temporadas,
    albums: repos.albumes,
    recuadros: repos.recuadros,
    direcciones: repos.direcciones,
    pushNotifier,
  });

  const shipping = new ShippingService({
    direcciones: repos.direcciones,
    pedidos: repos.pedidos,
    temporadas: repos.temporadas,
  });

  const club = new ClubService(repos.usuarios, repos.temporadas, repos.clubes);

  // Cliente de la API deportiva: transporte real (API-Football) si hay API key;
  // si no, un transporte stub que falla con "no disponible" (no finge éxito).
  const sportsCfg = options.config.sports;
  const sportsTransport: SportsApiTransport =
    sportsCfg?.provider === 'api-football' && sportsCfg.apiKey
      ? new ApiFootballSportsTransport({
          baseUrl: sportsCfg.baseUrl ?? 'https://v3.football.api-sports.io',
          apiKey: sportsCfg.apiKey,
        })
      : new UnavailableSportsTransport();
  const sportsClient = new ResilientSportsApiClient({ transport: sportsTransport });
  const seasonSync = new SeasonSyncService({
    usuarios: repos.usuarios,
    clubes: repos.clubes,
    temporadas: repos.temporadas,
    albumes: repos.albumes,
    partidos: repos.partidos,
    recuadros: repos.recuadros,
    plantillas: repos.plantillas,
    classifier,
    sportsClient,
  });
  const onboarding = new OnboardingService({
    usuarios: repos.usuarios,
    clubes: repos.clubes,
    plantillas: repos.plantillas,
    sportsClient,
  });

  // Carga de fotos cableada: función de dominio + repos + storage seleccionado.
  const uploadFotoWired = (partidoId: UUID, input: UploadFotoInput): Promise<UploadFotoResult> =>
    uploadFoto(partidoId, input, {
      partidos: repos.partidos,
      momentos: repos.momentos,
      fotos: repos.fotos,
      storage: momentosStorage,
    });

  return {
    persistence,
    auth,
    accountDeletion,
    subscription,
    entitlements,
    classifier,
    albumPreview,
    cards,
    configAdmin,
    closing,
    notifications,
    shipping,
    printEngine,
    club,
    seasonSync,
    onboarding,
    sportsConfigured: sportsCfg?.provider === 'api-football' && Boolean(sportsCfg.apiKey),
    momentosStorage,
    sportsNotifier,
    uploadFoto: uploadFotoWired,
  };
}
