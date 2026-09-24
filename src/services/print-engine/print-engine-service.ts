// Print_Engine: orquestación transaccional de la generación del kit de impresión
// (Req 16.5, 17, 18, 19.1).
//
// Implementa el contrato `generarKit(temporadaId, entitlements)` del design.md
// ("Print_Engine"), atando:
//   1. Escala/validación a ≥300 DPI de cada Foto_Principal (Req 19.1, Task 15.1).
//   2. Composición del PDF_Libro (Req 16.5, 17.1–17.4, Task 15.2).
//   3. Composición del PDF_Stickers con numeración heredada (Req 18.1–18.6, Task 15.3).
//   4. Validación de biunivocidad y DPI antes de publicar; generación atómica
//      contra almacenamiento temporal; aborto sin PDF parcial + notificación
//      (Req 18.4, 18.7, 18.8, Task 15.4).
//   5. Recuperación de impresión fallida: reintento automático acotado (≤3 con
//      backoff, contando `Pedido.intentosImpresion`); tras agotarlos, Temporada/
//      Pedido → `FALLIDA` y alerta al operador, permitiendo relanzar (Req 18.7,
//      18.8, Task 15.5).
//
// Implementa además `PrintEngineTrigger` (de ../closing) para poder cablearse al
// servicio de cierre de Temporada sin acoplarlos: el cierre dispara
// `triggerGeneracion`, que delega en `generarKit`.
//
// Todas las dependencias (repositorios, reloj, renderer, almacenamiento
// temporal, notificador) se inyectan para ejercitar el servicio con los dobles
// en memoria y mocks del renderer, sin PostgreSQL ni motor de PDF vivos.
//
// Task 15.4, 15.5 — Requirements: 16.5, 17.1–17.4, 18.1–18.8, 19.1

import type { Foto, PartidoOficial, Recuadro, UUID } from '../../domain/types.js';
import type {
  AlbumRepository,
  FotoRepository,
  PartidoOficialRepository,
  PedidoRepository,
  RecuadroRepository,
  TemporadaRepository,
} from '../../persistence/repositories.js';
import type {
  PrintEngineTrigger,
  PrintEngineTriggerInput,
} from '../closing/temporada-closing-service.js';
import type { Entitlements } from '../subscription/entitlements.js';
import { validarBiunivocidad } from './biunivocity.js';
import { validateFotoDpi } from './dpi.js';
import { buildPdfLibroSpec, type PaginaClub } from './pdf-libro.js';
import { buildPdfStickersSpec, FotoPrincipalNoResoluble } from './pdf-stickers.js';
import type {
  MotivoAborto,
  OperatorNotifier,
  PdfArtefacto,
  PdfRenderer,
  PublishResult,
  TempStorage,
} from './renderer.js';

/** Número máximo de intentos de generación (el inicial + reintentos ≤3 total) (Req 18.7). */
export const MAX_INTENTOS_IMPRESION = 3;

/** Backoff base en milisegundos entre reintentos (crece linealmente por intento). */
export const BACKOFF_BASE_MS = 1000;

/**
 * Se lanza cuando la generación abortó de forma persistente tras agotar los
 * reintentos. Señala que la Temporada/Pedido quedó en `FALLIDA` y se alertó al
 * operador (Req 18.7, 18.8). La capa API la mapea a un estado de fallo
 * relanzable.
 */
export class PrintEngineFallidaError extends Error {
  constructor(
    public readonly temporadaId: UUID,
    public readonly motivo: MotivoAborto,
    public readonly intentos: number,
    message: string,
  ) {
    super(message);
    this.name = 'PrintEngineFallidaError';
  }
}

/** Error de dominio: la Temporada referenciada no tiene Álbum (no puede imprimirse). */
export class AlbumNoEncontradoError extends Error {
  constructor(public readonly temporadaId: UUID) {
    super(`La Temporada ${temporadaId} no tiene Álbum; no hay nada que imprimir.`);
    this.name = 'AlbumNoEncontradoError';
  }
}

/** Resultado exitoso de `generarKit`: el kit publicado atómicamente (Req 18.7). */
export interface GenerarKitResultado {
  readonly publicado: PublishResult;
  /** Intentos consumidos hasta el éxito (≥1). */
  readonly intentos: number;
}

/** Reloj inyectable (epoch ms), para determinismo en pruebas. */
export interface Clock {
  now(): number;
}

/**
 * Espera de backoff inyectable. Por defecto no espera (para pruebas rápidas y
 * deterministas); en producción se inyecta una que retrasa `ms` milisegundos.
 */
export type Sleep = (ms: number) => Promise<void>;

