/**
 * Pruebas unitarias del TemporadaClosingService (Task 16.2 — Requirements: 16.1–16.5).
 *
 * Cubren las dos vías de cierre y sus invariantes:
 *  - Cierre automático al alcanzar (o pasar) la Fecha_Límite_Cierre: transición
 *    ACTIVA→CERRADA sin confirmación y disparo del Print_Engine (Req 16.3).
 *  - Cierre anticipado confirmado por el usuario: cierre + disparo del
 *    Print_Engine antes de la fecha límite (Req 16.4).
 *  - Recuadros sin Foto_Principal: se informan antes del cierre anticipado
 *    (Req 16.1, 16.2) y se mantienen vacíos al proceder con la impresión (Req 16.5).
 *  - El cierre automático NO procede antes de la fecha límite (protección del job).
 */
import { describe, it, expect } from 'vitest';
import type { Album, Recuadro, Temporada, UUID } from '../../domain/types.js';
import {
  InMemoryAlbumRepository,
  InMemoryRecuadroRepository,
  InMemoryTemporadaRepository,
} from '../../persistence/in-memory/repositories.js';
import {
  FechaLimiteNoAlcanzadaError,
  TemporadaClosingService,
  TemporadaNoActivaError,
  TemporadaNoEncontradaError,
  type PrintEngineTrigger,
  type PrintEngineTriggerInput,
} from './temporada-closing-service.js';

const TEMPORADA_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as UUID;
const USUARIO_ID = '11111111-1111-4111-8111-111111111111' as UUID;
const CLUB_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' as UUID;
const ALBUM_ID = 'a1b0b0b0-0000-4000-8000-000000000001' as UUID;
const PLANTILLA_ID = 'p1a0a0a0-0000-4000-8000-000000000001' as UUID;
const FOTO_ID = 'f0000001-0000-4000-8000-000000000001' as UUID;

const FECHA_LIMITE = '2025-06-30T23:59:59.000Z';
const LIMITE_MS = Date.parse(FECHA_LIMITE);
const ANTES_DEL_LIMITE = Date.parse('2025-06-01T00:00:00.000Z');
const DESPUES_DEL_LIMITE = Date.parse('2025-07-01T00:00:00.000Z');

/** Doble del Print_Engine que registra los disparos (no genera PDFs). */
class SpyPrintEngineTrigger implements PrintEngineTrigger {
  readonly disparos: PrintEngineTriggerInput[] = [];

  triggerGeneracion(entrada: PrintEngineTriggerInput): Promise<void> {
    this.disparos.push(entrada);
    return Promise.resolve();
  }
}

function makeTemporada(estado: Temporada['estado'] = 'ACTIVA'): Temporada {
  return {
    id: TEMPORADA_ID,
    usuarioId: USUARIO_ID,
    clubId: CLUB_ID,
    temporadaExterna: '2024-2025',
    estado,
    fechaLimiteCierre: FECHA_LIMITE,
  };
}

function makeAlbum(): Album {
  return { id: ALBUM_ID, temporadaId: TEMPORADA_ID };
}

/** Recuadro con o sin Foto_Principal según `fotoPrincipalId`. */
function makeRecuadro(id: UUID, numero: number, fotoPrincipalId: UUID | null): Recuadro {
  return {
    id,
    albumId: ALBUM_ID,
    partidoOficialId: `partido-${numero}`,
    plantillaId: PLANTILLA_ID,
    numero,
    anchoMm: 50,
    altoMm: 70,
    fotoPrincipalId,
    estadoRecordatorio: 'ACTIVO',
  };
}

function makeService(options: {
  temporadas?: readonly Temporada[];
  albums?: readonly Album[];
  recuadros?: readonly Recuadro[];
}): {
  service: TemporadaClosingService;
  temporadaRepo: InMemoryTemporadaRepository;
  recuadroRepo: InMemoryRecuadroRepository;
  printEngine: SpyPrintEngineTrigger;
} {
  const temporadaRepo = new InMemoryTemporadaRepository(options.temporadas ?? [makeTemporada()]);
  const albumRepo = new InMemoryAlbumRepository(options.albums ?? [makeAlbum()]);
  const recuadroRepo = new InMemoryRecuadroRepository(options.recuadros ?? []);
  const printEngine = new SpyPrintEngineTrigger();
  const service = new TemporadaClosingService({
    temporadas: temporadaRepo,
    albums: albumRepo,
    recuadros: recuadroRepo,
    printEngine,
  });
  return { service, temporadaRepo, recuadroRepo, printEngine };
}

