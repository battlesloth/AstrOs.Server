import {
  componentWrapperDecorator,
  Meta,
  moduleMetadata,
  StoryObj,
} from '@storybook/angular';
import { AlertModalComponent } from './alert-modal.component';
import { ModalComponent } from '../modal-base/modal.component';

const meta: Meta<AlertModalComponent> = {
  title: 'Components/Modals/AlertModal',
  component: AlertModalComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [ModalComponent],
    }),
    componentWrapperDecorator(ModalComponent),
  ],
};

export default meta;

type Story = StoryObj<AlertModalComponent>;

export const Default: Story = {
  args: {},
};
