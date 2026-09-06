import { Preview, setup } from '@storybook/vue3-vite';
import './preview.css';
import type { ThemeConfig } from 'storybook-addon-data-theme-switcher';
import i18n from '../src/i18n.ts';
import { initialize, mswLoader } from 'msw-storybook-addon';
import { createRouter, createMemoryHistory } from 'vue-router';
import { OhVueIcon, addIcons } from 'oh-vue-icons';
import {
  IoCloudUpload,
  IoCopy,
  IoPersonOutline,
  IoKeyOutline,
  IoWarning,
  IoCheckmarkCircle,
  IoTrashBin,
  IoPlay,
  IoSearch,
  IoChevronUp,
  IoChevronDown,
  IoAdd,
  IoHelpCircleOutline,
  IoCreate,
} from 'oh-vue-icons/icons';
import { MdDescription, MdDraghandle, MdFolder } from 'oh-vue-icons/icons/md';

initialize();

setup((app) => {
  app.use(i18n);

  addIcons(
    IoCloudUpload,
    IoCopy,
    IoTrashBin,
    IoPersonOutline,
    IoPlay,
    IoKeyOutline,
    IoWarning,
    IoCheckmarkCircle,
    IoSearch,
    IoChevronUp,
    IoChevronDown,
    IoAdd,
    IoHelpCircleOutline,
    IoCreate,
    MdDescription,
    MdDraghandle,
    MdFolder,
  );

  app.component('v-icon', OhVueIcon);

  // In-memory router so components that call useRoute() or render
  // <RouterLink> (AstrosLockStateBanner, AstrosLayout) work in Storybook
  // without the full app router. Routes are a wildcard catch-all because
  // stories don't exercise navigation — they just need the router plugin
  // installed so useRoute() returns a valid RouteLocationNormalized and
  // <RouterLink> renders as <a href>.
  const storybookRouter = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
  });
  app.use(storybookRouter);
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
