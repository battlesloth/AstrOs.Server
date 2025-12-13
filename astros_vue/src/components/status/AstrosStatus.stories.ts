import { type Meta, type StoryObj } from '@storybook/vue3';
import { ControllerStatus } from '@/enums/controllerStatus';
import AstrosStatus from './AstrosStatus.vue';

const meta = {
  title: 'components/status/Status',
  component: AstrosStatus,
  render: (args: unknown) => ({
    components: { AstrosStatus },
    setup() {
      return { args };
    },
    template: '<AstrosStatus v-bind="args" />',
  }),
  args: {
    bodyStatus: ControllerStatus.UP,
    domeStatus: ControllerStatus.UP,
    coreStatus: ControllerStatus.UP,
  },
  tags: ['autodocs'],
} satisfies Meta<typeof AstrosStatus>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: {},
};

export const AllDown: Story = {
  args: {
    bodyStatus: ControllerStatus.DOWN,
    domeStatus: ControllerStatus.DOWN,
    coreStatus: ControllerStatus.DOWN,
  },
};

export const NeedsSynced: Story = {
  args: {
    bodyStatus: ControllerStatus.NEEDS_SYNCED,
    domeStatus: ControllerStatus.NEEDS_SYNCED,
    coreStatus: ControllerStatus.NEEDS_SYNCED,
  },
};

export const MixedStatus: Story = {
  args: {
    bodyStatus: ControllerStatus.DOWN,
    domeStatus: ControllerStatus.NEEDS_SYNCED,
    coreStatus: ControllerStatus.UP,
  },
};
