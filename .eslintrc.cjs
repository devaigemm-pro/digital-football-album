/* eslint-env node */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: './tsconfig.eslint.json',
    tsconfigRootDir: __dirname,
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'prettier',
  ],
  env: {
    node: true,
    es2022: true,
  },
  rules: {
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
  },
  // `app/` es el proyecto cliente React Native con su propio tooling
  // (app/.eslintrc.js, root:true) y no forma parte del tsconfig del backend;
  // se excluye del lint raíz para no exigirle el toolchain nativo del cliente.
  // `src/types/database.ts` es código generado por `supabase gen types` y no
  // debe someterse a las reglas de estilo/lint del proyecto.
  ignorePatterns: [
    'dist/',
    'node_modules/',
    'coverage/',
    'app/',
    '*.cjs',
    'src/types/database.ts',
  ],
};
