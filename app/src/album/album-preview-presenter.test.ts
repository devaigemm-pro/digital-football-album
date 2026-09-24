// Pruebas unitarias del AlbumPreviewPresenter (Task 29.1 — Requirements: 4.1,
// 4.2, 4.3, 4.4, 4.5).
//
// TypeScript puro con un `AlbumPreviewClient` doble en memoria: NO requieren
// React Native ni red real. Cubren:
//   - entradas MONTADA que exponen su `miniaturaKey` (Req 4.1);
//   - entradas VACIO que representan silueta (Req 4.2);
//   - la lista de faltantes coincide con los Recuadros vacíos (Req 4.3);
//   - se conserva el orden de las entradas del backend (Req 4.1);
//   - la máquina de estados no bloqueante idle → loading → loaded (Req 4.5);
//   - estado `error` ante fallo del cliente SIN lanzar a la UI (Req 4.5).
//
// Usa el shim central de globales de Jest (app/src/testing/jest-globals.d.ts);
// NO se declaran globales por archivo.

import {
  ALBUM_PREVIEW_ERROR_MESSAGE,
  AlbumPreviewPresenter,
  type AlbumPreviewClient,
  type AlbumPreviewData,
  type AlbumPreviewEntry,
  type AlbumPreviewState,
} from './album-preview-presenter';

const TEMPORADA_ID = 'temporada-2024';

/** Construye datos de previsualización con las entradas y faltantes indicados. */
function previewData(
  recuadros: readonly AlbumPreviewEntry[],
  recuadrosSinFotoPrincipal: readonly number[],
): AlbumPreviewData {
  return { recuadros, recuadrosSinFotoPrincipal };
}

/** Cliente de previsualización doble que resuelve con datos fijos. */
class FakeAlbumPreviewClient implements AlbumPreviewClient {
  calls = 0;
  constructor(private readonly data: AlbumPreviewData) {}
  getPreview(_temporadaId: string): Promise<AlbumPreviewData> {
    this.calls += 1;
    return Promise.resolve(this.data);
  }
}

/**
 * Cliente que rechaza para ejercitar el camino de error (Req 4.5). Un `deferred`
 * opcional permite controlar cuándo resuelve para observar el estado `loading`.
 */
