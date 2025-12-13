import { Preview, setup } from '@storybook/vue3-vite'
import './preview.css';
import i18n from '../src/i18n.ts';
import { initialize, mswLoader } from 'msw-storybook-addon';

initialize();

setup((app) => {
  app.use(i18n);
});

export const initialGlobals = {
  dataTheme: 'winter',
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