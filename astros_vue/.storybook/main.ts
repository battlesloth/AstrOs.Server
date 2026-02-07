import type { StorybookConfig } from '@storybook/vue3-vite';

const config: StorybookConfig = {
  stories: [
    '../src/**/*.mdx',
    "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"
  ],
  addons: ['storybook-addon-data-theme-switcher', 'msw-storybook-addon'],
  staticDirs: ['../public', '../src/assets'],
  framework: {
    name: '@storybook/vue3-vite',
    options: {}
  }
};
export default config;