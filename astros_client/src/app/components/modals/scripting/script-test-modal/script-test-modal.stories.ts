import {
  componentWrapperDecorator,
  moduleMetadata,
  Meta,
  StoryObj,
} from '@storybook/angular';
import { ScriptTestModalComponent } from './script-test-modal.component';
import { ModalComponent } from '../../modal-base/modal.component';

const meta: Meta<ScriptTestModalComponent> = {
  title: 'Components/Modals/ScriptTestModal',
  component: ScriptTestModalComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [ModalComponent],
    }),
    componentWrapperDecorator(ModalComponent),
  ],
};

export default meta;

type Story = StoryObj<ScriptTestModalComponent>;

export const Default: Story = {
  args: {},
};
