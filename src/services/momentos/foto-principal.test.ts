// Pruebas de `setFotoPrincipal`, `canEditar`/`assertEditable` y
// `fotosImprimibles` (Task 11.2).
//
// Cubren:
//   - a lo sumo una Foto_Principal por Recuadro: re-marcar reemplaza la anterior
//     y coincide con la última fotografía marcada (Req 5.5);
//   - conjunto imprimible = solo la Foto_Principal (o vacío) — las no principales
//     se conservan pero se excluyen (Req 5.6);
//   - guarda de edición por cierre: se permite si y solo si la Temporada está
//     ACTIVA y el instante es anterior a la Fecha_Límite_Cierre (Req 5.7);
//   - validación de que la foto pertenezca al Momento del partido del Recuadro.
// Los repositorios se inyectan como dobles en memoria y el reloj se inyecta para
// determinismo.
//
// Requirements: 5.5, 5.6, 5.7

import { describe, expect, it } from 'vitest';

import type { Foto, PartidoOficial, Recuadro, Temporada } from '../../domain/types.js';
import {
  InMemoryFotoRepository,
  InMemoryMomentoRepository,
  InMemoryPartidoOficialRepository,
  InMemoryRecuadroRepository,
  InMemoryTemporadaRepository,
} from '../../persistence/in-memory/repositories.js';
import { fc, pbtAssertAsync } from '../../../test/pbt.js';
import {
  assertEditable,
  canEditar,
  EdicionCerradaError,
  FotoNoValidaParaRecuadroError,
  fotosImprimibles,
  RecuadroNoEncontradoError,
  setFotoPrincipal,
  type SetFotoPrincipalDeps,
} from './foto-principal.js';

const TEMPORADA_ID = 'temp-1';
const PARTIDO_ID = 'partido-1';
const MOMENTO_ID = 'momento-1';
const RECUADRO_ID = 'recuadro-1';
const ALBUM_ID = 'album-1';

// Instante de referencia y fecha límite futura para el caso "editable".
const AHORA = Date.parse('2025-05-01T12:00:00.000Z');
const LIMITE_FUTURO = '2025-06-01T00:00:00.000Z';
const LIMITE_PASADO = '2025-04-01T00:00:00.000Z';

function makeTemporada(overrides: Partial<Temporada> = {}): Temporada {
  return {
    id: TEMPORADA_ID,
    usuarioId: 'user-1',
    clubId: 'club-1',
    temporadaExterna: '2025',
    estado: 'ACTIVA',
    fechaLimiteCierre: LIMITE_FUTURO,
    ...overrides,
  };
}

function makePartido(overrides: Partial<PartidoOficial> = {}): PartidoOficial {
  return {
    id: PARTIDO_ID,
    temporadaId: TEMPORADA_ID,
    partidoExternoId: 'ext-1',
    competicion: 'Liga',
    tipoCompeticion: 'LIGA',
    rival: 'Rival FC',
    fechaHora: '2025-05-01T20:00:00.000Z',
    estado: 'FINALIZADO',
    esClasico: false,
    esInternacional: false,
    resultado: null,
    alineacion: [],
    eventos: [],
    ...overrides,
  };
}

function makeRecuadro(overrides: Partial<Recuadro> = {}): Recuadro {
  return {
    id: RECUADRO_ID,
    albumId: ALBUM_ID,
    partidoOficialId: PARTIDO_ID,
    plantillaId: 'plantilla-1',
    numero: 1,
    anchoMm: 60,
    altoMm: 90,
    fotoPrincipalId: null,
    estadoRecordatorio: 'ACTIVO',
    ...overrides,
  };
}

function makeFoto(id: string): Foto {
  return {
    id,
    momentoId: MOMENTO_ID,
    objectKey: `fotos/${id}`,
    anchoPx: 3000,
    altoPx: 2000,
    estadoAsociacion: 'ASOCIADA',
  };
}

/**
 * Arma dependencias con un Recuadro, su partido/temporada/momento sembrados y
 * `fotos` fotografías agrupadas en el Momento. El reloj queda fijo en `AHORA`.
 */
function makeDeps(opts: {
  temporada?: Temporada;
  recuadro?: Recuadro;
  fotoIds?: string[];
  now?: number;
}): {
  deps: SetFotoPrincipalDeps;
  recuadros: InMemoryRecuadroRepository;
  fotos: Foto[];
} {
  const temporada = opts.temporada ?? makeTemporada();
  const recuadro = opts.recuadro ?? makeRecuadro();
  const fotoIds = opts.fotoIds ?? ['foto-1', 'foto-2', 'foto-3'];
  const fotos = fotoIds.map(makeFoto);

  const recuadros = new InMemoryRecuadroRepository([recuadro]);

  const deps: SetFotoPrincipalDeps = {
    recuadros,
    partidos: new InMemoryPartidoOficialRepository([makePartido()]),
    momentos: new InMemoryMomentoRepository([
      {
        id: MOMENTO_ID,
        partidoOficialId: PARTIDO_ID,
        contextoAsistencia: 'TRANSMISION',
        subModalidad: null,
        geoVerificado: false,
        notas: '',
        jugadorDelPartido: null,
      },
    ]),
    fotos: new InMemoryFotoRepository(fotos),
    temporadas: new InMemoryTemporadaRepository([temporada]),
    now: (): number => opts.now ?? AHORA,
  };

  return { deps, recuadros, fotos };
}

