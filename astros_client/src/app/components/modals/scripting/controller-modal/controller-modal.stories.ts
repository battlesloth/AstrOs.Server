import {
  componentWrapperDecorator,
  moduleMetadata,
  Meta,
  StoryObj,
} from '@storybook/angular';
import { ControllerModalComponent } from './controller-modal.component';
import { ModalComponent } from '../../modal-base/modal.component';

const meta: Meta<ControllerModalComponent> = {
  title: 'Modals/Scripting/ControllerModal',
  component: ControllerModalComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [ModalComponent],
    }),
    componentWrapperDecorator(ModalComponent),
  ],
};

export default meta;

type Story = StoryObj<ControllerModalComponent>;

export const Default: Story = {
  args: {},
};
