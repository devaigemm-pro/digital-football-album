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
  añoDeTemporada,
  EDIT_ERROR_MESSAGE,
  PARTIDOS_ERROR_MESSAGE,
  PROFILE_ERROR_MESSAGE,
  ProfilePresenter,
} from './profile-presenter';
import type {
  ActualizarPerfilInput,
  Perfil,
  PartidoLamina,
  PerfilUsuario,
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
  usuario: {
    id: 'user-1',
    email: 'h@x.com',
    clubId: 'club-1',
    zonaHoraria: 'America/Bogota',
    nombre: null,
    alias: null,
    fechaNacimiento: null,
    sexo: null,
    avatarUrl: null,
  },
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
  /** Última entrada recibida por `actualizarPerfil` (para asertar el parche). */
  public ultimoParche: ActualizarPerfilInput | null = null;

  constructor(
    private readonly opts: {
      perfil?: Perfil | Error;
      partidos?: readonly PartidoLamina[] | Error;
      actualizar?: PerfilUsuario | Error;
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

  buscarEquipos(): Promise<readonly never[]> {
    return Promise.resolve([]);
  }

  ligasDeEquipo(): Promise<readonly never[]> {
    return Promise.resolve([]);
  }

  seleccionarEquipo(): Promise<{ clubId: string; nombre: string; escudoUrl: string }> {
    return Promise.resolve({ clubId: 'club-1', nombre: 'Test', escudoUrl: '' });
  }

  listarPaises(): Promise<readonly never[]> {
    return Promise.resolve([]);
  }

  ligasDePais(): Promise<readonly never[]> {
    return Promise.resolve([]);
  }

  equiposDeLiga(): Promise<readonly never[]> {
    return Promise.resolve([]);
  }

  actualizarPerfil(input: ActualizarPerfilInput): Promise<PerfilUsuario> {
    this.ultimoParche = input;
    const r = this.opts.actualizar ?? PERFIL.usuario;
    return r instanceof Error ? Promise.reject(r) : Promise.resolve(r);
  }

  getPartido(): Promise<never> {
    return Promise.reject(new Error('no usado'));
  }

  subirAvatar(): Promise<{ avatarUrl: string }> {
    return Promise.resolve({ avatarUrl: 'avatars/fake.png' });
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

describe('añoDeTemporada', () => {
  it('devuelve el año tal cual cuando la temporada es un año directo', () => {
    expect(añoDeTemporada('2026')).toBe('2026');
    expect(añoDeTemporada('2023')).toBe('2023');
  });

  it('extrae el año del formato "<leagueId>:<season>:<teamId>"', () => {
    // 265 y 2315 no son años plausibles; 2023 sí.
    expect(añoDeTemporada('265:2023:2315')).toBe('2023');
  });

  it('extrae el año del formato "team:<teamId>:<season>"', () => {
    expect(añoDeTemporada('team:33:2023')).toBe('2023');
  });

  it('toma el mayor año plausible cuando hay varios grupos', () => {
    expect(añoDeTemporada('1998:2024')).toBe('2024');
  });

  it('devuelve el string recortado si no hay ningún año plausible', () => {
    expect(añoDeTemporada('  liga-x  ')).toBe('liga-x');
  });
});

describe('ProfilePresenter.updateProfile', () => {
  it('guarda nombre/alias y refleja el usuario devuelto en el perfil', async () => {
    const client = new FakeProfileClient({
      actualizar: { ...PERFIL.usuario, nombre: 'Gem', alias: 'gemm' },
    });
    const pres = new ProfilePresenter(client);
    await pres.loadProfile();

    const ok = await pres.updateProfile({ nombre: 'Gem', alias: 'gemm' });

    expect(ok).toBe(true);
    expect(client.ultimoParche).toEqual({ nombre: 'Gem', alias: 'gemm' });
    expect(pres.getEditState().status).toBe('done');
    expect(pres.getProfileState().perfil?.usuario.nombre).toBe('Gem');
    expect(pres.getProfileState().perfil?.usuario.alias).toBe('gemm');
  });

  it('ante fallo devuelve false y deja edit en error con mensaje', async () => {
    const client = new FakeProfileClient({ actualizar: new Error('nombre inválido') });
    const pres = new ProfilePresenter(client);

    const ok = await pres.updateProfile({ nombre: '' });

    expect(ok).toBe(false);
    expect(pres.getEditState().status).toBe('error');
    expect(pres.getEditState().error).toBe('nombre inválido');
  });

  it('usa el mensaje por defecto si el error no trae mensaje', async () => {
    const client = new FakeProfileClient({ actualizar: new Error('') });
    const pres = new ProfilePresenter(client);
    await pres.updateProfile({ alias: 'x' });
    expect(pres.getEditState().error).toBe(EDIT_ERROR_MESSAGE);
  });

  it('resetEdit vuelve a idle', async () => {
    const pres = new ProfilePresenter(new FakeProfileClient());
    await pres.updateProfile({ nombre: 'Gem' });
    pres.resetEdit();
    expect(pres.getEditState().status).toBe('idle');
    expect(pres.getEditState().error).toBeNull();
  });
});
