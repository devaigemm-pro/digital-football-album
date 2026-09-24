// Pruebas unitarias de `linkFoto` (Task 8.4).
//
// Cubren los tres casos de coincidencia:
//   - única  → enlaza y marca la foto `ASOCIADA` sin notificar (Req 9.4);
//   - cero    → conserva sin enlace, marca `PENDIENTE_ASOCIACION` y notifica (Req 9.5);
//   - múltiple → conserva sin enlace, marca `PENDIENTE_ASOCIACION` y notifica (Req 9.5).
// Además: propagación de la señal al resolver y error cuando la foto no existe.
// El repositorio, el resolver de candidatos y el notificador se inyectan como
// dobles: nunca se toca la red ni una base de datos viva.
//
// Requirements: 9.4, 9.5

import { describe, expect, it, vi } from 'vitest';

import type { Foto, PartidoOficial } from '../../domain/types.js';
import { createInMemoryRepositories } from '../../persistence/in-memory/factory.js';
import type { FotoRepository } from '../../persistence/repositories.js';
import { FotoNoEncontradaError, linkFoto, type CandidateResolver } from './link-foto.js';
import type { AvisoAsociacionPendiente, Notifier } from './notifier.js';

function makeFoto(overrides: Partial<Foto> = {}): Foto {
  return {
    id: 'foto-1',
    momentoId: 'momento-1',
    objectKey: 'fotos/foto-1.jpg',
    anchoPx: 3000,
    altoPx: 2000,
    estadoAsociacion: 'PENDIENTE_ASOCIACION',
    ...overrides,
  };
}

function makePartido(id: string): PartidoOficial {
  return {
    id,
    temporadaId: 'temp-1',
    partidoExternoId: `ext-${id}`,
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
  };
}

/** Notificador espía que registra los avisos emitidos. */
function makeNotifier(): { notifier: Notifier; avisos: () => AvisoAsociacionPendiente[] } {
  const avisos: AvisoAsociacionPendiente[] = [];
  const notifier: Notifier = {
    notificarAsociacionPendiente: (aviso) => {
      avisos.push(aviso);
      return Promise.resolve();
    },
  };
  return { notifier, avisos: () => avisos };
}

async function seedFoto(foto: Foto): Promise<FotoRepository> {
  const repos = createInMemoryRepositories();
  await repos.fotos.create(foto);
  return repos.fotos;
}

const resolverCon =
  (partidos: readonly PartidoOficial[]): CandidateResolver =>
  () =>
    Promise.resolve(partidos);

describe('linkFoto', () => {
  it('enlaza y marca ASOCIADA con coincidencia única, sin notificar', async () => {
    const fotoRepository = await seedFoto(makeFoto());
    const { notifier, avisos } = makeNotifier();

    const result = await linkFoto('foto-1', {
      fotoRepository,
      resolveCandidates: resolverCon([makePartido('partido-1')]),
      notifier,
    });

    expect(result.resultado).toBe('ENLAZADA');
    expect(result.foto.id).toBe('foto-1');
    expect(result.foto.estadoAsociacion).toBe('ASOCIADA');
    if (result.resultado === 'ENLAZADA') {
      expect(result.partidoId).toBe('partido-1');
    }

    // Persistido como ASOCIADA.
    const persistida = await fotoRepository.findById('foto-1');
    expect(persistida?.estadoAsociacion).toBe('ASOCIADA');

    // No notifica en el camino feliz.
    expect(avisos()).toEqual([]);
  });

  it('con cero coincidencias: conserva sin enlace, marca PENDIENTE y notifica', async () => {
    const fotoRepository = await seedFoto(makeFoto({ estadoAsociacion: 'ASOCIADA' }));
    const { notifier, avisos } = makeNotifier();

    const result = await linkFoto('foto-1', {
      fotoRepository,
      resolveCandidates: resolverCon([]),
      notifier,
    });

    expect(result.resultado).toBe('PENDIENTE_ASOCIACION');
    expect(result.foto.estadoAsociacion).toBe('PENDIENTE_ASOCIACION');
    if (result.resultado === 'PENDIENTE_ASOCIACION') {
      expect(result.candidatos).toBe(0);
    }

    const persistida = await fotoRepository.findById('foto-1');
    expect(persistida?.estadoAsociacion).toBe('PENDIENTE_ASOCIACION');

    expect(avisos()).toEqual([{ fotoId: 'foto-1', motivo: 'SIN_COINCIDENCIA', candidatos: 0 }]);
  });

  it('con múltiples coincidencias: conserva sin enlace, marca PENDIENTE y notifica', async () => {
    const fotoRepository = await seedFoto(makeFoto());
    const { notifier, avisos } = makeNotifier();

    const result = await linkFoto('foto-1', {
      fotoRepository,
      resolveCandidates: resolverCon([makePartido('a'), makePartido('b'), makePartido('c')]),
      notifier,
    });

    expect(result.resultado).toBe('PENDIENTE_ASOCIACION');
    expect(result.foto.estadoAsociacion).toBe('PENDIENTE_ASOCIACION');
    if (result.resultado === 'PENDIENTE_ASOCIACION') {
      expect(result.candidatos).toBe(3);
    }

    const persistida = await fotoRepository.findById('foto-1');
    expect(persistida?.estadoAsociacion).toBe('PENDIENTE_ASOCIACION');

    expect(avisos()).toEqual([
      { fotoId: 'foto-1', motivo: 'MULTIPLES_COINCIDENCIAS', candidatos: 3 },
    ]);
  });

  it('propaga la señal de cancelación al resolver de candidatos', async () => {
    const fotoRepository = await seedFoto(makeFoto());
    const { notifier } = makeNotifier();
    const controller = new AbortController();
    const resolveCandidates = vi
      .fn<CandidateResolver>()
      .mockResolvedValue([makePartido('partido-1')]);

    await linkFoto('foto-1', {
      fotoRepository,
      resolveCandidates,
      notifier,
      signal: controller.signal,
    });

    expect(resolveCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'foto-1' }),
      controller.signal,
    );
  });

  it('lanza FotoNoEncontradaError si la foto no existe', async () => {
    const fotoRepository = await seedFoto(makeFoto());
    const { notifier, avisos } = makeNotifier();
    const resolveCandidates = vi.fn<CandidateResolver>().mockResolvedValue([]);

    await expect(
      linkFoto('inexistente', { fotoRepository, resolveCandidates, notifier }),
    ).rejects.toBeInstanceOf(FotoNoEncontradaError);

    // No resuelve candidatos ni notifica si la foto no existe.
    expect(resolveCandidates).not.toHaveBeenCalled();
    expect(avisos()).toEqual([]);
  });
});
