import {
  componentWrapperDecorator,
  moduleMetadata,
  Meta,
  StoryObj,
} from '@storybook/angular';
import { AudioEventModalComponent } from './audio-event-modal.component';
import { ModalComponent } from '../../modal-base/modal.component';;

const meta: Meta<AudioEventModalComponent> = {
  title: 'Components/Modals/AudioEventModal',
  component: AudioEventModalComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [ModalComponent],
    }),
    componentWrapperDecorator(ModalComponent),
  ],
};

export default meta;

type Story = StoryObj<AudioEventModalComponent>;

export const Default: Story = {
  args: {},
};
