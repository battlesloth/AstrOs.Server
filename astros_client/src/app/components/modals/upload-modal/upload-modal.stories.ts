import {
  componentWrapperDecorator,
  moduleMetadata,
  Meta,
  StoryObj,
} from '@storybook/angular';
import { ModalComponent } from '../modal-base/modal.component';
import { UploadModalComponent } from './upload-modal.component';

const meta: Meta<UploadModalComponent> = {
  title: 'Components/Modals/UploadModal',
  component: UploadModalComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [ModalComponent],
    }),
    componentWrapperDecorator(ModalComponent),
  ],
};

export default meta;

type Story = StoryObj<UploadModalComponent>;

export const Default: Story = {
  args: {},
};
