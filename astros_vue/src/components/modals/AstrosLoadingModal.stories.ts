import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { fn } from 'storybook/test';
import { createPinia } from 'pinia';
import AstrosLoadingModal from './AstrosLoadingModal.vue';
import { useLocationStore } from '@/stores/location';
import { useControllerStore } from '@/stores/controller';

const createStoryRender = (mockSuccess: boolean, mockError: boolean) => (args: any) => ({
  components: { AstrosLoadingModal },
  setup() {
    const pinia = createPinia();
    const locationStore = useLocationStore(pinia);
    const controllerStore = useControllerStore(pinia);

    // Mock the store methods for Storybook
    if (mockSuccess) {
      locationStore.loadLocationsFromApi = async () => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({ success: true, data: {} });
          }, 1000);
        });
      };

      controllerStore.syncControllers = async () => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({ success: true, data: {} });
          }, 1500);
        });
      };
    } else if (mockError) {
      locationStore.loadLocationsFromApi = async () => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({ success: false, error: new Error('Failed to load') });
          }, 1000);
        });
      };
    }

    return { args, pinia };
  },
  template: '<AstrosLoadingModal v-bind="args" />',
});

const meta = {
  title: 'Components/Modals/LoadingModal',
  component: AstrosLoadingModal,
  render: createStoryRender(true, false),
  parameters: {
    layout: 'centered',
  },
  args: {
    skipControllerLoading: false,
    onLoaded: fn(),
  },
  tags: ['autodocs'],
} satisfies Meta<typeof AstrosLoadingModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};

export const SkipControllerSync: Story = {
  args: {
    skipControllerLoading: true,
  },
};

export const LoadingError: Story = {
  render: createStoryRender(false, true),
  args: {},
};
