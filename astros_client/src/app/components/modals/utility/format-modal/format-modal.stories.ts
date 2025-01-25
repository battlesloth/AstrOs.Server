import {
  componentWrapperDecorator,
  moduleMetadata,
  Meta,
  StoryObj,
} from '@storybook/angular';
import { FormatModalComponent } from './format-modal.component';
import { ModalComponent } from '../../modal-base/modal.component';

const meta: Meta<FormatModalComponent> = {
  title: 'Modals/Utility/FormatModal',
  component: FormatModalComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [ModalComponent],
    }),
    componentWrapperDecorator(ModalComponent),
  ],
};

export default meta;

type Story = StoryObj<FormatModalComponent>;

export const Default: Story = {
  args: {},
};
