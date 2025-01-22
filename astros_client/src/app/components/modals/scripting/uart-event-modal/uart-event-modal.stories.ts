import {
  componentWrapperDecorator,
  moduleMetadata,
  Meta,
  StoryObj,
} from '@storybook/angular';
import { UartEventModalComponent } from './uart-event-modal.component';
import { ModalComponent } from '../../modal-base/modal.component';

const meta: Meta<UartEventModalComponent> = {
  title: 'Components/Modals/UartEventModal',
  component: UartEventModalComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [ModalComponent],
    }),
    componentWrapperDecorator(ModalComponent),
  ],
};

export default meta;

type Story = StoryObj<UartEventModalComponent>;

export const Default: Story = {
  args: {},
};
