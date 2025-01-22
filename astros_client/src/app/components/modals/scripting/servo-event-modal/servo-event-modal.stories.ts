import {
  componentWrapperDecorator,
  moduleMetadata,
  Meta,
  StoryObj,
} from '@storybook/angular';
import { ServoEventModalComponent } from './servo-event-modal.component';
import { ModalComponent } from '../../modal-base/modal.component';

const meta: Meta<ServoEventModalComponent> = {
  title: 'Components/Modals/ServoEventModal',
  component: ServoEventModalComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [ModalComponent],
    }),
    componentWrapperDecorator(ModalComponent),
  ],
};

export default meta;

type Story = StoryObj<ServoEventModalComponent>;

export const Default: Story = {
  args: {},
};
