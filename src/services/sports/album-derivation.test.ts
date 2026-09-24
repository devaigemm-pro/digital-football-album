// Pruebas unitarias de la derivación/re-derivación del álbum (`deriveAlbum`,
// Task 8.3).
//
// Cubren: derivación inicial con exactamente un Recuadro por Partido_Oficial
// (biyección, Req 4.1, 4.3); exclusión de amistosos —sin fuga de Recuadros—
// (Req 4.2); y re-derivación tras altas/bajas del fixture conservando la
// Foto_Principal y el `numero` de los partidos que persisten (Req 4.4). Los
// repositorios se inyectan como dobles en memoria: nunca se toca la red.
//
// Requirements: 4.1, 4.2, 4.3, 4.4

import { describe, expect, it } from 'vitest';

import type { PlantillaAlbum, UUID } from '../../domain/types.js';
import {
  InMemoryAlbumRepository,
  InMemoryPartidoOficialRepository,
  InMemoryPlantillaAlbumRepository,
  InMemoryRecuadroRepository,
} from '../../persistence/in-memory/repositories.js';
import { deriveAlbum, type DeriveAlbumDeps, type FixtureEntry } from './album-derivation.js';

const TEMPORADA_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as UUID;
const CLUB_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' as UUID;
const PLANTILLA_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' as UUID;

const PLANTILLA: PlantillaAlbum = {
  id: PLANTILLA_ID,
  clubId: CLUB_ID,
  recuadroAnchoMm: 50,
  recuadroAltoMm: 70,
};

/** Genera ids deterministas y únicos para hacer aserciones reproducibles. */
function makeIdGenerator(): () => UUID {
  let n = 0;
  return (): UUID => {
    n += 1;
    return `id-${n}`;
  };
}

/** Construye los repositorios en memoria y las dependencias inyectadas. */
function makeDeps(): {
  deps: DeriveAlbumDeps;
  albumes: InMemoryAlbumRepository;
  partidos: InMemoryPartidoOficialRepository;
  recuadros: InMemoryRecuadroRepository;
} {
  const albumes = new InMemoryAlbumRepository();
  const partidos = new InMemoryPartidoOficialRepository();
  const recuadros = new InMemoryRecuadroRepository();
  const plantillas = new InMemoryPlantillaAlbumRepository([PLANTILLA]);
  const deps: DeriveAlbumDeps = {
    albumes,
    partidos,
    recuadros,
    plantillas,
    newId: makeIdGenerator(),
  };
  return { deps, albumes, partidos, recuadros };
}

function entry(over: Partial<FixtureEntry> & { partidoExternoId: string }): FixtureEntry {
  return {
    competicion: 'Liga',
    tipoCompeticion: 'LIGA',
    rival: 'Rival FC',
    fechaHora: '2025-05-01T20:00:00.000Z',
    estado: 'PROGRAMADO',
    ...over,
  };
}

