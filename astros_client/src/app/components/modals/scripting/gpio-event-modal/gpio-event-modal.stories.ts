import { Meta, StoryObj } from '@storybook/angular';
import { GpioEventModalComponent } from './gpio-event-modal.component';

const meta: Meta<GpioEventModalComponent> = {
  title: 'Components/Modals/GpioEventModal',
  component: GpioEventModalComponent,
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<GpioEventModalComponent>;

export const Default: Story = {
  args: {},
};
