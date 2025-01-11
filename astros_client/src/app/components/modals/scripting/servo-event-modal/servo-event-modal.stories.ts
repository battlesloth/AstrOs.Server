import { Meta, StoryObj } from '@storybook/angular';
import { ServoEventModalComponent } from './servo-event-modal.component';

const meta: Meta<ServoEventModalComponent> = {
  title: 'Components/Modals/ServoEventModal',
  component: ServoEventModalComponent,
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<ServoEventModalComponent>;

export const Default: Story = {
  args: {},
};
