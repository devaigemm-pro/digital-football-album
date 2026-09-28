// Pruebas de MatchDetailService — composición del detalle de partido/lámina.
//
// Cubren dos correcciones de "se guarda pero no se ve":
//   - las fotos del momento se devuelven con una URL FIRMADA renderizable
//     (resuelta desde su `objectKey`), no solo la clave interna;
//   - el marcador usa el resultado de la ficha en vivo como respaldo cuando el
//     partido está FINALIZADO pero su `resultado` persistido es null.
//
// Repositorios y dependencias como dobles en memoria: sin red ni base viva.

import { describe, expect, it } from 'vitest';

import type { Foto, PartidoOficial } from '../../domain/types.js';
import {
  InMemoryAlbumRepository,
  InMemoryFotoRepository,
  InMemoryMomentoRepository,
  InMemoryPartidoOficialRepository,
  InMemoryRecuadroRepository,
} from '../../persistence/in-memory/repositories.js';
import type { RawFichaPartido, SportsApiClient } from '../sports/types.js';
import { MatchDetailService, type UrlResolver } from './match-detail-service.js';

const PARTIDO_ID = 'partido-1';
const TEMP_ID = 'temp-1';
const ALBUM_ID = 'album-1';
const MOMENTO_ID = 'momento-1';
const FOTO_ID = 'foto-1';

function makePartido(over: Partial<PartidoOficial> = {}): PartidoOficial {
  return {
    id: PARTIDO_ID,
    temporadaId: TEMP_ID,
    partidoExternoId: 'ext-1',
    competicion: 'Primera División',
    tipoCompeticion: 'LIGA',
    rival: 'Rival FC',
    fechaHora: '2025-05-01T20:00:00.000Z',
    estado: 'FINALIZADO',
    esClasico: false,
    esInternacional: false,
    resultado: null,
    alineacion: [],
    eventos: [],
    ...over,
  };
}

/**
 * Cliente deportivo falso: devuelve una ficha con resultado 2-1. Solo se
 * implementan los métodos que usa `MatchDetailService` (`fetchFichaPartido`);
 * el resto no se invoca en estas pruebas, así que se completa con un cast.
 */
const fakeSportsConResultado = {
  fetchFichaPartido: (): Promise<RawFichaPartido> =>
    Promise.resolve({
      partidoExternoId: 'ext-1',
      resultado: { golesLocal: 2, golesVisita: 1 },
      alineacion: [],
      eventos: [],
      goleadores: [],
      formaciones: [],
    }),
} as unknown as SportsApiClient;

/** UrlResolver falso: firma la clave anteponiendo un host de ejemplo. */
const fakeUrlResolver: UrlResolver = {
  getSignedUrl: (objectKey) => Promise.resolve(`https://cdn.example.com/${objectKey}?token=abc`),
};

function makeDeps(opts: {
  partido: PartidoOficial;
  fotos?: readonly Foto[];
  fotoPrincipalId?: string | null;
  urlResolver?: UrlResolver;
  sportsClient?: SportsApiClient;
}) {
  const partidos = new InMemoryPartidoOficialRepository([opts.partido]);
  const albumes = new InMemoryAlbumRepository([{ id: ALBUM_ID, temporadaId: TEMP_ID }]);
  const recuadros = new InMemoryRecuadroRepository([
    {
      id: 'recuadro-1',
      albumId: ALBUM_ID,
      partidoOficialId: PARTIDO_ID,
      plantillaId: 'plantilla-1',
      numero: 1,
      anchoMm: 50,
      altoMm: 70,
      fotoPrincipalId: opts.fotoPrincipalId ?? null,
      estadoRecordatorio: 'ACTIVO',
    },
  ]);
  const momentos = new InMemoryMomentoRepository(
    opts.fotos && opts.fotos.length > 0
      ? [
          {
            id: MOMENTO_ID,
            partidoOficialId: PARTIDO_ID,
            contextoAsistencia: 'EN_VIVO_LOCAL',
            subModalidad: null,
            geoVerificado: false,
            notas: '',
            jugadorDelPartido: null,
          },
        ]
      : [],
  );
  const fotos = new InMemoryFotoRepository(opts.fotos ?? []);
  return {
    partidos,
    albumes,
    recuadros,
    momentos,
    fotos,
    sportsClient: opts.sportsClient ?? fakeSportsConResultado,
    ...(opts.urlResolver ? { urlResolver: opts.urlResolver } : {}),
    sportsEnabled: true,
  };
}

describe('MatchDetailService — URL firmada de fotos', () => {
  it('resuelve el objectKey de cada foto a una URL renderizable', async () => {
    const foto: Foto = {
      id: FOTO_ID,
      momentoId: MOMENTO_ID,
      objectKey: 'momentos/foto-1',
      anchoPx: 3000,
      altoPx: 2000,
      estadoAsociacion: 'ASOCIADA',
    };
    const service = new MatchDetailService(
      makeDeps({
        partido: makePartido(),
        fotos: [foto],
        fotoPrincipalId: FOTO_ID,
        urlResolver: fakeUrlResolver,
      }),
    );

    const detalle = await service.getDetalle(PARTIDO_ID);

    expect(detalle.fotos).toHaveLength(1);
    // La clave interna se conserva, pero además viaja una URL firmada usable.
    expect(detalle.fotos[0]?.objectKey).toBe('momentos/foto-1');
    expect(detalle.fotos[0]?.url).toBe('https://cdn.example.com/momentos/foto-1?token=abc');
    expect(detalle.fotos[0]?.esPrincipal).toBe(true);
  });

  it('sin urlResolver, la foto sale con url null (no rompe el detalle)', async () => {
    const foto: Foto = {
      id: FOTO_ID,
      momentoId: MOMENTO_ID,
      objectKey: 'momentos/foto-1',
      anchoPx: 3000,
      altoPx: 2000,
      estadoAsociacion: 'ASOCIADA',
    };
    const service = new MatchDetailService(
      makeDeps({ partido: makePartido(), fotos: [foto], fotoPrincipalId: FOTO_ID }),
    );

    const detalle = await service.getDetalle(PARTIDO_ID);
    expect(detalle.fotos[0]?.url).toBeNull();
  });
});

describe('MatchDetailService — marcador con respaldo de la ficha en vivo', () => {
  it('usa el resultado de la ficha en vivo si el partido FINALIZADO no lo tiene persistido', async () => {
    const service = new MatchDetailService(
      makeDeps({ partido: makePartido({ resultado: null, estado: 'FINALIZADO' }) }),
    );

    const detalle = await service.getDetalle(PARTIDO_ID);
    // El resultado null persistido se rellena con el de la ficha (2-1).
    expect(detalle.resultado).toEqual({ golesLocal: 2, golesVisita: 1 });
  });

  it('prioriza el resultado persistido sobre el de la ficha en vivo', async () => {
    const service = new MatchDetailService(
      makeDeps({
        partido: makePartido({ resultado: { golesLocal: 3, golesVisita: 0 } }),
      }),
    );

    const detalle = await service.getDetalle(PARTIDO_ID);
    expect(detalle.resultado).toEqual({ golesLocal: 3, golesVisita: 0 });
  });

  it('no inventa resultado para un partido PROGRAMADO', async () => {
    const service = new MatchDetailService(
      makeDeps({ partido: makePartido({ estado: 'PROGRAMADO', resultado: null }) }),
    );

    const detalle = await service.getDetalle(PARTIDO_ID);
    expect(detalle.resultado).toBeNull();
  });
});
