import {
  componentWrapperDecorator,
  moduleMetadata,
  Meta,
  StoryObj,
} from '@storybook/angular';
import { ModalComponent } from '../../modal-base/modal.component';
import { UploadModalComponent } from './upload-modal.component';
import { HttpClient } from '@angular/common/http';
import { HttpClientMock } from '@src/mocks';

const meta: Meta<UploadModalComponent> = {
  title: 'Modals/Utility/UploadModal',
  component: UploadModalComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [ModalComponent],
      providers: [{ provide: HttpClient, useClass: HttpClientMock }],
    }),
    componentWrapperDecorator(ModalComponent),
  ],
};

export default meta;

type Story = StoryObj<UploadModalComponent>;

export const Default: Story = {
  args: {},
};