describe('deriveAlbum', () => {
  it('deriva exactamente un Recuadro por Partido_Oficial (biyección)', async () => {
    const { deps, partidos, recuadros } = makeDeps();

    const fixture: FixtureEntry[] = [
      entry({ partidoExternoId: 'p1', fechaHora: '2025-05-01T20:00:00.000Z' }),
      entry({ partidoExternoId: 'p2', fechaHora: '2025-05-08T20:00:00.000Z' }),
      entry({ partidoExternoId: 'p3', fechaHora: '2025-05-15T20:00:00.000Z' }),
    ];

    const result = await deriveAlbum(TEMPORADA_ID, CLUB_ID, fixture, deps);

    // #Recuadros === #Partidos_Oficiales y correspondencia 1:1 (Req 4.1, 4.3).
    expect(await partidos.count()).toBe(3);
    expect(await recuadros.count()).toBe(3);
    expect(result.partidosCreados).toBe(3);

    const todosRecuadros = await recuadros.findByAlbumId(result.albumId);
    const partidoIds = new Set(todosRecuadros.map((r) => r.partidoOficialId));
    expect(partidoIds.size).toBe(3); // sin duplicados de partido
    for (const r of todosRecuadros) {
      const partido = await partidos.findById(r.partidoOficialId);
      expect(partido).not.toBeNull();
      expect(r.albumId).toBe(result.albumId);
      expect(r.fotoPrincipalId).toBeNull();
    }

    // Numeración determinista por fechaHora ascendente.
    const byExterno = new Map<string, number>();
    for (const p of await partidos.findByTemporadaId(TEMPORADA_ID)) {
      const rec = todosRecuadros.find((r) => r.partidoOficialId === p.id);
      byExterno.set(p.partidoExternoId, rec!.numero);
    }
    expect(byExterno.get('p1')).toBe(1);
    expect(byExterno.get('p2')).toBe(2);
    expect(byExterno.get('p3')).toBe(3);
  });

  it('excluye los amistosos: no generan Partido_Oficial ni Recuadro', async () => {
    const { deps, partidos, recuadros } = makeDeps();

    const fixture: FixtureEntry[] = [
      entry({ partidoExternoId: 'liga1', tipoCompeticion: 'LIGA' }),
      entry({ partidoExternoId: 'copa1', tipoCompeticion: 'COPA_NACIONAL' }),
      entry({ partidoExternoId: 'inter1', tipoCompeticion: 'INTERNACIONAL' }),
      // Amistoso marcado explícitamente aunque venga con tipo oficial: se excluye.
      entry({ partidoExternoId: 'amistoso1', tipoCompeticion: 'LIGA', esAmistoso: true }),
    ];

    const result = await deriveAlbum(TEMPORADA_ID, CLUB_ID, fixture, deps);

    expect(result.amistososExcluidos).toBe(1);
    expect(await partidos.count()).toBe(3);
    expect(await recuadros.count()).toBe(3);

    const externos = (await partidos.findByTemporadaId(TEMPORADA_ID)).map(
      (p) => p.partidoExternoId,
    );
    expect(externos).not.toContain('amistoso1');
    expect(externos.sort()).toEqual(['copa1', 'inter1', 'liga1']);
  });

  it('re-deriva tras altas/bajas conservando Foto_Principal y numero de los persistentes', async () => {
    const { deps, partidos, recuadros } = makeDeps();

    // Derivación inicial: p1, p2, p3.
    const fixtureInicial: FixtureEntry[] = [
      entry({ partidoExternoId: 'p1', fechaHora: '2025-05-01T20:00:00.000Z' }),
      entry({ partidoExternoId: 'p2', fechaHora: '2025-05-08T20:00:00.000Z' }),
      entry({ partidoExternoId: 'p3', fechaHora: '2025-05-15T20:00:00.000Z' }),
    ];
    const inicial = await deriveAlbum(TEMPORADA_ID, CLUB_ID, fixtureInicial, deps);
    const albumId = inicial.albumId;

    // El usuario marca una Foto_Principal en el Recuadro de p2.
    const partidoP2 = await partidos.findByPartidoExternoId(TEMPORADA_ID, 'p2');
    const recuadroP2 = await recuadros.findByPartidoOficialId(partidoP2!.id);
    const numeroP2Antes = recuadroP2!.numero;
    const FOTO_PRINCIPAL = 'foto-principal-p2' as UUID;
    await recuadros.update(recuadroP2!.id, { fotoPrincipalId: FOTO_PRINCIPAL });

    const partidoP3 = await partidos.findByPartidoExternoId(TEMPORADA_ID, 'p3');
    const recuadroP3 = await recuadros.findByPartidoOficialId(partidoP3!.id);
    const numeroP3Antes = recuadroP3!.numero;

    // Re-derivación: se retira p1, persiste p2 y p3, se agrega p4.
    const fixtureActualizado: FixtureEntry[] = [
      entry({ partidoExternoId: 'p2', fechaHora: '2025-05-08T20:00:00.000Z' }),
      entry({ partidoExternoId: 'p3', fechaHora: '2025-05-15T20:00:00.000Z' }),
      entry({ partidoExternoId: 'p4', fechaHora: '2025-05-22T20:00:00.000Z' }),
    ];
    const rederivado = await deriveAlbum(TEMPORADA_ID, CLUB_ID, fixtureActualizado, deps);

    // Biyección mantenida: 3 partidos, 3 recuadros.
    expect(await partidos.count()).toBe(3);
    expect(await recuadros.count()).toBe(3);
    expect(rederivado.partidosEliminados).toBe(1);
    expect(rederivado.partidosCreados).toBe(1);

    // p1 eliminado junto con su Recuadro.
    expect(await partidos.findByPartidoExternoId(TEMPORADA_ID, 'p1')).toBeNull();

    // p2 persiste: conserva Foto_Principal y numero.
    const partidoP2Despues = await partidos.findByPartidoExternoId(TEMPORADA_ID, 'p2');
    const recuadroP2Despues = await recuadros.findByPartidoOficialId(partidoP2Despues!.id);
    expect(recuadroP2Despues!.fotoPrincipalId).toBe(FOTO_PRINCIPAL);
    expect(recuadroP2Despues!.numero).toBe(numeroP2Antes);

    // p3 persiste: conserva su numero (sin renumeración densa).
    const partidoP3Despues = await partidos.findByPartidoExternoId(TEMPORADA_ID, 'p3');
    const recuadroP3Despues = await recuadros.findByPartidoOficialId(partidoP3Despues!.id);
    expect(recuadroP3Despues!.numero).toBe(numeroP3Antes);

    // p4 es nuevo: tiene su propio Recuadro sin Foto_Principal.
    const partidoP4 = await partidos.findByPartidoExternoId(TEMPORADA_ID, 'p4');
    const recuadroP4 = await recuadros.findByPartidoOficialId(partidoP4!.id);
    expect(recuadroP4).not.toBeNull();
    expect(recuadroP4!.fotoPrincipalId).toBeNull();

    // Los numeros de los tres recuadros son únicos (correspondencia 1:1 con stickers).
    const numeros = (await recuadros.findByAlbumId(albumId)).map((r) => r.numero);
    expect(new Set(numeros).size).toBe(numeros.length);
  });

  it('reutiliza el mismo Álbum entre derivaciones (no crea uno nuevo)', async () => {
    const { deps, albumes } = makeDeps();

    const first = await deriveAlbum(
      TEMPORADA_ID,
      CLUB_ID,
      [entry({ partidoExternoId: 'p1' })],
      deps,
    );
    const second = await deriveAlbum(
      TEMPORADA_ID,
      CLUB_ID,
      [entry({ partidoExternoId: 'p1' })],
      deps,
    );

    expect(first.albumId).toBe(second.albumId);
    expect(await albumes.count()).toBe(1);
  });

  it('es idempotente ante el mismo fixture (sin altas/bajas)', async () => {
    const { deps, partidos, recuadros } = makeDeps();
    const fixture: FixtureEntry[] = [
      entry({ partidoExternoId: 'p1', fechaHora: '2025-05-01T20:00:00.000Z' }),
      entry({ partidoExternoId: 'p2', fechaHora: '2025-05-08T20:00:00.000Z' }),
    ];

    await deriveAlbum(TEMPORADA_ID, CLUB_ID, fixture, deps);
    const result = await deriveAlbum(TEMPORADA_ID, CLUB_ID, fixture, deps);

    expect(result.partidosCreados).toBe(0);
    expect(result.partidosEliminados).toBe(0);
    expect(await partidos.count()).toBe(2);
    expect(await recuadros.count()).toBe(2);
  });

  it('lanza un error si el Club no tiene Plantilla_Album', async () => {
    const albumes = new InMemoryAlbumRepository();
    const partidos = new InMemoryPartidoOficialRepository();
    const recuadros = new InMemoryRecuadroRepository();
    const plantillas = new InMemoryPlantillaAlbumRepository(); // sin plantillas
    const deps: DeriveAlbumDeps = {
      albumes,
      partidos,
      recuadros,
      plantillas,
      newId: makeIdGenerator(),
    };

    await expect(
      deriveAlbum(TEMPORADA_ID, CLUB_ID, [entry({ partidoExternoId: 'p1' })], deps),
    ).rejects.toThrow(/Plantilla_Album/);
  });
});
