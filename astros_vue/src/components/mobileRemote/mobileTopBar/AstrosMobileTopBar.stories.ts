import { type Meta, type StoryObj } from '@storybook/vue3';
import AstrosMobileTopBar from './AstrosMobileTopBar.vue';

const meta: Meta<typeof AstrosMobileTopBar> = {
  title: 'MobileRemote/AstrosMobileTopBar',
  component: AstrosMobileTopBar,
  argTypes: {
    connected: { control: 'boolean' },
    screen: { control: 'select', options: ['remote', 'status'] },
  },
  render: (args) => ({
    components: { AstrosMobileTopBar },
    setup: () => ({ args }),
    template: `<AstrosMobileTopBar v-bind="args" @toggle="() => console.log('toggle')" />`,
  }),
};
export default meta;

type Story = StoryObj<typeof AstrosMobileTopBar>;

// Connected on the remote screen → green button reading the connection status.
export const ConnectedRemote: Story = { args: { connected: true, screen: 'remote' } };

// Disconnected → red button reading "Offline".
export const OfflineRemote: Story = { args: { connected: false, screen: 'remote' } };

// On the status screen the button reads "Remote" but keeps the connection color.
export const ConnectedStatus: Story = { args: { connected: true, screen: 'status' } };
