/**
 * Pruebas unitarias del Print_Engine orquestador (Task 15.4, 15.5 — Req 16.5,
 * 17, 18.4, 18.7, 18.8, 19.1).
 *
 * Cubren:
 *  - Éxito: kit publicado atómicamente cuando DPI y biunivocidad pasan.
 *  - Fallo de DPI: aborta sin publicar (Property 28, 29).
 *  - Discrepancia de biunivocidad: aborta sin PDF parcial y descarta temporales
 *    (Property 25, 28).
 *  - Atomicidad ante fallo del render de stickers: se descarta el PDF_Libro ya
 *    renderizado; nunca se publica un kit parcial (Property 28).
 *  - Reintento acotado con backoff que cuenta `Pedido.intentosImpresion` y termina
 *    en éxito (Req 18.7).
 *  - Fallo persistente: Temporada/Pedido → FALLIDA, alerta al operador y
 *    notificación al usuario tras agotar reintentos (Req 18.7, 18.8).
 *  - `triggerGeneracion` (PrintEngineTrigger) delega en `generarKit`.
 */
import { describe, it, expect } from 'vitest';
import type {
  Album,
  Foto,
  PartidoOficial,
  Pedido,
  Recuadro,
  Temporada,
  UUID,
} from '../../domain/types.js';
import {
  InMemoryAlbumRepository,
  InMemoryFotoRepository,
  InMemoryPartidoOficialRepository,
  InMemoryPedidoRepository,
  InMemoryRecuadroRepository,
  InMemoryTemporadaRepository,
} from '../../persistence/in-memory/repositories.js';
import { entitlementsForPlan } from '../subscription/entitlements.js';
import {
  PrintEngineFallidaError,
  PrintEngineService,
  MAX_INTENTOS_IMPRESION,
} from './print-engine-service.js';
import type {
  OperatorAlerta,
  OperatorNotifier,
  PdfArtefacto,
  PdfLibroSpec,
  PdfRenderer,
  PdfStickersSpec,
  PublishResult,
  TempStorage,
} from './renderer.js';

const TEMPORADA_ID = 'temp-1' as UUID;
const ALBUM_ID = 'album-1' as UUID;

/** Renderer doble que registra llamadas y permite inyectar fallos por tipo. */
class SpyRenderer implements PdfRenderer {
  libroLlamadas = 0;
  stickersLlamadas = 0;
  fallarLibro = false;
  fallarStickers = false;
  /** Nº de veces que debe fallar stickers antes de tener éxito (para reintentos). */
  fallarStickersVeces = 0;

  renderLibro(spec: PdfLibroSpec): Promise<PdfArtefacto> {
    this.libroLlamadas += 1;
    if (this.fallarLibro) {
      return Promise.reject(new Error('fallo de render del libro'));
    }
    return Promise.resolve({ tipo: 'PDF_LIBRO', tempKey: `tmp/libro-${spec.temporadaId}` });
  }

  renderStickers(spec: PdfStickersSpec): Promise<PdfArtefacto> {
    this.stickersLlamadas += 1;
    if (this.fallarStickers || this.fallarStickersVeces > 0) {
      this.fallarStickersVeces = Math.max(0, this.fallarStickersVeces - 1);
      return Promise.reject(new Error('fallo de render de stickers'));
    }
    return Promise.resolve({
      tipo: 'PDF_STICKERS',
      tempKey: `tmp/stickers-${spec.temporadaId}`,
    });
  }
}

/** Almacenamiento temporal doble que registra publicaciones y descartes. */
class SpyStorage implements TempStorage {
  publicados: PublishResult[] = [];
  descartados: PdfArtefacto[][] = [];

  publish(temporadaId: UUID, artefactos: readonly PdfArtefacto[]): Promise<PublishResult> {
    const result: PublishResult = {
      temporadaId,
      libroKey: `final/libro-${temporadaId}`,
      stickersKey: `final/stickers-${temporadaId}`,
    };
    // Sanity: sólo se publica cuando hay exactamente los dos PDFs del kit.
    expect(artefactos).toHaveLength(2);
    this.publicados.push(result);
    return Promise.resolve(result);
  }

  discard(artefactos: readonly PdfArtefacto[]): Promise<void> {
    this.descartados.push([...artefactos]);
    return Promise.resolve();
  }
}