class ControllableClient implements AlbumPreviewClient {
  resolve: ((data: AlbumPreviewData) => void) | null = null;
  reject: ((err: unknown) => void) | null = null;
  getPreview(_temporadaId: string): Promise<AlbumPreviewData> {
    return new Promise<AlbumPreviewData>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}

const MONTADA_1: AlbumPreviewEntry = {
  numero: 1,
  estado: 'MONTADA',
  miniaturaKey: 'thumbs/1.webp',
};
const VACIO_2: AlbumPreviewEntry = { numero: 2, estado: 'VACIO' };
const MONTADA_3: AlbumPreviewEntry = {
  numero: 3,
  estado: 'MONTADA',
  miniaturaKey: 'thumbs/3.webp',
};
const VACIO_4: AlbumPreviewEntry = { numero: 4, estado: 'VACIO' };

describe('AlbumPreviewPresenter — estado inicial (Req 4.5)', () => {
  it('arranca en idle, sin entradas ni faltantes y sin error', () => {
    const client = new FakeAlbumPreviewClient(previewData([], []));
    const presenter = new AlbumPreviewPresenter(client);

    const state = presenter.getState();
    expect(state.status).toBe('idle');
    expect(state.recuadros).toEqual([]);
    expect(state.faltantes).toEqual([]);
    expect(state.faltantesCount).toBe(0);
    expect(state.error).toBeNull();
  });

  it('subscribe emite el estado actual de inmediato', () => {
    const client = new FakeAlbumPreviewClient(previewData([], []));
    const presenter = new AlbumPreviewPresenter(client);

    let seen: AlbumPreviewState | null = null;
    presenter.subscribe((s) => {
      seen = s;
    });
    expect(seen !== null).toBe(true);
    expect((seen as unknown as AlbumPreviewState).status).toBe('idle');
  });
});

describe('AlbumPreviewPresenter.load — carga exitosa (Req 4.1, 4.2, 4.3)', () => {
  it('expone las entradas MONTADA con su miniaturaKey (Req 4.1)', async () => {
    const client = new FakeAlbumPreviewClient(
      previewData([MONTADA_1, MONTADA_3], []),
    );
    const presenter = new AlbumPreviewPresenter(client);

    await presenter.load(TEMPORADA_ID);

    const state = presenter.getState();
    expect(state.status).toBe('loaded');
    const montadas = state.recuadros.filter((r) => r.estado === 'MONTADA');
    expect(montadas).toHaveLength(2);
    // Cada montada conserva la clave de su miniatura optimizada.
    expect(
      montadas.map((r) => (r as { miniaturaKey: string }).miniaturaKey),
    ).toEqual(['thumbs/1.webp', 'thumbs/3.webp']);
  });

  it('representa los Recuadros VACIO como silueta (estado VACIO) (Req 4.2)', async () => {
    const client = new FakeAlbumPreviewClient(
      previewData([VACIO_2, VACIO_4], [2, 4]),
    );
    const presenter = new AlbumPreviewPresenter(client);

    await presenter.load(TEMPORADA_ID);

    const state = presenter.getState();
    const vacios = state.recuadros.filter((r) => r.estado === 'VACIO');
    expect(vacios).toHaveLength(2);
    expect(vacios.map((r) => r.numero)).toEqual([2, 4]);
  });

  it('la lista de faltantes coincide con los Recuadros sin Foto_Principal (Req 4.3)', async () => {
    const client = new FakeAlbumPreviewClient(
      previewData([MONTADA_1, VACIO_2, MONTADA_3, VACIO_4], [2, 4]),
    );
    const presenter = new AlbumPreviewPresenter(client);

    await presenter.load(TEMPORADA_ID);

    const state = presenter.getState();
    expect(state.faltantes).toEqual([2, 4]);
    expect(state.faltantesCount).toBe(2);
  });

  it('conserva el orden de las entradas devueltas por el backend (Req 4.1)', async () => {
    const client = new FakeAlbumPreviewClient(
      previewData([MONTADA_1, VACIO_2, MONTADA_3, VACIO_4], [2, 4]),
    );
    const presenter = new AlbumPreviewPresenter(client);

    await presenter.load(TEMPORADA_ID);

    expect(presenter.getState().recuadros.map((r) => r.numero)).toEqual([
      1, 2, 3, 4,
    ]);
  });

  it('un álbum sin Recuadros produce una vista cargada vacía (no error)', async () => {
    const client = new FakeAlbumPreviewClient(previewData([], []));
    const presenter = new AlbumPreviewPresenter(client);

    await presenter.load(TEMPORADA_ID);

    const state = presenter.getState();
    expect(state.status).toBe('loaded');
    expect(state.recuadros).toEqual([]);
    expect(state.faltantesCount).toBe(0);
    expect(state.error).toBeNull();
  });
});

describe('AlbumPreviewPresenter.load — transiciones de estado (Req 4.5)', () => {
  it('transiciona idle → loading → loaded emitiendo cada fase', async () => {
    const client = new ControllableClient();
    const presenter = new AlbumPreviewPresenter(client);

    const statuses: string[] = [];
    presenter.subscribe((s) => {
      statuses.push(s.status);
    });

    const pending = presenter.load(TEMPORADA_ID);
    // Tras iniciar, la fase es loading sin bloquear (Req 4.5).
    expect(presenter.getState().status).toBe('loading');

    // El cliente resuelve: la fase pasa a loaded.
    client.resolve?.(previewData([MONTADA_1], []));
    await pending;

    expect(presenter.getState().status).toBe('loaded');
    // Emitió el estado inicial (idle) al suscribir, luego loading y loaded.
    expect(statuses).toEqual(['idle', 'loading', 'loaded']);
  });
});

describe('AlbumPreviewPresenter.load — fallo no bloqueante (Req 4.5)', () => {
  it('refleja el error como estado sin lanzar a la UI', async () => {
    const client = new ControllableClient();
    const presenter = new AlbumPreviewPresenter(client);

    const pending = presenter.load(TEMPORADA_ID);
    client.reject?.(new Error('fallo de red'));
    // `load` nunca rechaza: resuelve aunque el cliente falle (Req 4.5).
    await pending;

    const state = presenter.getState();
    expect(state.status).toBe('error');
    expect(state.error).toBe('fallo de red');
  });

  it('usa un mensaje por defecto cuando el error no aporta uno legible', async () => {
    const client = new ControllableClient();
    const presenter = new AlbumPreviewPresenter(client);

    const pending = presenter.load(TEMPORADA_ID);
    client.reject?.({});
    await pending;

    expect(presenter.getState().error).toBe(ALBUM_PREVIEW_ERROR_MESSAGE);
  });

  it('permite recargar con éxito tras un error', async () => {
    const failing = new ControllableClient();
    const presenter = new AlbumPreviewPresenter(failing);

    const firstLoad = presenter.load(TEMPORADA_ID);
    failing.reject?.(new Error('boom'));
    await firstLoad;
    expect(presenter.getState().status).toBe('error');

    // Segunda carga con el mismo cliente controlable, ahora exitosa.
    const secondLoad = presenter.load(TEMPORADA_ID);
    expect(presenter.getState().status).toBe('loading');
    failing.resolve?.(previewData([MONTADA_1], []));
    await secondLoad;

    const state = presenter.getState();
    expect(state.status).toBe('loaded');
    expect(state.error).toBeNull();
    expect(state.recuadros).toHaveLength(1);
  });
});
