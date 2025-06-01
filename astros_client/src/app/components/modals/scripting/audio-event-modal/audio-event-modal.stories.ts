import {
  componentWrapperDecorator,
  moduleMetadata,
  Meta,
  StoryObj,
} from '@storybook/angular';
import { AudioEventModalComponent } from './audio-event-modal.component';
import { ModalComponent } from '../../modal-base/modal.component';
import { AudioService } from '@src/services';
import { AudioServiceMock } from '@src/__mocks__/services/audio.service.mock';

const meta: Meta<AudioEventModalComponent> = {
  title: 'Modals/Scripting/AudioEventModal',
  component: AudioEventModalComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [ModalComponent],
      providers: [{ provide: AudioService, useClass: AudioServiceMock }],
    }),
    componentWrapperDecorator(ModalComponent),
  ],
};

export default meta;

type Story = StoryObj<AudioEventModalComponent>;

export const Default: Story = {
  args: {},
};