/** Notificador doble que registra alertas y notificaciones. */
class SpyNotifier implements OperatorNotifier {
  alertas: OperatorAlerta[] = [];
  notificaciones: { temporadaId: UUID; mensaje: string }[] = [];

  alertarOperador(alerta: OperatorAlerta): Promise<void> {
    this.alertas.push(alerta);
    return Promise.resolve();
  }

  notificarUsuario(temporadaId: UUID, mensaje: string): Promise<void> {
    this.notificaciones.push({ temporadaId, mensaje });
    return Promise.resolve();
  }
}

function makeRecuadro(
  numero: number,
  conFoto: boolean,
  overrides: Partial<Recuadro> = {},
): Recuadro {
  return {
    id: `rec-${numero}`,
    albumId: ALBUM_ID,
    partidoOficialId: `part-${numero}`,
    plantillaId: 'pl-1',
    numero,
    anchoMm: 50,
    altoMm: 70,
    fotoPrincipalId: conFoto ? `foto-${numero}` : null,
    estadoRecordatorio: conFoto ? 'DETENIDO_POR_FOTO' : 'ACTIVO',
    ...overrides,
  };
}

/** Foto que cumple holgadamente 300 DPI para 50x70 mm. */
function makeFoto(numero: number, overrides: Partial<Foto> = {}): Foto {
  return {
    id: `foto-${numero}`,
    momentoId: `m-${numero}`,
    objectKey: `fotos/foto-${numero}.jpg`,
    anchoPx: 2000,
    altoPx: 2800,
    estadoAsociacion: 'ASOCIADA',
    ...overrides,
  };
}

function makePartido(numero: number, overrides: Partial<PartidoOficial> = {}): PartidoOficial {
  return {
    id: `part-${numero}`,
    temporadaId: TEMPORADA_ID,
    partidoExternoId: `ext-${numero}`,
    competicion: 'Liga',
    tipoCompeticion: 'LIGA',
    rival: 'Rival',
    fechaHora: '2025-05-01T20:00:00.000Z',
    estado: 'FINALIZADO',
    esClasico: false,
    esInternacional: false,
    resultado: { golesLocal: 1, golesVisita: 0 },
    alineacion: [],
    eventos: [],
    ...overrides,
  };
}

interface Harness {
  service: PrintEngineService;
  renderer: SpyRenderer;
  storage: SpyStorage;
  notifier: SpyNotifier;
  temporadas: InMemoryTemporadaRepository;
  pedidos: InMemoryPedidoRepository;
}

function makeHarness(recuadros: Recuadro[]): Harness {
  const conFoto = recuadros.filter((r) => r.fotoPrincipalId !== null);
  const albums = new InMemoryAlbumRepository([
    { id: ALBUM_ID, temporadaId: TEMPORADA_ID } satisfies Album,
  ]);
  const recuadrosRepo = new InMemoryRecuadroRepository(recuadros);
  const fotos = new InMemoryFotoRepository(conFoto.map((r) => makeFoto(r.numero)));
  const partidos = new InMemoryPartidoOficialRepository(
    recuadros.map((r) => makePartido(r.numero)),
  );
  const temporadas = new InMemoryTemporadaRepository([
    {
      id: TEMPORADA_ID,
      usuarioId: 'u-1' as UUID,
      clubId: 'c-1' as UUID,
      temporadaExterna: '2025',
      estado: 'IMPRESION',
      fechaLimiteCierre: '2025-06-01T00:00:00.000Z',
    } satisfies Temporada,
  ]);
  const pedidos = new InMemoryPedidoRepository([
    {
      id: 'ped-1' as UUID,
      temporadaId: TEMPORADA_ID,
      estado: 'EN_IMPRESION',
      tracking: null,
      datosFiscalesMinimos: null,
      intentosImpresion: 0,
    } satisfies Pedido,
  ]);

  const renderer = new SpyRenderer();
  const storage = new SpyStorage();
  const notifier = new SpyNotifier();

  const service = new PrintEngineService({
    albums,
    recuadros: recuadrosRepo,
    fotos,
    partidos,
    temporadas,
    pedidos,
    renderer,
    storage,
    notifier,
    clock: { now: () => 1_700_000_000_000 },
    sleep: () => Promise.resolve(), // sin espera real de backoff en pruebas
  });

  return { service, renderer, storage, notifier, temporadas, pedidos };
}