/**
 * Proveedor de las páginas del Club (fondos + estadísticas) del PDF_Libro
 * (Req 17.1). Se inyecta para no acoplar el motor a la fuente de estos activos.
 */
export type PaginasClubProvider = (temporadaId: UUID) => Promise<readonly PaginaClub[]>;

/** Dependencias inyectadas del Print_Engine. */
export interface PrintEngineDeps {
  readonly albums: AlbumRepository;
  readonly recuadros: RecuadroRepository;
  readonly fotos: FotoRepository;
  readonly partidos: PartidoOficialRepository;
  readonly temporadas: TemporadaRepository;
  readonly pedidos: PedidoRepository;
  readonly renderer: PdfRenderer;
  readonly storage: TempStorage;
  readonly notifier: OperatorNotifier;
  readonly clock: Clock;
  /** Espera de backoff entre reintentos (por defecto, sin espera). */
  readonly sleep?: Sleep;
  /** Provee las páginas del Club del PDF_Libro (por defecto, una página vacía). */
  readonly paginasClub?: PaginasClubProvider;
}

/**
 * Error interno que transporta el motivo de aborto de un intento, para decidir
 * la alerta y la clasificación al agotar reintentos. No se expone fuera del
 * módulo: el fallo persistente se reporta como `PrintEngineFallidaError`.
 */
class AbortoIntentoError extends Error {
  constructor(
    public readonly motivo: MotivoAborto,
    message: string,
  ) {
    super(message);
    this.name = 'AbortoIntentoError';
  }
}

/**
 * Print_Engine transaccional. Genera el PDF_Libro y el PDF_Stickers de una
 * Temporada cerrada de forma atómica, con validación de biunivocidad y DPI, y
 * recuperación acotada ante fallos.
 */
export class PrintEngineService implements PrintEngineTrigger {
  private readonly albums: AlbumRepository;
  private readonly recuadros: RecuadroRepository;
  private readonly fotos: FotoRepository;
  private readonly partidos: PartidoOficialRepository;
  private readonly temporadas: TemporadaRepository;
  private readonly pedidos: PedidoRepository;
  private readonly renderer: PdfRenderer;
  private readonly storage: TempStorage;
  private readonly notifier: OperatorNotifier;
  private readonly clock: Clock;
  private readonly sleep: Sleep;
  private readonly paginasClub: PaginasClubProvider;

  constructor(deps: PrintEngineDeps) {
    this.albums = deps.albums;
    this.recuadros = deps.recuadros;
    this.fotos = deps.fotos;
    this.partidos = deps.partidos;
    this.temporadas = deps.temporadas;
    this.pedidos = deps.pedidos;
    this.renderer = deps.renderer;
    this.storage = deps.storage;
    this.notifier = deps.notifier;
    this.clock = deps.clock;
    this.sleep = deps.sleep ?? (() => Promise.resolve());
    this.paginasClub = deps.paginasClub ?? (() => Promise.resolve([] as readonly PaginaClub[]));
  }

  /**
   * Implementación de `PrintEngineTrigger`: disparo desde el cierre de Temporada
   * (Req 16.3, 16.4). Delega en `generarKit`. Los derechos de holograma no se
   * conocen en el disparo por cierre, por lo que se derivan como denegados
   * (Plan_Básico) por defecto salvo que el cableado provea otra fuente; el flujo
   * de producción invoca `generarKit` con los entitlements resueltos.
   */
  async triggerGeneracion(entrada: PrintEngineTriggerInput): Promise<void> {
    await this.generarKit(entrada.temporadaId, {
      digitalCardsInternacional: false,
      holograma: false,
    });
  }

