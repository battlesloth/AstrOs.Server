import { Meta, StoryObj } from '@storybook/angular';
import { AudioEventModalComponent } from './audio-event-modal.component';

const meta: Meta<AudioEventModalComponent> = {
  title: 'Components/Modals/AudioEventModal',
  component: AudioEventModalComponent,
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<AudioEventModalComponent>;

export const Default: Story = {
  args: {},
};
