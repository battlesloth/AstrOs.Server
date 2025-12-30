import type { Meta, StoryObj } from '@storybook/vue3';
import { fn } from 'storybook/test';
import AstrosAddModuleModal from './AstrosAddModuleModal.vue';
import { Location } from '@/enums/modules/Location';
import { ModuleType } from '@/enums/modules/ModuleType';

const meta = {
  title: 'Components/Modals/Modules/AddModuleModal',
  component: AstrosAddModuleModal,
  parameters: {
    layout: 'centered',
  },
  args: {
    isOpen: true,
    onAdd: fn(),
    onClose: fn(),
  },
  tags: ['autodocs'],
} satisfies Meta<typeof AstrosAddModuleModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    locationId: Location.core,
    moduleType: ModuleType.uart,
  },
};

export const Serial: Story = {
  args: {
    locationId: Location.core,
    moduleType: ModuleType.uart,
  },
};

export const I2C: Story = {
  args: {
    locationId: Location.core,
    moduleType: ModuleType.i2c,
  },
};

export const GPIO: Story = {
  args: {
    locationId: Location.core,
    moduleType: ModuleType.gpio,
  },
};

export const Closed: Story = {
  args: {
    locationId: Location.core,
    moduleType: ModuleType.uart,
    isOpen: false,
  },
};
