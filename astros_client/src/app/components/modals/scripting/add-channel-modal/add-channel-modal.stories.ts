import {
  componentWrapperDecorator,
  moduleMetadata,
  Meta,
  StoryObj,
} from '@storybook/angular';
import { AddChannelModalComponent } from './add-channel-modal.component';
import { ModalComponent } from '../../modal-base/modal.component';

const meta: Meta<AddChannelModalComponent> = {
  title: 'Modals/Scripting/AddChannelModal',
  component: AddChannelModalComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [ModalComponent],
    }),
    componentWrapperDecorator(ModalComponent),
  ],
};

export default meta;

type Story = StoryObj<AddChannelModalComponent>;

export const Default: Story = {
  args: {},
};
