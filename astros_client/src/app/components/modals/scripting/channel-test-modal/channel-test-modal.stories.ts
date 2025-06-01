import {
  componentWrapperDecorator,
  moduleMetadata,
  Meta,
  StoryObj,
} from '@storybook/angular';
import { ChannelTestModalComponent } from './channel-test-modal.component';
import { ModalComponent } from '../../modal-base/modal.component';

const meta: Meta<ChannelTestModalComponent> = {
  title: 'Modals/Scripting/ChannelTestModal',
  component: ChannelTestModalComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [ModalComponent],
    }),
    componentWrapperDecorator(ModalComponent),
  ],
};

export default meta;

type Story = StoryObj<ChannelTestModalComponent>;

export const Default: Story = {
  args: {},
};
