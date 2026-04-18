import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {},
  resolve: {
    alias: [
      { find: /^@api\/(.*)$/, replacement: new URL('../astros_api/src/$1', import.meta.url).pathname },
      { find: /^src\/(.*)$/, replacement: new URL('../astros_api/src/$1', import.meta.url).pathname },
    ],
  },
});
