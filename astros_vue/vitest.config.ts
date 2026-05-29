import { fileURLToPath } from 'node:url'
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      // Auto-restore vi.spyOn() mocks after every test, even when an
      // assertion throws before a manual mockRestore() runs. Without this,
      // a failing test that mocks console.warn/console.error leaves the
      // mock installed across the rest of the worker, silently suppressing
      // legitimate warnings in unrelated specs.
      restoreMocks: true,
      exclude: [...configDefaults.exclude, 'e2e/**'],
      root: fileURLToPath(new URL('./', import.meta.url)),
    },
  }),
)