describe('canEditar / assertEditable (guarda de cierre — Req 5.7)', () => {
  it('permite editar si la Temporada está ACTIVA y antes del cierre', () => {
    const t = makeTemporada({ estado: 'ACTIVA', fechaLimiteCierre: LIMITE_FUTURO });
    expect(canEditar(t, AHORA)).toBe(true);
    expect(() => assertEditable(t, AHORA)).not.toThrow();
  });

  it('deniega si la Temporada no está ACTIVA', () => {
    const t = makeTemporada({ estado: 'CERRADA', fechaLimiteCierre: LIMITE_FUTURO });
    expect(canEditar(t, AHORA)).toBe(false);
    try {
      assertEditable(t, AHORA);
      expect.unreachable('debió lanzar EdicionCerradaError');
    } catch (e) {
      expect(e).toBeInstanceOf(EdicionCerradaError);
      expect((e as EdicionCerradaError).motivo).toBe('TEMPORADA_NO_ACTIVA');
    }
  });

  it('deniega si el instante ya alcanzó la Fecha_Límite_Cierre', () => {
    const t = makeTemporada({ estado: 'ACTIVA', fechaLimiteCierre: LIMITE_PASADO });
    expect(canEditar(t, AHORA)).toBe(false);
    try {
      assertEditable(t, AHORA);
      expect.unreachable('debió lanzar EdicionCerradaError');
    } catch (e) {
      expect(e).toBeInstanceOf(EdicionCerradaError);
      expect((e as EdicionCerradaError).motivo).toBe('FECHA_LIMITE_ALCANZADA');
    }
  });

  it('deniega en el instante exacto del cierre (frontera estricta)', () => {
    const t = makeTemporada({ estado: 'ACTIVA', fechaLimiteCierre: LIMITE_FUTURO });
    expect(canEditar(t, Date.parse(LIMITE_FUTURO))).toBe(false);
  });

  it('deniega si la Fecha_Límite_Cierre es inválida (fail-closed)', () => {
    const t = makeTemporada({ estado: 'ACTIVA', fechaLimiteCierre: 'no-es-fecha' });
    expect(canEditar(t, AHORA)).toBe(false);
  });
});

describe('fotosImprimibles (Req 5.6)', () => {
  it('devuelve solo la Foto_Principal cuando existe', () => {
    const recuadro = makeRecuadro({ fotoPrincipalId: 'foto-2' });
    const fotos = ['foto-1', 'foto-2', 'foto-3'].map(makeFoto);
    const imprimibles = fotosImprimibles(recuadro, fotos);
    expect(imprimibles).toHaveLength(1);
    expect(imprimibles[0]?.id).toBe('foto-2');
  });

  it('devuelve vacío cuando el Recuadro no tiene Foto_Principal', () => {
    const recuadro = makeRecuadro({ fotoPrincipalId: null });
    const fotos = ['foto-1', 'foto-2'].map(makeFoto);
    expect(fotosImprimibles(recuadro, fotos)).toEqual([]);
  });
});

