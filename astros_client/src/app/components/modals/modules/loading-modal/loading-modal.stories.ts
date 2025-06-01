import {
  componentWrapperDecorator,
  moduleMetadata,
  Meta,
  StoryObj,
} from '@storybook/angular';
import { LoadingModalComponent } from './loading-modal.component';
import { ModalComponent } from '../../modal-base/modal.component';
import { ControllerService, WebsocketService } from '@src/services';
import { ControllerServiceMock } from '@src/__mocks__/services/controller.service.mock';
import { WebsocketMockDefault } from '@src/__mocks__/services/websocket.serivce.mock';

const meta: Meta<LoadingModalComponent> = {
  title: 'Modals/Modules/LoadingModal',
  component: LoadingModalComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [ModalComponent],
      providers: [
        { provide: ControllerService, useClass: ControllerServiceMock },
        {
          provide: WebsocketService,
          useClass: WebsocketMockDefault,
        },
      ],
    }),
    componentWrapperDecorator(ModalComponent),
  ],
};

export default meta;

type Story = StoryObj<LoadingModalComponent>;

export const Default: Story = {
  args: {},
};