  /**
   * Orquesta la generación completa del kit de impresión de una Temporada
   * cerrada (Req 16.5, 17, 18, 19.1).
   *
   * Ejecuta hasta `MAX_INTENTOS_IMPRESION` intentos con backoff creciente
   * (Req 18.7). Cada intento:
   *   1. Valida DPI de cada Foto_Principal (Req 19.1); fallo → aborta el intento.
   *   2. Compone y renderiza el PDF_Libro y el PDF_Stickers a almacenamiento
   *      temporal (Req 17, 18.1–18.6); cualquier fallo de render → aborta el intento.
   *   3. Valida biunivocidad (Req 18.4); discrepancia → aborta el intento.
   *   4. Publica atómicamente el kit sólo si TODO pasó (Req 18.7).
   *
   * Al abortar un intento se descartan los artefactos temporales (nunca queda un
   * PDF parcial — Property 28) y se incrementa `Pedido.intentosImpresion`. Si se
   * agotan los intentos, la Temporada y el Pedido pasan a `FALLIDA`, se alerta al
   * operador y se notifica al usuario (Req 18.7, 18.8), lanzando
   * `PrintEngineFallidaError` (relanzable por el operador).
   *
   * @throws {AlbumNoEncontradoError} si la Temporada no tiene Álbum.
   * @throws {PrintEngineFallidaError} si el fallo persiste tras agotar reintentos.
   */
  async generarKit(temporadaId: UUID, entitlements: Entitlements): Promise<GenerarKitResultado> {
    const album = await this.albums.findByTemporadaId(temporadaId);
    if (album === null) {
      throw new AlbumNoEncontradoError(temporadaId);
    }

    let ultimoMotivo: MotivoAborto = 'PROCESAMIENTO';
    let ultimoMensaje = 'La generación no se completó.';

    for (let intento = 1; intento <= MAX_INTENTOS_IMPRESION; intento += 1) {
      if (intento > 1) {
        // Backoff creciente entre reintentos (Req 18.7).
        await this.sleep(BACKOFF_BASE_MS * (intento - 1));
      }

      try {
        const publicado = await this.ejecutarIntento(temporadaId, album.id, entitlements);
        // Éxito: registrar el intento consumido y devolver el kit publicado.
        await this.registrarIntento(temporadaId);
        return { publicado, intentos: intento };
      } catch (error) {
        // Contabilizar el intento fallido (Pedido.intentosImpresion) (Req 18.7).
        await this.registrarIntento(temporadaId);

        if (error instanceof AbortoIntentoError) {
          ultimoMotivo = error.motivo;
          ultimoMensaje = error.message;
          continue;
        }
        // Fallo inesperado del render/almacenamiento: tratar como procesamiento.
        ultimoMotivo = 'PROCESAMIENTO';
        ultimoMensaje = error instanceof Error ? error.message : 'Fallo de procesamiento.';
        continue;
      }
    }

    // Persistente tras agotar reintentos: FALLIDA + alerta al operador (Req 18.7, 18.8).
    await this.marcarFallida(temporadaId, ultimoMotivo, ultimoMensaje);
    throw new PrintEngineFallidaError(
      temporadaId,
      ultimoMotivo,
      MAX_INTENTOS_IMPRESION,
      ultimoMensaje,
    );
  }

  /**
   * Ejecuta un intento completo contra almacenamiento temporal y publica el kit
   * si todas las validaciones pasan. Ante cualquier discrepancia/fallo, descarta
   * los artefactos temporales (atomicidad — Property 28) y lanza
   * `AbortoIntentoError` con el motivo.
   */
  private async ejecutarIntento(
    temporadaId: UUID,
    albumId: UUID,
    entitlements: Entitlements,
  ): Promise<PublishResult> {
    const recuadros = await this.recuadros.findByAlbumId(albumId);
    const fotoPorId = await this.cargarFotosPrincipales(recuadros);

    // 1. Validación de DPI de cada Foto_Principal (Req 19.1). No renderiza nada
    //    hasta confirmar que todas las fotos alcanzan los 300 DPI.
    for (const recuadro of recuadros) {
      if (recuadro.fotoPrincipalId === null) {
        continue;
      }
      const foto = fotoPorId.get(recuadro.fotoPrincipalId);
      if (foto === undefined) {
        throw new AbortoIntentoError(
          'PROCESAMIENTO',
          `No existe la Foto_Principal ${recuadro.fotoPrincipalId} del Recuadro ${recuadro.id}.`,
        );
      }
      const dpi = validateFotoDpi(foto, recuadro);
      if (!dpi.cumple) {
        throw new AbortoIntentoError(
          'DPI',
          `La Foto_Principal del Recuadro número ${recuadro.numero} no alcanza ${dpi.minimo} DPI ` +
            `(ancho ${dpi.dpiAncho.toFixed(1)} DPI, alto ${dpi.dpiAlto.toFixed(1)} DPI).`,
        );
      }
    }

    const partidoPorId = await this.cargarPartidos(recuadros);
    const resolverFoto = (fotoPrincipalId: UUID): string | null =>
      fotoPorId.get(fotoPrincipalId)?.objectKey ?? null;

    // 2. Composición y render a almacenamiento temporal (Req 17, 18.1–18.6).
    const artefactos: PdfArtefacto[] = [];
    try {
      const paginasClub = await this.paginasClub(temporadaId);
      const libroSpec = buildPdfLibroSpec({
        temporadaId,
        recuadros,
        paginasClub,
        resolverFoto,
      });
      const stickersSpec = buildPdfStickersSpec({
        temporadaId,
        recuadros,
        partidoPorId,
        entitlements,
        resolverFoto,
      });

      // 3. Validación de biunivocidad ANTES de publicar (Req 18.4). Se valida
      //    sobre la spec ya compuesta para garantizar que refleja lo que se
      //    renderizó.
      const biunivocidad = validarBiunivocidad(recuadros, stickersSpec.stickers);
      if (!biunivocidad.esBiunivoca) {
        const detalle = biunivocidad.discrepancias.map((d) => d.mensaje).join(' ');
        throw new AbortoIntentoError(
          'BIUNIVOCIDAD',
          `Discrepancia de correspondencia Recuadro↔Sticker: ${detalle}`,
        );
      }

      const libro = await this.renderer.renderLibro(libroSpec);
      artefactos.push(libro);
      const stickers = await this.renderer.renderStickers(stickersSpec);
      artefactos.push(stickers);

      // 4. Publicación atómica del kit completo (Req 18.7).
      return await this.storage.publish(temporadaId, artefactos);
    } catch (error) {
      // Atomicidad: descartar cualquier artefacto temporal ya producido; nunca
      // se publica un PDF parcial (Property 28, Req 18.7, 18.8).
      await this.storage.discard(artefactos);

      if (error instanceof AbortoIntentoError) {
        throw error;
      }
      if (error instanceof FotoPrincipalNoResoluble) {
        throw new AbortoIntentoError('PROCESAMIENTO', error.message);
      }
      // Fallo de render/almacenamiento: fallo de procesamiento (Req 18.8).
      throw new AbortoIntentoError(
        'PROCESAMIENTO',
        error instanceof Error ? error.message : 'Fallo durante el procesamiento del PDF.',
      );
    }
  }

