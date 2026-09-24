// Shim ambiental MÍNIMO de los globales de Jest para el cliente (app/).
//
// ¿Por qué existe? En este entorno las dependencias de desarrollo del cliente
// (incluido `@types/jest`) NO están instaladas, por lo que
// `tsc --noEmit -p app/tsconfig.json` no puede resolver los globales que usan
// los archivos `*.test.ts` (`describe`, `it`, `expect`, ...). Este archivo los
// declara de forma central para que el typecheck pase sin instalar nada.
//
// Compatibilidad: al instalar el toolchain real, `@types/jest` provee estos
// mismos globales. Las firmas de aquí son intencionadamente laxas (parámetros
// `unknown`, retornos `void`/`Promise<void>`) para fusionarse con las de
// `@types/jest` sin entrar en conflicto. Cuando `@types/jest` esté presente,
// sus declaraciones (más ricas) prevalecen y este shim queda como respaldo
// estructuralmente compatible.
//
// Ámbito: solo declara lo que realmente referencian los tests del cliente.
// `app/tsconfig.json` incluye "src", así que este `.d.ts` aplica a todo el
// proyecto del cliente sin imports.

/** Objeto de aserciones devuelto por `expect(...)`. */
interface JestMatchers {
  toBe(expected: unknown): void;
  toEqual(expected: unknown): void;
  toBeNull(): void;
  toBeUndefined(): void;
  toHaveLength(expected: number): void;
  toThrow(expected?: unknown): void;
  readonly rejects: {
    toBeInstanceOf(expected: unknown): Promise<void>;
    toThrow(expected?: unknown): Promise<void>;
  };
}

declare function describe(name: string, fn: () => void): void;
declare function it(name: string, fn: () => void | Promise<void>): void;
declare function test(name: string, fn: () => void | Promise<void>): void;
declare function beforeEach(fn: () => void | Promise<void>): void;
declare function afterEach(fn: () => void | Promise<void>): void;
declare function expect(actual: unknown): JestMatchers;
