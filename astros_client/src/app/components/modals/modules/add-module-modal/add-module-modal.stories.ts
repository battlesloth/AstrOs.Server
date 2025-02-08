import {
  componentWrapperDecorator,
  Meta,
  moduleMetadata,
  StoryObj,
} from '@storybook/angular';
import {
  AddModuleModalComponent,
  AddModuleModalResources,
} from './add-module-modal.component';
import { ModalComponent } from '../../modal-base/modal.component';
import { ModuleType } from 'astros-common';

const meta: Meta<AddModuleModalComponent> = {
  title: 'Modals/Modules/AddModuleModal',
  component: AddModuleModalComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [ModalComponent],
    }),
    componentWrapperDecorator(ModalComponent),
  ],
};

export default meta;

type Story = StoryObj<AddModuleModalComponent>;

export const Default: Story = {
  args: {},
};

export const Serial: Story = {
  args: {
    resources: new Map<string, unknown>([
      [AddModuleModalResources.locationId, "core"],
      [AddModuleModalResources.moduleType, ModuleType.uart],
    ]),
  },
};

export const I2C: Story = {
  args: {
    resources: new Map<string, unknown>([
      [AddModuleModalResources.locationId, "core"],
      [AddModuleModalResources.moduleType, ModuleType.i2c],
    ]),
  },
};

export const GPIO: Story = {
  args: {
    resources: new Map<string, unknown>([
      [AddModuleModalResources.locationId, "core"],
      [AddModuleModalResources.moduleType, ModuleType.gpio],
    ]),
  },
};
