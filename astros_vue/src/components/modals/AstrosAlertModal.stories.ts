import type { Meta, StoryObj } from '@storybook/vue3';
import { fn } from 'storybook/test';
import AstrosAlertModal from './AstrosAlertModal.vue';

const meta = {
  title: 'Components/Modals/AlertModal',
  component: AstrosAlertModal,
  parameters: {
    layout: 'centered',
  },
  args: {
    onClose: fn(),
  },
  tags: ['autodocs'],
} satisfies Meta<typeof AstrosAlertModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    message: 'This is an alert message.',
  },
};

export const ShortMessage: Story = {
  args: {
    message: 'Success!',
  },
};

export const LongMessage: Story = {
  args: {
    message:
      'This is a much longer alert message that contains multiple sentences. It demonstrates how the modal handles text wrapping and displays longer content to the user. The message should remain centered and readable.',
  },
};

export const ErrorMessage: Story = {
  args: {
    message: 'An error occurred while processing your request. Please try again.',
  },
};

export const WarningMessage: Story = {
  args: {
    message: 'Warning: This action cannot be undone. Please proceed with caution.',
  },
};
