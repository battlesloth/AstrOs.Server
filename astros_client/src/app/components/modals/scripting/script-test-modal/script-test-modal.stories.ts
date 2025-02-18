import {
  componentWrapperDecorator,
  moduleMetadata,
  Meta,
  StoryObj,
} from '@storybook/angular';
import { ScriptTestModalComponent } from './script-test-modal.component';
import { ModalComponent } from '../../modal-base/modal.component';
import { ScriptsService } from '@src/services';
import { ScriptsServiceMock } from '@src/__mocks__/services/scripts.service.mock';

const meta: Meta<ScriptTestModalComponent> = {
  title: 'Modals/Scripting/ScriptTestModal',
  component: ScriptTestModalComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [ModalComponent],
      providers: [{ provide: ScriptsService, useClass: ScriptsServiceMock }],
    }),
    componentWrapperDecorator(ModalComponent),
  ],
};

export default meta;

type Story = StoryObj<ScriptTestModalComponent>;

export const Default: Story = {
  args: {},
};
