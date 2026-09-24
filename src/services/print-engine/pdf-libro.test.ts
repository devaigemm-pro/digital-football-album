/**
 * Pruebas unitarias de la composición del PDF_Libro (Task 15.2 — Req 16.5,
 * 17.1–17.4).
 *
 * Cubren:
 *  - Montaje vs silueta según presencia de Foto_Principal (Property 24).
 *  - Numeración estable por `numero` que corresponde con el PDF_Stickers (Req 17.4).
 *  - Inclusión de fondos del Club y estadísticas por página (Req 17.1).
 *  - Recuadros vacíos NO se omiten en el libro (se dibujan como silueta) (Req 16.5).
 */
import { describe, it, expect } from 'vitest';
import type { Recuadro, UUID } from '../../domain/types.js';
import { buildPdfLibroSpec, buildRecuadroLibro } from './pdf-libro.js';

const TEMPORADA_ID = 'temp-1' as UUID;

function makeRecuadro(numero: number, fotoPrincipalId: UUID | null): Recuadro {
  return {
    id: `rec-${numero}`,
    albumId: 'album-1',
    partidoOficialId: `part-${numero}`,
    plantillaId: 'pl-1',
    numero,
    anchoMm: 50,
    altoMm: 70,
    fotoPrincipalId,
    estadoRecordatorio: fotoPrincipalId ? 'DETENIDO_POR_FOTO' : 'ACTIVO',
  };
}

const resolver = (id: UUID): string | null => `fotos/${id}.jpg`;

describe('buildRecuadroLibro — montaje o silueta (Property 24, Req 17.2, 17.3)', () => {
  it('monta la Foto_Principal con guía de pegado numerada cuando existe', () => {
    const r = buildRecuadroLibro(makeRecuadro(3, 'foto-3'), resolver);
    expect(r.modo).toBe('MONTAJE');
    expect(r.fotoObjectKey).toBe('fotos/foto-3.jpg');
    expect(r.guiaPegado.numero).toBe(3);
  });

  it('representa silueta punteada con guía numerada cuando no hay Foto_Principal (Req 16.5)', () => {
    const r = buildRecuadroLibro(makeRecuadro(4, null), resolver);
    expect(r.modo).toBe('SILUETA');
    expect(r.fotoObjectKey).toBeNull();
    expect(r.guiaPegado.numero).toBe(4); // conserva su número
  });

  it('cae a silueta si la foto referenciada no es resoluble', () => {
    const r = buildRecuadroLibro(makeRecuadro(5, 'foto-x'), () => null);
    expect(r.modo).toBe('SILUETA');
    expect(r.fotoObjectKey).toBeNull();
  });
});

describe('buildPdfLibroSpec — libro completo (Req 17.1, 17.4, 16.5)', () => {
  it('incluye todos los Recuadros (con y sin foto) numerados en orden estable', () => {
    const recuadros = [makeRecuadro(3, 'f3'), makeRecuadro(1, null), makeRecuadro(2, 'f2')];
    const spec = buildPdfLibroSpec({
      temporadaId: TEMPORADA_ID,
      recuadros,
      paginasClub: [{ fondoClubUrl: 'bg.png', estadisticas: 'stats' }],
      resolverFoto: resolver,
    });

    const todos = spec.paginas.flatMap((p) => p.recuadros);
    expect(todos.map((r) => r.numero)).toEqual([1, 2, 3]); // orden por numero
    expect(todos).toHaveLength(3); // los vacíos NO se omiten en el libro
    // El vacío (numero 1) es silueta; los demás montaje.
    expect(todos.find((r) => r.numero === 1)?.modo).toBe('SILUETA');
    expect(todos.find((r) => r.numero === 2)?.modo).toBe('MONTAJE');
  });

  it('incorpora fondo del Club y estadísticas de la página (Req 17.1)', () => {
    const spec = buildPdfLibroSpec({
      temporadaId: TEMPORADA_ID,
      recuadros: [makeRecuadro(1, 'f1')],
      paginasClub: [{ fondoClubUrl: 'club-bg.png', estadisticas: '10 goles' }],
      resolverFoto: resolver,
    });
    expect(spec.paginas[0]?.fondoClubUrl).toBe('club-bg.png');
    expect(spec.paginas[0]?.estadisticas).toBe('10 goles');
  });

  it('genera al menos una página aunque no se provean páginas del Club', () => {
    const spec = buildPdfLibroSpec({
      temporadaId: TEMPORADA_ID,
      recuadros: [makeRecuadro(1, null)],
      paginasClub: [],
      resolverFoto: resolver,
    });
    expect(spec.paginas.length).toBeGreaterThanOrEqual(1);
    expect(spec.paginas.flatMap((p) => p.recuadros)).toHaveLength(1);
  });
});
