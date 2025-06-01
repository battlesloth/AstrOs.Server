import {
  componentWrapperDecorator,
  moduleMetadata,
  Meta,
  StoryObj,
} from '@storybook/angular';
import { ServoTestModalComponent } from './servo-test-modal.component';
import { ModalComponent } from '../../modal-base/modal.component';

const meta: Meta<ServoTestModalComponent> = {
  title: 'Modals/Modules/ServoTestModal',
  component: ServoTestModalComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [ModalComponent],
    }),
    componentWrapperDecorator(ModalComponent),
  ],
};

export default meta;

type Story = StoryObj<ServoTestModalComponent>;

export const Default: Story = {
  args: {},
};
