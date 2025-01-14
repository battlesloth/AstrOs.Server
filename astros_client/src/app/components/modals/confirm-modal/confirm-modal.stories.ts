import {
  componentWrapperDecorator,
  moduleMetadata,
  Meta,
  StoryObj,
} from '@storybook/angular';
import { ConfirmModalComponent } from './confirm-modal.component';
import { ModalComponent } from '../modal-base/modal.component';

const meta: Meta<ConfirmModalComponent> = {
  title: 'Components/Modals/ConfirmModal',
  component: ConfirmModalComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [ModalComponent],
    }),
    componentWrapperDecorator(ModalComponent),
  ],
};

export default meta;

type Story = StoryObj<ConfirmModalComponent>;

export const Default: Story = {
  args: {},
};
