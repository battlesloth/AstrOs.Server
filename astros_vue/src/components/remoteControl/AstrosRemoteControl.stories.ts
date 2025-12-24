import type { Meta, StoryObj } from '@storybook/vue3';
import AstrosRemoteControl from './AstrosRemoteControl.vue';
import {
  handlers,
  noScriptsHandlers,
  withScriptsHandlers,
  multiplePagesHandlers,
  fullyConfiguredHandlers,
} from '@/mocks/handler';

const meta = {
  title: 'Components/RemoteControl/RemoteControl',
  component: AstrosRemoteControl,
  parameters: {
    layout: 'padded',
    msw: {
      handlers: handlers,
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof AstrosRemoteControl>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  parameters: {
    msw: {
      handlers: handlers,
    },
  },
};

export const WithAssignedScripts: Story = {
  parameters: {
    msw: {
      handlers: withScriptsHandlers,
    },
  },
};

export const MultiplePages: Story = {
  parameters: {
    msw: {
      handlers: multiplePagesHandlers,
    },
  },
};

export const FullyConfigured: Story = {
  parameters: {
    msw: {
      handlers: fullyConfiguredHandlers,
    },
  },
};

export const NoScripts: Story = {
  parameters: {
    msw: {
      handlers: noScriptsHandlers,
    },
  },
};
