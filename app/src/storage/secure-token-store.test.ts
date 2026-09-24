// Pruebas del Almacenamiento_Seguro del Refresh_Token.
//
// Task 25.3 — Requirements: 28.2, 28.3, 28.4
// TypeScript puro, sin dependencias nativas de React Native: se prueba la
// implementación en memoria y que el adaptador de Keychain delega en el módulo
// nativo inyectado (fake). Nota: en este entorno las dependencias del cliente
// (app/) no están instaladas, por lo que Jest no puede ejecutarse aquí; estas
// pruebas quedan listas para cuando exista el toolchain.
import {
  InMemorySecureTokenStore,
  KeychainSecureTokenStore,
  type KeychainModule,
} from './secure-token-store';

// Los globales de Jest (`describe`, `it`, `expect`, ...) se resuelven desde el
// shim ambiental central en `app/src/testing/jest-globals.d.ts`, necesario
// mientras `@types/jest` no esté instalado en este entorno.

describe('InMemorySecureTokenStore', () => {
  it('set→get devuelve el token almacenado (Req 28.2)', async () => {
    const store = new InMemorySecureTokenStore();
    await store.setRefreshToken('refresh-abc');
    expect(await store.getRefreshToken()).toBe('refresh-abc');
  });

  it('get devuelve null cuando no hay sesión persistida', async () => {
    const store = new InMemorySecureTokenStore();
    expect(await store.getRefreshToken()).toBeNull();
  });

  it('setRefreshToken sobrescribe el token previo (rotación)', async () => {
    const store = new InMemorySecureTokenStore();
    await store.setRefreshToken('refresh-viejo');
    await store.setRefreshToken('refresh-nuevo');
    expect(await store.getRefreshToken()).toBe('refresh-nuevo');
  });

  it('clear elimina el token: get devuelve null tras logout/borrado de cuenta (Req 28.4)', async () => {
    const store = new InMemorySecureTokenStore();
    await store.setRefreshToken('refresh-abc');
    await store.clear();
    expect(await store.getRefreshToken()).toBeNull();
  });
});

/**
 * Fake del módulo `react-native-keychain` que respalda un único registro en
 * memoria y registra las llamadas realizadas, para verificar la delegación.
 */
function createFakeKeychain(): KeychainModule & {
  calls: {
    set: Array<[string, string, unknown]>;
    get: unknown[];
    reset: unknown[];
  };
} {
  let stored: { username: string; password: string } | null = null;
  const calls = {
    set: [] as Array<[string, string, unknown]>,
    get: [] as unknown[],
    reset: [] as unknown[],
  };
  return {
    calls,
    async setGenericPassword(username, password, options) {
      calls.set.push([username, password, options]);
      stored = { username, password };
      return true;
    },
    async getGenericPassword(options) {
      calls.get.push(options);
      return stored === null ? false : stored;
    },
    async resetGenericPassword(options) {
      calls.reset.push(options);
      stored = null;
      return true;
    },
  };
}

describe('KeychainSecureTokenStore', () => {
  it('setRefreshToken delega en setGenericPassword con la cuenta y el token (Req 28.2/28.3)', async () => {
    const keychain = createFakeKeychain();
    const store = new KeychainSecureTokenStore(keychain);

    await store.setRefreshToken('refresh-xyz');

    expect(keychain.calls.set).toHaveLength(1);
    const [username, password, options] = keychain.calls.set[0];
    expect(username).toBe('refresh_token');
    expect(password).toBe('refresh-xyz');
    expect(options).toEqual({ service: 'refresh_token' });
  });

  it('getRefreshToken delega en getGenericPassword y devuelve la contraseña almacenada', async () => {
    const keychain = createFakeKeychain();
    const store = new KeychainSecureTokenStore(keychain);

    await store.setRefreshToken('refresh-xyz');
    const token = await store.getRefreshToken();

    expect(token).toBe('refresh-xyz');
    expect(keychain.calls.get).toHaveLength(1);
    expect(keychain.calls.get[0]).toEqual({ service: 'refresh_token' });
  });

  it('getRefreshToken devuelve null cuando el Keychain no tiene credenciales', async () => {
    const keychain = createFakeKeychain();
    const store = new KeychainSecureTokenStore(keychain);

    expect(await store.getRefreshToken()).toBeNull();
  });

  it('clear delega en resetGenericPassword al cerrar sesión / borrar cuenta (Req 28.4)', async () => {
    const keychain = createFakeKeychain();
    const store = new KeychainSecureTokenStore(keychain);

    await store.setRefreshToken('refresh-xyz');
    await store.clear();

    expect(keychain.calls.reset).toHaveLength(1);
    expect(keychain.calls.reset[0]).toEqual({ service: 'refresh_token' });
    expect(await store.getRefreshToken()).toBeNull();
  });

  it('respeta un nombre de cuenta personalizado en todas las operaciones', async () => {
    const keychain = createFakeKeychain();
    const store = new KeychainSecureTokenStore(keychain, 'sesion_app');

    await store.setRefreshToken('t');
    await store.getRefreshToken();
    await store.clear();

    expect(keychain.calls.set[0][2]).toEqual({ service: 'sesion_app' });
    expect(keychain.calls.get[0]).toEqual({ service: 'sesion_app' });
    expect(keychain.calls.reset[0]).toEqual({ service: 'sesion_app' });
  });
});
