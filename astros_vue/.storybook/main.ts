import type { StorybookConfig } from '@storybook/vue3-vite';

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const config: StorybookConfig = {
  stories: [
    "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"
  ],
  staticDirs: ['../public', '../src/assets/images/status'],
  addons: [],
  framework: "@storybook/vue3-vite"
};
export default config;