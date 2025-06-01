import {
  applicationConfig,
  Meta,
  moduleMetadata,
  StoryObj,
} from '@storybook/angular';
import { ModulesComponent } from './modules.component';
import { importProvidersFrom } from '@angular/core';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { ControllerService, WebsocketService } from '@src/services';
import { ControllerServiceMock } from '@src/__mocks__/services/controller.service.mock';
import { WebsocketMockControllersSuccess } from '@src/__mocks__/services/websocket.serivce.mock';

const meta: Meta<ModulesComponent> = {
  title: 'Pages/Modules',
  component: ModulesComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [],
    }),
    applicationConfig({
      providers: [
        importProvidersFrom(BrowserAnimationsModule),
        { provide: ControllerService, useClass: ControllerServiceMock },
        {
          provide: WebsocketService,
          useClass: WebsocketMockControllersSuccess,
        },
      ],
    }),
  ],
};

export default meta;

type Story = StoryObj<ModulesComponent>;

export const Default: Story = {
  args: {},
};
