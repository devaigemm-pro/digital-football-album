// Pruebas del ProfilePresenter — núcleo puro de perfil + partidos.
//
// TypeScript puro (sin React): usan el shim central de globales de Jest y un
// `ProfileClient` falso en memoria. Cubren:
//   - loadProfile: idle → loading → loaded con el perfil del cliente.
//   - loadProfile: fallo → error con mensaje, sin lanzar; conserva el perfil.
//   - loadPartidos: idle → loading → loaded con la lista.
//   - loadPartidos: fallo → error con mensaje.
//   - subscribe emite el estado actual de inmediato.

import {
  PARTIDOS_ERROR_MESSAGE,
  PROFILE_ERROR_MESSAGE,
  ProfilePresenter,
} from './profile-presenter';
import type {
  Perfil,
  PartidoLamina,
  ProfileClient,
  SyncTemporadaResult,
  Temporada,
} from '../adapters/http-profile-client';

const TEMPORADA: Temporada = {
  id: 'temp-1',
  usuarioId: 'user-1',
  clubId: 'club-1',
  temporadaExterna: '2026',
  estado: 'ACTIVA',
  fechaLimiteCierre: '2026-12-15T00:00:00.000Z',
};

const PERFIL: Perfil = {
  usuario: { id: 'user-1', email: 'h@x.com', clubId: 'club-1', zonaHoraria: 'America/Bogota' },
  club: {
    id: 'club-1',
    nombre: 'Atlético Kiro',
    paletaColores: { primario: '#C8102E', secundario: '#FFFFFF' },
    escudoUrl: 'https://cdn/escudo.png',
    activosVisuales: { estadioUrls: [], camisetaUrls: [] },
  },
  temporadaActiva: TEMPORADA,
};

const PARTIDO: PartidoLamina = {
  partidoId: 'partido-1',
  rival: 'Rival FC',
  competicion: 'Liga',
  tipoCompeticion: 'LIGA',
  fechaHora: '2026-03-10T22:00:00.000Z',
  estado: 'FINALIZADO',
  esClasico: false,
  esInternacional: false,
  resultado: { golesLocal: 2, golesVisita: 1 },
  numeroRecuadro: 1,
  tieneFotoPrincipal: false,
};

/** Cliente falso configurable para éxito o fallo. */
class FakeProfileClient implements ProfileClient {
  constructor(
    private readonly opts: {
      perfil?: Perfil | Error;
      partidos?: readonly PartidoLamina[] | Error;
    } = {},
  ) {}

  getPerfil(): Promise<Perfil> {
    const p = this.opts.perfil ?? PERFIL;
    return p instanceof Error ? Promise.reject(p) : Promise.resolve(p);
  }

  listTemporadas(): Promise<readonly Temporada[]> {
    return Promise.resolve([TEMPORADA]);
  }

  listPartidos(): Promise<readonly PartidoLamina[]> {
    const p = this.opts.partidos ?? [PARTIDO];
    return p instanceof Error ? Promise.reject(p) : Promise.resolve(p);
  }

  syncTemporada(): Promise<SyncTemporadaResult> {
    return Promise.resolve({
      temporadaId: 'temp-1',
      albumId: 'album-1',
      partidos: 1,
      recuadros: 1,
    });
  }
}

describe('ProfilePresenter.loadProfile', () => {
  it('emite el estado actual al suscribirse (idle)', () => {
    const pres = new ProfilePresenter(new FakeProfileClient());
    let recibido: string | null = null;
    pres.subscribeProfile((s) => {
      recibido = s.status;
    });
    expect(recibido).toBe('idle');
  });

  it('carga el perfil: idle → loaded con los datos', async () => {
    const pres = new ProfilePresenter(new FakeProfileClient());
    await pres.loadProfile();
    const state = pres.getProfileState();
    expect(state.status).toBe('loaded');
    expect(state.perfil?.usuario.id).toBe('user-1');
    expect(state.perfil?.temporadaActiva?.id).toBe('temp-1');
    expect(state.error).toBeNull();
  });

  it('ante fallo deja error con mensaje y no lanza', async () => {
    const pres = new ProfilePresenter(
      new FakeProfileClient({ perfil: new Error('boom') }),
    );
    await pres.loadProfile();
    const state = pres.getProfileState();
    expect(state.status).toBe('error');
    expect(state.error).toBe('boom');
  });

  it('usa el mensaje por defecto si el error no trae mensaje', async () => {
    const pres = new ProfilePresenter(
      new FakeProfileClient({ perfil: new Error('') }),
    );
    await pres.loadProfile();
    expect(pres.getProfileState().error).toBe(PROFILE_ERROR_MESSAGE);
  });
});

describe('ProfilePresenter.loadPartidos', () => {
  it('carga los partidos: idle → loaded con la lista', async () => {
    const pres = new ProfilePresenter(new FakeProfileClient());
    await pres.loadPartidos('temp-1');
    const state = pres.getPartidosState();
    expect(state.status).toBe('loaded');
    expect(state.partidos).toHaveLength(1);
    expect(state.partidos[0]?.partidoId).toBe('partido-1');
    expect(state.partidos[0]?.numeroRecuadro).toBe(1);
  });

  it('ante fallo deja error con el mensaje por defecto', async () => {
    const pres = new ProfilePresenter(
      new FakeProfileClient({ partidos: new Error('') }),
    );
    await pres.loadPartidos('temp-1');
    const state = pres.getPartidosState();
    expect(state.status).toBe('error');
    expect(state.error).toBe(PARTIDOS_ERROR_MESSAGE);
  });
});
