import { Meta, StoryObj } from '@storybook/angular';
import { UartEventModalComponent } from './uart-event-modal.component';

const meta: Meta<UartEventModalComponent> = {
  title: 'Components/Modals/UartEventModal',
  component: UartEventModalComponent,
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<UartEventModalComponent>;

export const Default: Story = {
  args: {},
};
