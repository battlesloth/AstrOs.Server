import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { fn } from 'storybook/test';
import AstrosChangePasswordModal from './AstrosChangePasswordModal.vue';

const meta = {
  title: 'Components/Modals/ChangePassword',
  component: AstrosChangePasswordModal,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    errorMessage: '',
    onCancel: fn(),
    onAccept: fn(),
  },
  argTypes: {
    errorMessage: {
      control: 'text',
      description: 'i18n key for a server-reported error (e.g. wrong current password).',
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof AstrosChangePasswordModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    errorMessage: '',
  },
};

export const WithServerError: Story = {
  args: {
    errorMessage: 'utility_view.current_password_incorrect',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Shows how a server-reported error (e.g. an incorrect current password) is surfaced inside the modal.',
      },
    },
  },
};
