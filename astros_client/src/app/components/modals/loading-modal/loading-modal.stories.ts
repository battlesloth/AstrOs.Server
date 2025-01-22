import {
  componentWrapperDecorator,
  moduleMetadata,
  Meta,
  StoryObj,
} from '@storybook/angular';
import { LoadingModalComponent } from './loading-modal.component';
import { ModalComponent } from '../modal-base/modal.component';
import { ControllerService } from '../../../services/controllers/controller.service';
import { ControllerServiceMock } from '../../../services/controllers/controller.mock';

const meta: Meta<LoadingModalComponent> = {
  title: 'Components/Modals/LoadingModal',
  component: LoadingModalComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [ModalComponent],
      providers: [{provide: ControllerService, useClass: ControllerServiceMock}],
    }),
    componentWrapperDecorator(ModalComponent),
  ],
};

export default meta;

type Story = StoryObj<LoadingModalComponent>;

export const Default: Story = {
  args: {},
};
