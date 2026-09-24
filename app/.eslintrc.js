// Linter del cliente React Native (independiente del ESLint del backend).
//
// Task 24 — Requirements: 21.1, 21.2
// `root: true` corta la herencia: este proyecto NO usa el .eslintrc.cjs del
// backend (que apunta a tsconfig.eslint.json del backend). Ejecutar este lint
// requiere las devDependencies del cliente instaladas.
module.exports = {
  root: true,
  extends: '@react-native',
  ignorePatterns: ['node_modules/', 'ios/', 'android/', 'coverage/'],
};
