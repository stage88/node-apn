const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.mocha,
      },
    },
    rules: {
      'no-unused-vars': ['error', { args: 'none' }],
      'no-var': 'error',
      'prefer-const': 'error',
      'require-atomic-updates': 'off',
      strict: ['error', 'never'],
      // Added to recommended in ESLint 10; off to keep lib parity with upstream.
      'no-useless-assignment': 'off',
      'preserve-caught-error': 'off',
    },
  },
  {
    files: ['test/**/*.js'],
    languageOptions: {
      globals: {
        expect: 'readonly',
      },
    },
  },
];
