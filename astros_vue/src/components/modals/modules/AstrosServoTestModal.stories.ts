import type { Meta, StoryObj } from '@storybook/vue3';
import { fn } from 'storybook/test';
import AstrosServoTestModal from './AstrosServoTestModal.vue';
import { ModuleSubType } from '@/enums/modules/ModuleSubType';

const meta = {
  title: 'Components/Modals/Modules/ServoTestModal',
  component: AstrosServoTestModal,
  parameters: {
    layout: 'centered',
  },
  args: {
    onClose: fn(),
  },
  tags: ['autodocs'],
} satisfies Meta<typeof AstrosServoTestModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    controllerAddress: '192.168.1.100',
    controllerName: 'MainController',
    moduleSubType: ModuleSubType.maestro,
    moduleIdx: 0,
    channelNumber: 1,
    homePosition: 1500,
  },
};

export const Channel0: Story = {
  args: {
    controllerAddress: '192.168.1.100',
    controllerName: 'MainController',
    moduleSubType: ModuleSubType.maestro,
    moduleIdx: 0,
    channelNumber: 0,
    homePosition: 1500,
  },
};

export const Channel5: Story = {
  args: {
    controllerAddress: '192.168.1.100',
    controllerName: 'MainController',
    moduleSubType: ModuleSubType.maestro,
    moduleIdx: 1,
    channelNumber: 5,
    homePosition: 1200,
  },
};

export const PWMBoard: Story = {
  args: {
    controllerAddress: '192.168.1.200',
    controllerName: 'SecondaryController',
    moduleSubType: ModuleSubType.pwmBoard,
    moduleIdx: 2,
    channelNumber: 8,
    homePosition: 1700,
  },
};

