import {
  componentWrapperDecorator,
  moduleMetadata,
  Meta,
  StoryObj,
} from '@storybook/angular';
import { HumanCyborgModalComponent } from './human-cyborg-modal.component';
import { ModalComponent } from '../../modal-base/modal.component';;

const meta: Meta<HumanCyborgModalComponent> = {
  title: 'Components/Modals/HumanCyborgModal',
  component: HumanCyborgModalComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [ModalComponent],
    }),
    componentWrapperDecorator(ModalComponent),
  ],
};

export default meta;

type Story = StoryObj<HumanCyborgModalComponent>;

export const Default: Story = {
  args: {},
};