  /**
   * Incrementa `Pedido.intentosImpresion` de la Temporada (Req 18.7). Si aún no
   * existe Pedido, no falla (el conteo se materializa cuando el Pedido exista);
   * el motor sigue siendo utilizable en flujos sin Pedido creado todavía.
   */
  private async registrarIntento(temporadaId: UUID): Promise<void> {
    const pedido = await this.pedidos.findByTemporadaId(temporadaId);
    if (pedido === null) {
      return;
    }
    await this.pedidos.update(pedido.id, {
      intentosImpresion: pedido.intentosImpresion + 1,
    });
  }

  /**
   * Transición a `FALLIDA` de la Temporada y del Pedido, alerta al operador y
   * notificación al usuario (Req 18.7, 18.8). El operador puede relanzar la
   * generación desde `FALLIDA` (design.md · "Fallida → Impresion").
   */
  private async marcarFallida(
    temporadaId: UUID,
    motivo: MotivoAborto,
    mensaje: string,
  ): Promise<void> {
    const temporada = await this.temporadas.findById(temporadaId);
    if (temporada !== null) {
      await this.temporadas.update(temporadaId, { estado: 'FALLIDA' });
    }

    const pedido = await this.pedidos.findByTemporadaId(temporadaId);
    const intentos = pedido?.intentosImpresion ?? MAX_INTENTOS_IMPRESION;
    if (pedido !== null) {
      await this.pedidos.update(pedido.id, { estado: 'FALLIDA' });
    }

    await this.notifier.alertarOperador({
      temporadaId,
      motivo,
      mensaje,
      intentos,
      emitidaEn: this.clock.now(),
    });
    await this.notifier.notificarUsuario(
      temporadaId,
      `La generación de los archivos de impresión no se completó: ${mensaje}`,
    );
  }

  /** Carga en un mapa las Foto_Principal referenciadas por los Recuadros. */
  private async cargarFotosPrincipales(recuadros: readonly Recuadro[]): Promise<Map<UUID, Foto>> {
    const mapa = new Map<UUID, Foto>();
    for (const recuadro of recuadros) {
      if (recuadro.fotoPrincipalId === null || mapa.has(recuadro.fotoPrincipalId)) {
        continue;
      }
      const foto = await this.fotos.findById(recuadro.fotoPrincipalId);
      if (foto !== null) {
        mapa.set(recuadro.fotoPrincipalId, foto);
      }
    }
    return mapa;
  }

  /** Carga en un mapa los Partido_Oficial referenciados por los Recuadros. */
  private async cargarPartidos(recuadros: readonly Recuadro[]): Promise<Map<UUID, PartidoOficial>> {
    const mapa = new Map<UUID, PartidoOficial>();
    for (const recuadro of recuadros) {
      if (mapa.has(recuadro.partidoOficialId)) {
        continue;
      }
      const partido = await this.partidos.findById(recuadro.partidoOficialId);
      if (partido !== null) {
        mapa.set(recuadro.partidoOficialId, partido);
      }
    }
    return mapa;
  }
}
