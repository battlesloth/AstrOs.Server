module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'require-extensions'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:require-extensions/recommended',
  ],
  rules: {
    'no-console': 0,
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: 'next|^_' }],
  },
  overrides: [
    {
      // Cockpit Vue SFCs: parse with vue-eslint-parser, run plugin:vue rules,
      // and disable the require-extensions rule because Vite resolves these
      // imports without explicit .js extensions (unlike the Node ESM core).
      files: ['src/web/ui/**/*.vue'],
      parser: 'vue-eslint-parser',
      parserOptions: {
        parser: '@typescript-eslint/parser',
        ecmaVersion: 'latest',
        sourceType: 'module',
        extraFileExtensions: ['.vue'],
      },
      extends: ['plugin:vue/vue3-essential'],
      env: {
        browser: true,
      },
      rules: {
        'require-extensions/require-extensions': 'off',
        'require-extensions/require-index': 'off',
      },
    },
    {
      // Cockpit-side .ts files (composables, api client, main): browser env,
      // no require-extensions because Vite handles resolution.
      files: ['src/web/ui/**/*.ts'],
      env: {
        browser: true,
      },
      rules: {
        'require-extensions/require-extensions': 'off',
        'require-extensions/require-index': 'off',
      },
    },
  ],
};
