import { Meta, StoryObj } from '@storybook/angular';
import { ControllerModalComponent } from './controller-modal.component';

const meta: Meta<ControllerModalComponent> = {
  title: 'Components/Modals/ControllerModal',
  component: ControllerModalComponent,
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<ControllerModalComponent>;

export const Default: Story = {
  args: {},
};
