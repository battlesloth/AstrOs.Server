import {
  componentWrapperDecorator,
  moduleMetadata,
  Meta,
  StoryObj,
} from '@storybook/angular';
import { LoadingModalComponent } from './loading-modal.component';
import { ModalComponent } from '../modal-base/modal.component';
import { ControllerService } from '#services/controller';

const meta: Meta<LoadingModalComponent> = {
  title: 'Components/Modals/LoadingModal',
  component: LoadingModalComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [ModalComponent, ControllerService, ],
    }),
    componentWrapperDecorator(ModalComponent),
  ],
};

export default meta;

type Story = StoryObj<LoadingModalComponent>;

export const Default: Story = {
  args: {},
};
