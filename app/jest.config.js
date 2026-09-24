// Config del runner de pruebas del cliente (Jest + React Native Testing Library).
//
// Task 24 — Requirements: 21.1, 21.2
// Nota: ejecutar `jest` requiere instalar las devDependencies del cliente
// (`npm install` en app/), lo cual necesita el toolchain de React Native. En
// este entorno solo se deja la configuración; no se ejecuta.
module.exports = {
  preset: 'react-native',
  setupFilesAfterEnv: ['@testing-library/react-native/extend-expect'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  testMatch: ['<rootDir>/src/**/*.test.{ts,tsx}'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-navigation)/)',
  ],
};