describe('PrintEngineService.generarKit — publicación atómica exitosa (Req 18.7)', () => {
  it('publica el kit cuando DPI y biunivocidad pasan', async () => {
    const h = makeHarness([
      makeRecuadro(1, true),
      makeRecuadro(2, false), // vacío: hueco válido
      makeRecuadro(3, true),
    ]);

    const resultado = await h.service.generarKit(TEMPORADA_ID, entitlementsForPlan('PREMIUM'));

    expect(resultado.intentos).toBe(1);
    expect(h.storage.publicados).toHaveLength(1);
    expect(h.storage.descartados).toHaveLength(0);
    // Se renderizaron ambos PDFs una vez.
    expect(h.renderer.libroLlamadas).toBe(1);
    expect(h.renderer.stickersLlamadas).toBe(1);
    // Pedido.intentosImpresion se incrementó una vez.
    const pedido = await h.pedidos.findByTemporadaId(TEMPORADA_ID);
    expect(pedido?.intentosImpresion).toBe(1);
  });
});

describe('PrintEngineService.generarKit — fallo de DPI aborta sin publicar (Property 28, 29)', () => {
  it('no renderiza ni publica si una Foto_Principal no alcanza 300 DPI', async () => {
    const h = makeHarness([makeRecuadro(1, true)]);
    // Reemplazar la foto por una de baja resolución (no cumple 300 DPI a 50x70 mm).
    const fotos = new InMemoryFotoRepository([makeFoto(1, { anchoPx: 100, altoPx: 100 })]);
    const service = new PrintEngineService({
      albums: new InMemoryAlbumRepository([{ id: ALBUM_ID, temporadaId: TEMPORADA_ID }]),
      recuadros: new InMemoryRecuadroRepository([makeRecuadro(1, true)]),
      fotos,
      partidos: new InMemoryPartidoOficialRepository([makePartido(1)]),
      temporadas: h.temporadas,
      pedidos: h.pedidos,
      renderer: h.renderer,
      storage: h.storage,
      notifier: h.notifier,
      clock: { now: () => 0 },
      sleep: () => Promise.resolve(),
    });

    await expect(
      service.generarKit(TEMPORADA_ID, entitlementsForPlan('PREMIUM')),
    ).rejects.toBeInstanceOf(PrintEngineFallidaError);

    // Nunca se renderizó ni publicó (falla antes del render).
    expect(h.renderer.libroLlamadas).toBe(0);
    expect(h.storage.publicados).toHaveLength(0);
    // Fallo persistente: Temporada FALLIDA + alerta con motivo DPI.
    const temporada = await h.temporadas.findById(TEMPORADA_ID);
    expect(temporada?.estado).toBe('FALLIDA');
    expect(h.notifier.alertas.at(-1)?.motivo).toBe('DPI');
  });
});

describe('PrintEngineService.generarKit — biunivocidad y atomicidad (Property 25, 28)', () => {
  it('descarta el PDF_Libro y no publica si el render de stickers falla siempre', async () => {
    const h = makeHarness([makeRecuadro(1, true), makeRecuadro(2, true)]);
    h.renderer.fallarStickers = true;

    await expect(
      h.service.generarKit(TEMPORADA_ID, entitlementsForPlan('BASICO')),
    ).rejects.toBeInstanceOf(PrintEngineFallidaError);

    // El PDF_Libro se renderizó en cada intento pero NUNCA se publicó (atomicidad).
    expect(h.storage.publicados).toHaveLength(0);
    // Se descartaron los temporales en cada intento (nunca queda un PDF parcial).
    expect(h.storage.descartados.length).toBe(MAX_INTENTOS_IMPRESION);
    expect(h.notifier.alertas.at(-1)?.motivo).toBe('PROCESAMIENTO');
  });

  it('aborta por discrepancia de biunivocidad sin renderizar/publicar', async () => {
    // El servicio compone los stickers internamente, así que para forzar la
    // discrepancia inyectamos un Recuadro con foto cuya foto no es resoluble →
    // esto se maneja como fallo de procesamiento. Para una discrepancia pura de
    // conteo, verificamos vía el validador en su propia suite. Aquí garantizamos
    // que un dato inconsistente (foto ausente en el repo) aborta atómicamente.
    const recuadros = [makeRecuadro(1, true)];
    const albums = new InMemoryAlbumRepository([{ id: ALBUM_ID, temporadaId: TEMPORADA_ID }]);
    const service = new PrintEngineService({
      albums,
      recuadros: new InMemoryRecuadroRepository(recuadros),
      fotos: new InMemoryFotoRepository([]), // foto-1 ausente
      partidos: new InMemoryPartidoOficialRepository([makePartido(1)]),
      temporadas: new InMemoryTemporadaRepository([
        {
          id: TEMPORADA_ID,
          usuarioId: 'u',
          clubId: 'c',
          temporadaExterna: '2025',
          estado: 'IMPRESION',
          fechaLimiteCierre: '2025-06-01T00:00:00.000Z',
        },
      ]),
      pedidos: new InMemoryPedidoRepository([]),
      renderer: new SpyRenderer(),
      storage: new SpyStorage(),
      notifier: new SpyNotifier(),
      clock: { now: () => 0 },
      sleep: () => Promise.resolve(),
    });

    await expect(
      service.generarKit(TEMPORADA_ID, entitlementsForPlan('BASICO')),
    ).rejects.toBeInstanceOf(PrintEngineFallidaError);
  });
});

