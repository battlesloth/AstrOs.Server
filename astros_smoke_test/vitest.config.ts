import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  test: {},
  resolve: {
    alias: [
      {
        find: /^@api\/(.*)$/,
        replacement: fileURLToPath(new URL('../astros_api/src/$1', import.meta.url)),
      },
      {
        find: /^src\/(.*)$/,
        replacement: fileURLToPath(new URL('../astros_api/src/$1', import.meta.url)),
      },
    ],
  },
});