describe('setFotoPrincipal (Req 5.5, 5.6, 5.7)', () => {
  it('registra la Foto_Principal cuando la edición está permitida', async () => {
    const { deps, recuadros } = makeDeps({});

    const { recuadro, fotoPrincipal } = await setFotoPrincipal(RECUADRO_ID, 'foto-1', deps);

    expect(recuadro.fotoPrincipalId).toBe('foto-1');
    expect(fotoPrincipal.id).toBe('foto-1');
    const persistido = await recuadros.findById(RECUADRO_ID);
    expect(persistido?.fotoPrincipalId).toBe('foto-1');
  });

  it('mantiene a lo sumo una Foto_Principal: re-marcar reemplaza la anterior', async () => {
    const { deps, recuadros } = makeDeps({});

    await setFotoPrincipal(RECUADRO_ID, 'foto-1', deps);
    await setFotoPrincipal(RECUADRO_ID, 'foto-2', deps);
    const { recuadro } = await setFotoPrincipal(RECUADRO_ID, 'foto-3', deps);

    // Coincide con la ÚLTIMA foto marcada; no hay acumulación.
    expect(recuadro.fotoPrincipalId).toBe('foto-3');
    const persistido = await recuadros.findById(RECUADRO_ID);
    expect(persistido?.fotoPrincipalId).toBe('foto-3');
  });

  it('el conjunto imprimible tras marcar es exactamente la Foto_Principal', async () => {
    const { deps, fotos } = makeDeps({});
    const { recuadro } = await setFotoPrincipal(RECUADRO_ID, 'foto-2', deps);
    const imprimibles = fotosImprimibles(recuadro, fotos);
    expect(imprimibles.map((f) => f.id)).toEqual(['foto-2']);
    // Las otras fotos se conservan pero no son imprimibles.
    expect(fotos).toHaveLength(3);
  });

  it('lanza RecuadroNoEncontradoError si el Recuadro no existe', async () => {
    const { deps } = makeDeps({});
    await expect(setFotoPrincipal('inexistente', 'foto-1', deps)).rejects.toBeInstanceOf(
      RecuadroNoEncontradoError,
    );
  });

  it('lanza FotoNoValidaParaRecuadroError si la foto no pertenece al Momento', async () => {
    const { deps } = makeDeps({});
    await expect(setFotoPrincipal(RECUADRO_ID, 'foto-ajena', deps)).rejects.toBeInstanceOf(
      FotoNoValidaParaRecuadroError,
    );
  });

  it('rechaza y no modifica el Recuadro si la Temporada no está ACTIVA', async () => {
    const { deps, recuadros } = makeDeps({
      temporada: makeTemporada({ estado: 'CERRADA' }),
    });
    await expect(setFotoPrincipal(RECUADRO_ID, 'foto-1', deps)).rejects.toBeInstanceOf(
      EdicionCerradaError,
    );
    const persistido = await recuadros.findById(RECUADRO_ID);
    expect(persistido?.fotoPrincipalId).toBeNull();
  });

  it('rechaza si el instante ya alcanzó la Fecha_Límite_Cierre', async () => {
    const { deps } = makeDeps({
      temporada: makeTemporada({ fechaLimiteCierre: LIMITE_PASADO }),
    });
    await expect(setFotoPrincipal(RECUADRO_ID, 'foto-1', deps)).rejects.toBeInstanceOf(
      EdicionCerradaError,
    );
  });

  // Feature: digital-football-album, Property 7: A lo sumo una Foto_Principal por Recuadro
  // Validates: Requirements 5.5
  it('para cualquier secuencia de marcados, la Foto_Principal es la última marcada', async () => {
    await pbtAssertAsync(
      fc.asyncProperty(
        fc.array(fc.constantFrom('foto-1', 'foto-2', 'foto-3'), {
          minLength: 1,
          maxLength: 10,
        }),
        async (secuencia) => {
          const { deps, recuadros } = makeDeps({});
          for (const fotoId of secuencia) {
            await setFotoPrincipal(RECUADRO_ID, fotoId, deps);
          }
          const persistido = await recuadros.findById(RECUADRO_ID);
          // A lo sumo una (un único campo escalar) y == a la última marcada.
          expect(persistido?.fotoPrincipalId).toBe(secuencia[secuencia.length - 1]);
        },
      ),
    );
  });

  // Feature: digital-football-album, Property 9: La edición de Foto_Principal solo se permite antes del cierre
  // Validates: Requirements 5.7
  it('permite editar si y solo si Temporada ACTIVA y antes del cierre', async () => {
    const estados = [
      'CONFIGURACION',
      'ACTIVA',
      'CERRADA',
      'IMPRESION',
      'LISTA',
      'ENVIADA',
      'FALLIDA',
    ] as const;
    await pbtAssertAsync(
      fc.asyncProperty(
        fc.constantFrom(...estados),
        fc.integer({
          min: Date.parse('2025-01-01T00:00:00.000Z'),
          max: Date.parse('2025-12-31T00:00:00.000Z'),
        }),
        async (estado, ahora) => {
          const temporada = makeTemporada({
            estado,
            fechaLimiteCierre: LIMITE_FUTURO,
          });
          const esperadoPermitido = estado === 'ACTIVA' && ahora < Date.parse(LIMITE_FUTURO);

          const { deps, recuadros } = makeDeps({ temporada, now: ahora });
          const antes = (await recuadros.findById(RECUADRO_ID))?.fotoPrincipalId;

          if (esperadoPermitido) {
            await setFotoPrincipal(RECUADRO_ID, 'foto-1', deps);
            expect((await recuadros.findById(RECUADRO_ID))?.fotoPrincipalId).toBe('foto-1');
          } else {
            await expect(setFotoPrincipal(RECUADRO_ID, 'foto-1', deps)).rejects.toBeInstanceOf(
              EdicionCerradaError,
            );
            // No mutó el Recuadro.
            expect((await recuadros.findById(RECUADRO_ID))?.fotoPrincipalId).toBe(antes ?? null);
          }
        },
      ),
    );
  });
});
