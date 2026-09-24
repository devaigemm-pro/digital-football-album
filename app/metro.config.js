// Config de Metro (bundler de React Native).
//
// La App_Móvil (en `app/`) REUTILIZA código TypeScript de la raíz del repo
// (`../src/app`, `../src/services/security/permissions`, `../src/domain/...`)
// vía imports relativos `../../../src/...`. Se amplía el alcance de Metro a la
// raíz del monorepo y se resuelven las extensiones `.js` explícitas de ese
// código (estilo ESM/NodeNext del backend) hacia sus fuentes `.ts`/`.tsx`.
const path = require('path');
const fs = require('fs');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, '..');

/**
 * El backend (`src/**`) usa imports ESM con extensión explícita, p. ej.
 * `export { X } from './x.js'`, aunque el archivo real sea `./x.ts`. Metro no
 * mapea `.js` -> `.ts` por defecto. Este resolver personalizado intercepta los
 * imports relativos que terminan en `.js`: si el `.js` no existe pero sí el
 * `.ts`/`.tsx` correspondiente, reescribe la resolución hacia la fuente TS.
 */
function tsExtensionResolver(context, moduleName, platform) {
  if (
    (moduleName.startsWith('./') || moduleName.startsWith('../')) &&
    moduleName.endsWith('.js')
  ) {
    const basedir = path.dirname(context.originModulePath);
    const asJs = path.resolve(basedir, moduleName);
    if (!fs.existsSync(asJs)) {
      for (const ext of ['.ts', '.tsx']) {
        const candidate = asJs.slice(0, -'.js'.length) + ext;
        if (fs.existsSync(candidate)) {
          return { type: 'sourceFile', filePath: candidate };
        }
      }
    }
  }
  // Delegar al resolver por defecto de Metro para todo lo demás.
  return context.resolveRequest(context, moduleName, platform);
}

/** @type {import('metro-config').MetroConfig} */
const config = {
  watchFolders: [repoRoot],
  resolver: {
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(repoRoot, 'node_modules'),
    ],
    resolveRequest: tsExtensionResolver,
  },
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
