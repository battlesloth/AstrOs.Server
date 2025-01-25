import {
  componentWrapperDecorator,
  moduleMetadata,
  Meta,
  StoryObj,
} from '@storybook/angular';
import { KangarooEventModalComponent } from './kangaroo-event-modal.component';
import { ModalComponent } from '../../modal-base/modal.component';

const meta: Meta<KangarooEventModalComponent> = {
  title: 'Modals/Scripting/KangarooEventModal',
  component: KangarooEventModalComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [ModalComponent],
    }),
    componentWrapperDecorator(ModalComponent),
  ],
};

export default meta;

type Story = StoryObj<KangarooEventModalComponent>;

export const Default: Story = {
  args: {},
};
