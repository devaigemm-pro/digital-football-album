// Contratos de cliente del backend que consume la App_Móvil (capa de presentación).
//
// La App_Móvil es un cliente delgado (design.md · "App_Móvil (presentación y
// captura)"): no contiene lógica de negocio sensible a la corrección, solo
// consume los contratos lógicos del backend (endpoints REST vía API Gateway).
// Para mantener los view-models framework-agnósticos y unit-testables, la app
// depende de ESTAS interfaces —no de las implementaciones concretas de
// `src/services`—, de modo que en pruebas se sustituyen por clientes en memoria
// y en producción por un adaptador HTTP.
//
// Las formas de datos reflejan los contratos del backend:
//   - `ClubClient.asignarClub` ↔ `PUT /usuario/club` → `IdentidadVisual`
//     (src/services/club · ClubService.asignarClub).
//   - `CaptureClient.uploadFoto` ↔ `POST /momentos/{partidoId}/fotos`
//     (src/services/momentos · uploadFoto).
//   - `CaptureClient.setFotoPrincipal` ↔ `PUT /recuadros/{recuadroId}/foto-principal`
//     (src/services/momentos · setFotoPrincipal).
//   - `CaptureClient.updateMomento` ↔ `PATCH /momentos/{momentoId}`
//     (src/services/momentos · updateMomento).
//   - `CardsClient.generateCard` ↔ `POST /cards` → `DigitalCard`
//     (src/services/cards · CardsService.generateCard).
//
// Task 21.1 — Requirements: 2.1, 2.2, 5.1, 5.2, 6.1
// Task 21.2 — Requirements: 13.1, 13.2

import type {
  ContextoAsistencia,
  Foto,
  Momento,
  Recuadro,
  SubModalidadTransmision,
  UUID,
} from '../domain/types.js';

/**
 * Identidad visual del Club que el backend devuelve al asignar/cambiar de Club
 * (Req 2.1, 2.2). Coincide con `IdentidadVisual` de `src/services/club`, pero se
 * redeclara aquí para que la capa de app no dependa en tipos de la capa de
 * servicios (mantiene la app como cliente delgado desacoplado).
 */
export interface IdentidadVisual {
  readonly clubId: UUID;
  readonly nombre: string;
  readonly paletaColores: {
    readonly primario: string;
    readonly secundario: string;
    readonly acento?: string;
  };
  readonly escudoUrl: string;
  readonly activosVisuales: {
    readonly estadioUrls: readonly string[];
    readonly camisetaUrls: readonly string[];
  };
}

/**
 * Cliente del Servicio de Personalización / Selección de Club (Req 2.1, 2.2).
 * Asigna el Club del usuario y devuelve la identidad visual a aplicar en la UI.
 */
export interface ClubClient {
  /**
   * Asigna/cambia el Club del usuario (`PUT /usuario/club`) y devuelve la
   * identidad visual del Club para personalizar la interfaz (Req 2.1, 2.2).
   */
  asignarClub(usuarioId: UUID, clubId: UUID): Promise<IdentidadVisual>;
}

/** Origen de la fotografía: galería del dispositivo (Req 5.1) o cámara (Req 5.2). */
export type FuenteFoto = 'galeria' | 'camara';

/** Datos de una fotografía a cargar/capturar (`POST /momentos/{partidoId}/fotos`). */
export interface UploadFotoInput {
  /** Origen: galería (Req 5.1) o cámara (Req 5.2). */
  readonly fuente: FuenteFoto;
  /** Bytes del binario de la foto. */
  readonly binario: Uint8Array;
  /** Ancho en píxeles. */
  readonly anchoPx: number;
  /** Alto en píxeles. */
  readonly altoPx: number;
}

/**
 * Parche de contexto de asistencia de un Momento (`PATCH /momentos/{momentoId}`).
 * Solo los campos presentes se envían (Req 6.1).
 */
export interface MomentoContextoInput {
  /** Contexto de asistencia: En Vivo Local / Visita / Transmisión (Req 6.1). */
  readonly contextoAsistencia?: ContextoAsistencia;
  /** Sub-modalidad de Transmisión; `null` la limpia (Req 6.4). */
  readonly subModalidad?: SubModalidadTransmision | null;
  /** Verificación por geolocalización en contextos En Vivo (Req 6.2). */
  readonly geoVerificado?: boolean;
  /** Notas / bitácora personal (Req 7.1). */
  readonly notas?: string;
  /** Jugador_del_Partido; `null` lo limpia (Req 8.1). */
  readonly jugadorDelPartido?: string | null;
}

/**
 * Cliente del Motor_Momentos para captura y contexto (Req 5.1, 5.2, 6.1). Cubre
 * la carga/captura de fotos, la selección de Foto_Principal y el marcado del
 * contexto de asistencia.
 */
export interface CaptureClient {
  /** Sube/captura una foto para el partido (`POST /momentos/{partidoId}/fotos`) (Req 5.1, 5.2). */
  uploadFoto(partidoId: UUID, input: UploadFotoInput): Promise<Foto>;
  /** Marca la única Foto_Principal del Recuadro (`PUT /recuadros/{id}/foto-principal`) (Req 5.5). */
  setFotoPrincipal(recuadroId: UUID, fotoId: UUID): Promise<Recuadro>;
  /** Aplica el parche de contexto de asistencia al Momento (`PATCH /momentos/{id}`) (Req 6.1). */
  updateMomento(momentoId: UUID, patch: MomentoContextoInput): Promise<Momento>;
}

/**
 * Digital_Card generada por el backend que la app comparte a redes (Req 12.2,
 * 13.2). Coincide con `CardArtefacto` de `src/services/cards`.
 */
export interface DigitalCard {
  /** Referencia al binario de la imagen compuesta en object storage. */
  readonly objectKey: string;
  /** Formato compatible con las plataformas de destino (Req 12.2). */
  readonly formato: 'PNG' | 'JPEG';
}

/** Cliente del Generador_Cards (`POST /cards`) (Req 12.1, 12.2). */
export interface CardsClient {
  /** Genera la Digital_Card de un Momento para el usuario dado. */
  generateCard(usuarioId: UUID, momentoId: UUID): Promise<DigitalCard>;
}
