import { Preview, setup } from '@storybook/vue3-vite'
import './preview.css';
import type { ThemeConfig } from 'storybook-addon-data-theme-switcher';
import i18n from '../src/i18n.ts';
import { initialize, mswLoader } from 'msw-storybook-addon';
import { OhVueIcon, addIcons } from 'oh-vue-icons'
import {
  IoPersonOutline,
  IoKeyOutline,
  IoWarning,
  IoCheckmarkCircle
} from 'oh-vue-icons/icons';

initialize();

setup((app) => {
  app.use(i18n);

  addIcons(
    IoPersonOutline,
    IoKeyOutline,
    IoWarning,
    IoCheckmarkCircle
  );

  app.component('v-icon', OhVueIcon)
});

export const initialGlobals = {
  dataTheme: 'winter', // default theme
  dataThemes: {
    list: [{ name: 'Winter', dataTheme: 'winter', color: '#00755e' }],
    dataAttribute: 'data-theme', // optional (default: "data-theme")
    clearable: true, // optional (default: true)
    toolbar: {
      title: 'Change data-theme attribute', // optional
      icon: 'PaintBrushIcon', // optional
    },
  } satisfies ThemeConfig,
  locale: 'enUS',
};

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
  loaders: [mswLoader],
};

export default preview;