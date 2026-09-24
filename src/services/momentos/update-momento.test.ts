// Pruebas de `updateMomento` (Task 11.3).
//
// Cubren:
//   - contexto de asistencia En Vivo Local / Visita / Transmisión (Req 6.1);
//   - sub-modalidad válida SOLO en Transmisión; en otro contexto se rechaza
//     con `SubModalidadInvalidaError` (Req 6.4);
//   - notas persistidas y round-trippables (Req 7.1, 7.2);
//   - Jugador_del_Partido limitado a la alineación disponible; fuera de ella se
//     rechaza con `JugadorFueraDeAlineacionError` (Req 8.1, 8.2).
// Los repositorios se inyectan como dobles en memoria.
//
// Requirements: 6.1, 6.4, 7.1, 7.2, 8.1, 8.2

import { describe, expect, it } from 'vitest';

import type {
  ContextoAsistencia,
  JugadorAlineacion,
  Momento,
  PartidoOficial,
  SubModalidadTransmision,
} from '../../domain/types.js';
import {
  InMemoryMomentoRepository,
  InMemoryPartidoOficialRepository,
} from '../../persistence/in-memory/repositories.js';
import { fc, pbtAssertAsync } from '../../../test/pbt.js';
import {
  JugadorFueraDeAlineacionError,
  MomentoNoEncontradoError,
  SubModalidadInvalidaError,
  updateMomento,
  type UpdateMomentoDeps,
} from './update-momento.js';

const PARTIDO_ID = 'partido-1';
const MOMENTO_ID = 'momento-1';

const ALINEACION: JugadorAlineacion[] = [
  { id: 'j1', nombre: 'Portero' },
  { id: 'j2', nombre: 'Delantero' },
  { id: 'j3', nombre: 'Mediocampista' },
];

function makePartido(overrides: Partial<PartidoOficial> = {}): PartidoOficial {
  return {
    id: PARTIDO_ID,
    temporadaId: 'temp-1',
    partidoExternoId: 'ext-1',
    competicion: 'Liga',
    tipoCompeticion: 'LIGA',
    rival: 'Rival FC',
    fechaHora: '2025-05-01T20:00:00.000Z',
    estado: 'FINALIZADO',
    esClasico: false,
    esInternacional: false,
    resultado: null,
    alineacion: ALINEACION,
    eventos: [],
    ...overrides,
  };
}

function makeMomento(overrides: Partial<Momento> = {}): Momento {
  return {
    id: MOMENTO_ID,
    partidoOficialId: PARTIDO_ID,
    contextoAsistencia: 'TRANSMISION',
    subModalidad: null,
    geoVerificado: false,
    notas: '',
    jugadorDelPartido: null,
    ...overrides,
  };
}

function makeDeps(
  momento: Momento = makeMomento(),
  partido: PartidoOficial = makePartido(),
): { deps: UpdateMomentoDeps; momentos: InMemoryMomentoRepository } {
  const momentos = new InMemoryMomentoRepository([momento]);
  return {
    momentos,
    deps: {
      momentos,
      partidos: new InMemoryPartidoOficialRepository([partido]),
    },
  };
}

describe('updateMomento — contexto (Req 6.1)', () => {
  it('acepta los tres contextos de asistencia', async () => {
    for (const contexto of [
      'EN_VIVO_LOCAL',
      'EN_VIVO_VISITA',
      'TRANSMISION',
    ] as ContextoAsistencia[]) {
      const { deps } = makeDeps();
      const actualizado = await updateMomento(MOMENTO_ID, { contextoAsistencia: contexto }, deps);
      expect(actualizado.contextoAsistencia).toBe(contexto);
    }
  });

  it('lanza MomentoNoEncontradoError si el Momento no existe', async () => {
    const { deps } = makeDeps();
    await expect(updateMomento('inexistente', { notas: 'x' }, deps)).rejects.toBeInstanceOf(
      MomentoNoEncontradoError,
    );
  });
});

describe('updateMomento — sub-modalidad ⇔ Transmisión (Req 6.4)', () => {
  it('acepta sub-modalidad cuando el contexto es TRANSMISION', async () => {
    const { deps } = makeDeps();
    const actualizado = await updateMomento(
      MOMENTO_ID,
      { contextoAsistencia: 'TRANSMISION', subModalidad: 'BAR' },
      deps,
    );
    expect(actualizado.subModalidad).toBe('BAR');
  });

  it('rechaza sub-modalidad cuando el contexto no es TRANSMISION', async () => {
    const { deps } = makeDeps();
    await expect(
      updateMomento(
        MOMENTO_ID,
        { contextoAsistencia: 'EN_VIVO_LOCAL', subModalidad: 'STREAMING' },
        deps,
      ),
    ).rejects.toBeInstanceOf(SubModalidadInvalidaError);
  });

  it('rechaza si al cambiar a En Vivo queda una sub-modalidad previa', async () => {
    // Momento vigente en Transmisión con sub-modalidad; cambiar solo el contexto
    // a En Vivo dejaría la invariante rota → debe rechazarse.
    const { deps } = makeDeps(
      makeMomento({ contextoAsistencia: 'TRANSMISION', subModalidad: 'TELEVISION' }),
    );
    await expect(
      updateMomento(MOMENTO_ID, { contextoAsistencia: 'EN_VIVO_VISITA' }, deps),
    ).rejects.toBeInstanceOf(SubModalidadInvalidaError);
  });

  it('permite pasar a En Vivo si se limpia la sub-modalidad en el mismo parche', async () => {
    const { deps } = makeDeps(
      makeMomento({ contextoAsistencia: 'TRANSMISION', subModalidad: 'TELEVISION' }),
    );
    const actualizado = await updateMomento(
      MOMENTO_ID,
      { contextoAsistencia: 'EN_VIVO_LOCAL', subModalidad: null },
      deps,
    );
    expect(actualizado.contextoAsistencia).toBe('EN_VIVO_LOCAL');
    expect(actualizado.subModalidad).toBeNull();
  });
});

