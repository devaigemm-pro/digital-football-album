// Pruebas de `uploadFoto` (Task 11.1).
//
// Cubren la carga/captura y agrupación de fotos en el Momento del partido:
//   - varias cargas para un mismo partido se agrupan en un ÚNICO Momento
//     (relación 1:1 con el partido) y el conteo del Momento iguala las cargas
//     (Req 5.3, 5.4);
//   - la subida al object storage ocurre y se persiste la `objectKey` (Req 5.1);
//   - ambas fuentes (`galeria` — Req 5.1, `camara` — Req 5.2) funcionan;
//   - un `partidoId` inexistente falla sin subir bytes.
// Los repositorios y el object storage se inyectan como dobles en memoria: nunca
// se toca la red ni una base de datos viva.
//
// Requirements: 5.1, 5.2, 5.3, 5.4

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { PartidoOficial } from '../../domain/types.js';
import {
  InMemoryFotoRepository,
  InMemoryMomentoRepository,
  InMemoryPartidoOficialRepository,
} from '../../persistence/in-memory/repositories.js';
import { InMemoryObjectStorage } from './object-storage.js';
import {
  PartidoNoEncontradoError,
  uploadFoto,
  type FuenteFoto,
  type UploadFotoDeps,
} from './upload-foto.js';

const PARTIDO_ID = 'partido-1';

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
    alineacion: [],
    eventos: [],
    ...overrides,
  };
}

/**
 * Arma las dependencias con un partido sembrado y un generador de ids
 * determinista para aserciones reproducibles.
 */
function makeDeps(partido: PartidoOficial | null = makePartido()): {
  deps: UploadFotoDeps;
  storage: InMemoryObjectStorage;
} {
  const storage = new InMemoryObjectStorage();
  let contador = 0;
  const newId = (): string => {
    contador += 1;
    return `id-${contador}`;
  };
  return {
    storage,
    deps: {
      partidos: new InMemoryPartidoOficialRepository(partido !== null ? [partido] : []),
      momentos: new InMemoryMomentoRepository(),
      fotos: new InMemoryFotoRepository(),
      storage,
      newId,
    },
  };
}

const binario = (n = 1): Uint8Array => Uint8Array.from([n, n + 1, n + 2]);

describe('uploadFoto', () => {
  it('crea el Momento en la primera carga y agrupa la foto en él', async () => {
    const { deps, storage } = makeDeps();

    const { foto, momento, momentoCreado } = await uploadFoto(
      PARTIDO_ID,
      { fuente: 'galeria', binario: binario(), anchoPx: 3000, altoPx: 2000 },
      deps,
    );

    expect(momentoCreado).toBe(true);
    expect(momento.partidoOficialId).toBe(PARTIDO_ID);
    expect(foto.momentoId).toBe(momento.id);
    // La subida ocurrió y la foto persiste la clave devuelta por el storage.
    expect(storage.size).toBe(1);
    expect(storage.has(foto.objectKey)).toBe(true);

    const fotosDelMomento = await deps.fotos.findByMomentoId(momento.id);
    expect(fotosDelMomento).toHaveLength(1);
  });

  it('agrupa múltiples fotos de un partido bajo un ÚNICO Momento', async () => {
    const { deps } = makeDeps();

    const r1 = await uploadFoto(
      PARTIDO_ID,
      { fuente: 'galeria', binario: binario(1), anchoPx: 3000, altoPx: 2000 },
      deps,
    );
    const r2 = await uploadFoto(
      PARTIDO_ID,
      { fuente: 'camara', binario: binario(4), anchoPx: 4000, altoPx: 3000 },
      deps,
    );
    const r3 = await uploadFoto(
      PARTIDO_ID,
      { fuente: 'galeria', binario: binario(7), anchoPx: 1200, altoPx: 800 },
      deps,
    );

    // Un solo Momento reutilizado en las tres cargas (1:1 con el partido).
    expect(r2.momentoCreado).toBe(false);
    expect(r3.momentoCreado).toBe(false);
    expect(r2.momento.id).toBe(r1.momento.id);
    expect(r3.momento.id).toBe(r1.momento.id);
    expect(await deps.momentos.count()).toBe(1);

    // El conteo de fotos del Momento iguala la cantidad de cargas.
    const fotos = await deps.fotos.findByMomentoId(r1.momento.id);
    expect(fotos).toHaveLength(3);
    // Cada foto tiene una objectKey distinta.
    const claves = new Set(fotos.map((f) => f.objectKey));
    expect(claves.size).toBe(3);
  });

  it('acepta ambas fuentes: galería (Req 5.1) y cámara (Req 5.2)', async () => {
    for (const fuente of ['galeria', 'camara'] as FuenteFoto[]) {
      const { deps } = makeDeps();
      const { foto } = await uploadFoto(
        PARTIDO_ID,
        { fuente, binario: binario(), anchoPx: 3000, altoPx: 2000 },
        deps,
      );
      expect(foto.objectKey).not.toBe('');
      expect(foto.anchoPx).toBe(3000);
      expect(foto.altoPx).toBe(2000);
    }
  });

  it('lanza PartidoNoEncontradoError y no sube bytes si el partido no existe', async () => {
    const { deps, storage } = makeDeps(null);

    await expect(
      uploadFoto(
        'inexistente',
        { fuente: 'galeria', binario: binario(), anchoPx: 100, altoPx: 100 },
        deps,
      ),
    ).rejects.toBeInstanceOf(PartidoNoEncontradoError);

    // No debe haber subido nada ni creado Momento/Foto.
    expect(storage.size).toBe(0);
    expect(await deps.momentos.count()).toBe(0);
    expect(await deps.fotos.count()).toBe(0);
  });

  // Property test de agrupación: para cualquier cantidad N ≥ 1 de cargas para un
  // mismo partido (con fuentes mixtas), todas quedan en un único Momento y el
  // conteo del Momento es exactamente N.
  it('agrupa N cargas arbitrarias en un único Momento con conteo == N', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            fuente: fc.constantFrom<FuenteFoto>('galeria', 'camara'),
            b: fc.integer({ min: 0, max: 250 }),
            anchoPx: fc.integer({ min: 1, max: 8000 }),
            altoPx: fc.integer({ min: 1, max: 8000 }),
          }),
          { minLength: 1, maxLength: 12 },
        ),
        async (cargas) => {
          const { deps } = makeDeps();

          const momentoIds = new Set<string>();
          for (const c of cargas) {
            const { momento } = await uploadFoto(
              PARTIDO_ID,
              {
                fuente: c.fuente,
                binario: Uint8Array.from([c.b]),
                anchoPx: c.anchoPx,
                altoPx: c.altoPx,
              },
              deps,
            );
            momentoIds.add(momento.id);
          }

          // Un único Momento para el partido (1:1).
          expect(momentoIds.size).toBe(1);
          expect(await deps.momentos.count()).toBe(1);

          // El conteo del Momento iguala la cantidad de cargas.
          const [momentoId] = [...momentoIds];
          const fotos = await deps.fotos.findByMomentoId(momentoId as string);
          expect(fotos).toHaveLength(cargas.length);
        },
      ),
      { numRuns: 100 },
    );
  });
});