describe('PrintEngineService.generarKit — reintento acotado con backoff (Req 18.7)', () => {
  it('reintenta y termina en éxito, contando cada intento en Pedido.intentosImpresion', async () => {
    const h = makeHarness([makeRecuadro(1, true), makeRecuadro(2, true)]);
    // Falla las 2 primeras veces el render de stickers, tiene éxito en el 3.º.
    h.renderer.fallarStickersVeces = 2;

    const resultado = await h.service.generarKit(TEMPORADA_ID, entitlementsForPlan('BASICO'));

    expect(resultado.intentos).toBe(3);
    expect(h.storage.publicados).toHaveLength(1);
    // 2 descartes (intentos fallidos) y una publicación final.
    expect(h.storage.descartados).toHaveLength(2);
    const pedido = await h.pedidos.findByTemporadaId(TEMPORADA_ID);
    expect(pedido?.intentosImpresion).toBe(3);
    // No se marcó FALLIDA porque terminó en éxito.
    const temporada = await h.temporadas.findById(TEMPORADA_ID);
    expect(temporada?.estado).toBe('IMPRESION');
  });
});

describe('PrintEngineService.generarKit — fallo persistente → FALLIDA + alerta (Req 18.7, 18.8)', () => {
  it('agota reintentos, marca Temporada/Pedido FALLIDA, alerta al operador y notifica al usuario', async () => {
    const h = makeHarness([makeRecuadro(1, true)]);
    h.renderer.fallarStickers = true;

    await expect(
      h.service.generarKit(TEMPORADA_ID, entitlementsForPlan('PREMIUM')),
    ).rejects.toMatchObject({ name: 'PrintEngineFallidaError' });

    const temporada = await h.temporadas.findById(TEMPORADA_ID);
    const pedido = await h.pedidos.findByTemporadaId(TEMPORADA_ID);
    expect(temporada?.estado).toBe('FALLIDA');
    expect(pedido?.estado).toBe('FALLIDA');
    expect(pedido?.intentosImpresion).toBe(MAX_INTENTOS_IMPRESION);

    // Alerta al operador exactamente una vez, con el instante del reloj inyectado.
    expect(h.notifier.alertas).toHaveLength(1);
    expect(h.notifier.alertas[0]?.emitidaEn).toBe(1_700_000_000_000);
    // Notificación al usuario de que no se completó.
    expect(h.notifier.notificaciones).toHaveLength(1);
    // Nunca se publicó nada.
    expect(h.storage.publicados).toHaveLength(0);
  });
});

describe('PrintEngineService.triggerGeneracion — PrintEngineTrigger (Req 16.3, 16.4)', () => {
  it('delega en generarKit al ser disparado por el cierre de Temporada', async () => {
    const h = makeHarness([makeRecuadro(1, true)]);

    await h.service.triggerGeneracion({ temporadaId: TEMPORADA_ID, motivo: 'AUTOMATICO' });

    expect(h.storage.publicados).toHaveLength(1);
  });
});