describe('updateMomento — notas round-trip (Req 7.1, 7.2)', () => {
  it('persiste las notas tal cual se ingresaron', async () => {
    const { deps, momentos } = makeDeps();
    const texto = 'Qué partidazo 🥳 — final 2-1 en el minuto 90.';
    const actualizado = await updateMomento(MOMENTO_ID, { notas: texto }, deps);
    expect(actualizado.notas).toBe(texto);
    const persistido = await momentos.findById(MOMENTO_ID);
    expect(persistido?.notas).toBe(texto);
  });
});

describe('updateMomento — Jugador_del_Partido en alineación (Req 8.1, 8.2)', () => {
  it('acepta un jugador por id de la alineación', async () => {
    const { deps } = makeDeps();
    const actualizado = await updateMomento(MOMENTO_ID, { jugadorDelPartido: 'j2' }, deps);
    expect(actualizado.jugadorDelPartido).toBe('j2');
  });

  it('acepta un jugador por nombre de la alineación', async () => {
    const { deps } = makeDeps();
    const actualizado = await updateMomento(MOMENTO_ID, { jugadorDelPartido: 'Delantero' }, deps);
    expect(actualizado.jugadorDelPartido).toBe('Delantero');
  });

  it('rechaza un jugador fuera de la alineación disponible', async () => {
    const { deps } = makeDeps();
    await expect(
      updateMomento(MOMENTO_ID, { jugadorDelPartido: 'Fantasma' }, deps),
    ).rejects.toBeInstanceOf(JugadorFueraDeAlineacionError);
  });

  it('permite limpiar el jugador con null', async () => {
    const { deps } = makeDeps(makeMomento({ jugadorDelPartido: 'j1' }));
    const actualizado = await updateMomento(MOMENTO_ID, { jugadorDelPartido: null }, deps);
    expect(actualizado.jugadorDelPartido).toBeNull();
  });
});

// Feature: digital-football-album, Property 10: La sub-modalidad requiere contexto Transmisión
// Validates: Requirements 6.4
describe('Property 10 — sub-modalidad ⇔ Transmisión', () => {
  it('acepta la sub-modalidad si y solo si el contexto es TRANSMISION', async () => {
    await pbtAssertAsync(
      fc.asyncProperty(
        fc.constantFrom<ContextoAsistencia>('EN_VIVO_LOCAL', 'EN_VIVO_VISITA', 'TRANSMISION'),
        fc.constantFrom<SubModalidadTransmision>('TELEVISION', 'BAR', 'STREAMING'),
        async (contexto, sub) => {
          const { deps } = makeDeps();
          if (contexto === 'TRANSMISION') {
            const r = await updateMomento(
              MOMENTO_ID,
              { contextoAsistencia: contexto, subModalidad: sub },
              deps,
            );
            expect(r.subModalidad).toBe(sub);
            expect(r.contextoAsistencia).toBe('TRANSMISION');
          } else {
            await expect(
              updateMomento(MOMENTO_ID, { contextoAsistencia: contexto, subModalidad: sub }, deps),
            ).rejects.toBeInstanceOf(SubModalidadInvalidaError);
          }
        },
      ),
    );
  });
});

// Feature: digital-football-album, Property 11: Round-trip de bitácora personal
// Validates: Requirements 7.2
describe('Property 11 — round-trip de notas', () => {
  it('almacenar y recuperar cualquier texto devuelve el mismo contenido', async () => {
    await pbtAssertAsync(
      fc.asyncProperty(fc.string(), async (texto) => {
        const { deps, momentos } = makeDeps();
        await updateMomento(MOMENTO_ID, { notas: texto }, deps);
        const persistido = await momentos.findById(MOMENTO_ID);
        expect(persistido?.notas).toBe(texto);
      }),
    );
  });
});

// Feature: digital-football-album, Property 12: El Jugador_del_Partido pertenece a la alineación
// Validates: Requirements 8.1, 8.2
describe('Property 12 — Jugador_del_Partido en la alineación', () => {
  it('acepta el jugador si y solo si pertenece a la alineación disponible', async () => {
    const idsAlineacion = ALINEACION.map((j) => j.id);
    const nombresAlineacion = ALINEACION.map((j) => j.nombre);
    const enAlineacion = [...idsAlineacion, ...nombresAlineacion];

    await pbtAssertAsync(
      fc.asyncProperty(
        fc.oneof(fc.constantFrom(...enAlineacion), fc.string({ minLength: 1, maxLength: 20 })),
        async (candidato) => {
          const { deps, momentos } = makeDeps();
          const pertenece = enAlineacion.includes(candidato);

          if (pertenece) {
            const r = await updateMomento(MOMENTO_ID, { jugadorDelPartido: candidato }, deps);
            expect(r.jugadorDelPartido).toBe(candidato);
          } else {
            await expect(
              updateMomento(MOMENTO_ID, { jugadorDelPartido: candidato }, deps),
            ).rejects.toBeInstanceOf(JugadorFueraDeAlineacionError);
            // El Momento no cambió de jugador.
            expect((await momentos.findById(MOMENTO_ID))?.jugadorDelPartido).toBeNull();
          }
        },
      ),
    );
  });
});