describe('TemporadaClosingService.automaticClose', () => {
  it('cierra la Temporada sin confirmación y dispara el Print_Engine al alcanzar la Fecha_Límite_Cierre (Req 16.3)', async () => {
    const { service, temporadaRepo, printEngine } = makeService({});

    const resultado = await service.automaticClose(TEMPORADA_ID, LIMITE_MS);

    expect(resultado.temporada.estado).toBe('CERRADA');
    expect(resultado.motivo).toBe('AUTOMATICO');
    expect(resultado.printEngineDisparado).toBe(true);

    // Persistencia: la Temporada quedó CERRADA.
    const persistida = await temporadaRepo.findById(TEMPORADA_ID);
    expect(persistida?.estado).toBe('CERRADA');

    // El Print_Engine se disparó exactamente una vez, con el motivo automático.
    expect(printEngine.disparos).toEqual([{ temporadaId: TEMPORADA_ID, motivo: 'AUTOMATICO' }]);
  });

  it('cierra y dispara también cuando el instante es posterior a la Fecha_Límite_Cierre (Req 16.3)', async () => {
    const { service, printEngine } = makeService({});

    const resultado = await service.automaticClose(TEMPORADA_ID, DESPUES_DEL_LIMITE);

    expect(resultado.temporada.estado).toBe('CERRADA');
    expect(printEngine.disparos).toHaveLength(1);
  });

  it('NO cierra ni dispara el Print_Engine antes de la Fecha_Límite_Cierre (protección del job automático)', async () => {
    const { service, temporadaRepo, printEngine } = makeService({});

    await expect(service.automaticClose(TEMPORADA_ID, ANTES_DEL_LIMITE)).rejects.toBeInstanceOf(
      FechaLimiteNoAlcanzadaError,
    );

    // La Temporada sigue ACTIVA y no hubo disparo.
    const persistida = await temporadaRepo.findById(TEMPORADA_ID);
    expect(persistida?.estado).toBe('ACTIVA');
    expect(printEngine.disparos).toHaveLength(0);
  });

  it('procede con la impresión manteniendo vacíos los Recuadros sin Foto_Principal (Req 16.5)', async () => {
    const conFoto = makeRecuadro('r0000001-0000-4000-8000-000000000001', 1, FOTO_ID);
    const vacio1 = makeRecuadro('r0000002-0000-4000-8000-000000000002', 2, null);
    const vacio2 = makeRecuadro('r0000003-0000-4000-8000-000000000003', 3, null);
    const { service, recuadroRepo, printEngine } = makeService({
      recuadros: [conFoto, vacio1, vacio2],
    });

    const resultado = await service.automaticClose(TEMPORADA_ID, LIMITE_MS);

    // Se reportan los dos Recuadros vacíos.
    expect(resultado.recuadrosSinFotoPrincipal.map((r) => r.numero).sort()).toEqual([2, 3]);
    // La impresión se disparó pese a los vacíos (Req 16.5).
    expect(printEngine.disparos).toHaveLength(1);

    // Los vacíos se MANTIENEN vacíos (no se rellenan ni se eliminan).
    const vaciosPersistidos = await recuadroRepo.findSinFotoPrincipalByAlbumId(ALBUM_ID);
    expect(vaciosPersistidos.map((r) => r.numero).sort()).toEqual([2, 3]);
    // El Recuadro con foto conserva su Foto_Principal.
    const persistidoConFoto = await recuadroRepo.findById(conFoto.id);
    expect(persistidoConFoto?.fotoPrincipalId).toBe(conFoto.fotoPrincipalId);
  });

  it('lanza TemporadaNoEncontradaError si la Temporada no existe', async () => {
    const { service } = makeService({ temporadas: [] });

    await expect(service.automaticClose(TEMPORADA_ID, LIMITE_MS)).rejects.toBeInstanceOf(
      TemporadaNoEncontradaError,
    );
  });

  it('lanza TemporadaNoActivaError si la Temporada ya está CERRADA (evita re-disparo)', async () => {
    const { service, printEngine } = makeService({
      temporadas: [makeTemporada('CERRADA')],
    });

    await expect(service.automaticClose(TEMPORADA_ID, LIMITE_MS)).rejects.toBeInstanceOf(
      TemporadaNoActivaError,
    );
    expect(printEngine.disparos).toHaveLength(0);
  });
});

