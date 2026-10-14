import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  { ignores: ['dist', 'dist-artifact', 'node_modules', 'playwright-report', 'test-results', 'coverage'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },

  {
    files: ['src/ui/**/*.{ts,tsx}', 'src/three/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },

  // The simulation must stay deterministic: no wall-clock, no ambient randomness.
  {
    files: ['src/sim/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'src/sim must be deterministic — use the seeded Rng.' },
        { object: 'Date', property: 'now', message: 'src/sim must be deterministic — derive time from the tick counter.' },
        { object: 'performance', property: 'now', message: 'src/sim must be deterministic — derive time from the tick counter.' },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'src/sim must not touch the DOM.' },
        { name: 'document', message: 'src/sim must not touch the DOM.' },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: "NewExpression[callee.name='Date']", message: 'src/sim must be deterministic — derive time from the tick counter.' },
      ],
    },
  },

  {
    files: ['tests/**/*.ts', 'scripts/**/*.{ts,mts,mjs}', 'server/**/*.ts'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: { 'no-console': 'off' },
  },
)
