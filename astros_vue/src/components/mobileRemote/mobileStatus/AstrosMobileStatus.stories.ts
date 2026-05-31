import { type Meta, type StoryObj } from '@storybook/vue3';
import AstrosMobileStatus from './AstrosMobileStatus.vue';
import { ControllerStatus } from '@/enums';

// Sized container so the flex-fill status panel has room to render the droid,
// legend, and the bottom-anchored logout button.
const panelWrapper = `
  <div style="width: 340px; height: 620px; border: 1px solid #d6e0e6; border-radius: 24px; overflow: hidden; display: flex; flex-direction: column;">
    <AstrosMobileStatus v-bind="args" @logout="() => console.log('logout')" />
  </div>
`;

const meta: Meta<typeof AstrosMobileStatus> = {
  title: 'MobileRemote/AstrosMobileStatus',
  component: AstrosMobileStatus,
  render: (args) => ({
    components: { AstrosMobileStatus },
    setup: () => ({ args }),
    template: panelWrapper,
  }),
};
export default meta;

type Story = StoryObj<typeof AstrosMobileStatus>;

export const AllOnline: Story = {
  args: {
    domeStatus: ControllerStatus.UP,
    coreStatus: ControllerStatus.UP,
    bodyStatus: ControllerStatus.UP,
  },
};

export const Mixed: Story = {
  args: {
    domeStatus: ControllerStatus.UP,
    coreStatus: ControllerStatus.NEEDS_SYNCED,
    bodyStatus: ControllerStatus.DOWN,
  },
};

export const AllOffline: Story = {
  args: {
    domeStatus: ControllerStatus.DOWN,
    coreStatus: ControllerStatus.DOWN,
    bodyStatus: ControllerStatus.DOWN,
  },
};