describe('TemporadaClosingService.confirmedEarlyClose', () => {
  it('cierra la Temporada y dispara el Print_Engine antes de la fecha límite (Req 16.4)', async () => {
    const { service, temporadaRepo, printEngine } = makeService({});

    const resultado = await service.confirmedEarlyClose(TEMPORADA_ID);

    expect(resultado.temporada.estado).toBe('CERRADA');
    expect(resultado.motivo).toBe('ANTICIPADO_CONFIRMADO');
    expect(resultado.printEngineDisparado).toBe(true);

    const persistida = await temporadaRepo.findById(TEMPORADA_ID);
    expect(persistida?.estado).toBe('CERRADA');
    expect(printEngine.disparos).toEqual([
      { temporadaId: TEMPORADA_ID, motivo: 'ANTICIPADO_CONFIRMADO' },
    ]);
  });

  it('mantiene vacíos los Recuadros sin Foto_Principal al cierre anticipado (Req 16.5)', async () => {
    const vacio = makeRecuadro('r0000009-0000-4000-8000-000000000009', 9, null);
    const { service, recuadroRepo, printEngine } = makeService({
      recuadros: [vacio],
    });

    const resultado = await service.confirmedEarlyClose(TEMPORADA_ID);

    expect(resultado.recuadrosSinFotoPrincipal.map((r) => r.numero)).toEqual([9]);
    expect(printEngine.disparos).toHaveLength(1);
    const vaciosPersistidos = await recuadroRepo.findSinFotoPrincipalByAlbumId(ALBUM_ID);
    expect(vaciosPersistidos.map((r) => r.numero)).toEqual([9]);
  });

  it('lanza TemporadaNoActivaError si la Temporada no está ACTIVA', async () => {
    const { service, printEngine } = makeService({
      temporadas: [makeTemporada('IMPRESION')],
    });

    await expect(service.confirmedEarlyClose(TEMPORADA_ID)).rejects.toBeInstanceOf(
      TemporadaNoActivaError,
    );
    expect(printEngine.disparos).toHaveLength(0);
  });
});

describe('TemporadaClosingService.listRecuadrosSinFotoPrincipal', () => {
  it('informa los Recuadros sin Foto_Principal antes de una confirmación de cierre anticipado (Req 16.1, 16.2)', async () => {
    const conFoto = makeRecuadro('r0000001-0000-4000-8000-000000000001', 1, FOTO_ID);
    const vacio1 = makeRecuadro('r0000002-0000-4000-8000-000000000002', 2, null);
    const vacio2 = makeRecuadro('r0000003-0000-4000-8000-000000000003', 4, null);
    const { service } = makeService({
      recuadros: [conFoto, vacio1, vacio2],
    });

    const vacios = await service.listRecuadrosSinFotoPrincipal(TEMPORADA_ID);

    expect(vacios.map((r) => r.numero).sort((a, b) => a - b)).toEqual([2, 4]);
    // Es una consulta de sólo lectura: no cambia el estado de la Temporada.
    const persistida = await service.listRecuadrosSinFotoPrincipal(TEMPORADA_ID);
    expect(persistida).toHaveLength(2);
  });

  it('devuelve lista vacía cuando todos los Recuadros tienen Foto_Principal', async () => {
    const conFoto = makeRecuadro('r0000001-0000-4000-8000-000000000001', 1, FOTO_ID);
    const { service } = makeService({ recuadros: [conFoto] });

    const vacios = await service.listRecuadrosSinFotoPrincipal(TEMPORADA_ID);
    expect(vacios).toHaveLength(0);
  });

  it('devuelve lista vacía cuando la Temporada aún no tiene Álbum', async () => {
    const { service } = makeService({ albums: [] });

    const vacios = await service.listRecuadrosSinFotoPrincipal(TEMPORADA_ID);
    expect(vacios).toHaveLength(0);
  });

  it('lanza TemporadaNoEncontradaError si la Temporada no existe', async () => {
    const { service } = makeService({ temporadas: [] });

    await expect(service.listRecuadrosSinFotoPrincipal(TEMPORADA_ID)).rejects.toBeInstanceOf(
      TemporadaNoEncontradaError,
    );
  });
});
