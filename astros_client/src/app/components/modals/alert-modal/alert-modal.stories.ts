import { Meta, StoryObj } from '@storybook/angular';
import { AlertModalComponent } from './alert-modal.component';

const meta: Meta<AlertModalComponent> = {
  title: 'Components/Modals/AlertModal',
  component: AlertModalComponent,
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<AlertModalComponent>;

export const Default: Story = {
  args: {},
};
