import type { Meta, StoryObj } from '@storybook/vue3';
import { fn } from 'storybook/test';
import AstrosConfirmModal from './AstrosConfirmModal.vue';

const meta = {
  title: 'Components/Modals/ConfirmModal',
  component: AstrosConfirmModal,
  parameters: {
    layout: 'centered',
  },
  args: {
    onClose: fn(),
    onConfirm: fn(),
  },
  tags: ['autodocs'],
} satisfies Meta<typeof AstrosConfirmModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    message: 'Are you sure you want to proceed with this action?',
  },
};

export const DeleteConfirmation: Story = {
  args: {
    message: 'Are you sure you want to delete this item? This action cannot be undone.',
  },
};

export const SaveConfirmation: Story = {
  args: {
    message: 'Do you want to save your changes before leaving?',
  },
};

export const ShortMessage: Story = {
  args: {
    message: 'Continue?',
  },
};

export const LongMessage: Story = {
  args: {
    message:
      'This is a longer confirmation message that explains the consequences of the action in detail. It may span multiple lines and should remain centered and easy to read. Are you sure you want to continue with this operation?',
  },
};

export const ResetConfirmation: Story = {
  args: {
    message: 'Reset all settings to default values? All customizations will be lost.',
  },
};
