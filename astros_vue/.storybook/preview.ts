import { Preview, setup } from '@storybook/vue3-vite'
import './preview.css';
import i18n from '../src/i18n.ts';
import { initialize, mswLoader } from 'msw-storybook-addon';
import { OhVueIcon, addIcons } from 'oh-vue-icons'
import {
  IoPersonOutline,
  IoKeyOutline,
} from 'oh-vue-icons/icons';

initialize();

setup((app) => {
  app.use(i18n);
  addIcons(IoPersonOutline, IoKeyOutline);
  app.component('v-icon', OhVueIcon)
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