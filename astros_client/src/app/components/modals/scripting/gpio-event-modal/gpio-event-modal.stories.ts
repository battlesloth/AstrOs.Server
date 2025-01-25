import {
  componentWrapperDecorator,
  moduleMetadata,
  Meta,
  StoryObj,
} from '@storybook/angular';
import { GpioEventModalComponent } from './gpio-event-modal.component';
import { ModalComponent } from '../../modal-base/modal.component';

const meta: Meta<GpioEventModalComponent> = {
  title: 'Modals/Scripting/GpioEventModal',
  component: GpioEventModalComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [ModalComponent],
    }),
    componentWrapperDecorator(ModalComponent),
  ],
};

export default meta;

type Story = StoryObj<GpioEventModalComponent>;

export const Default: Story = {
  args: {},
};
