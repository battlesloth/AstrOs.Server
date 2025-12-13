import type { Preview } from '@storybook/vue3-vite'
import './preview.css';

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
};

export default preview;