import { type Meta, type StoryObj } from '@storybook/vue3';
import AstrosMobileRemote from './AstrosMobileRemote.vue';
import type { RemoteControlPage } from '@/models/remoteControl/remoteControlPage';
import { createDefaultPage } from '@/stores/remoteControl';

// The mobile remote is sized to fill its parent. Wrap each story in a
// phone-shaped container so the layout reads the way it would inside the
// MiniPhone bezel that Phase 2's preview rail provides.
const phoneWrapper = `
  <div style="
    width: 320px;
    height: 580px;
    border: 1px solid #d6e0e6;
    border-radius: 24px;
    overflow: hidden;
    background: #fff;
  ">
    <AstrosMobileRemote v-bind="args" @press="(e) => console.log('press', e)" @panic="() => console.log('panic')" />
  </div>
`;

const compactWrapper = `
  <div style="
    width: 220px;
    height: 440px;
    border: 1px solid #d6e0e6;
    border-radius: 18px;
    overflow: hidden;
    background: #fff;
  ">
    <AstrosMobileRemote v-bind="args" @press="(e) => console.log('press', e)" @panic="() => console.log('panic')" />
  </div>
`;

function mixedPage(): RemoteControlPage {
  const page = createDefaultPage(0);
  page.name = 'Greetings';
  page.button1 = { id: 'script-wave', name: 'Wave Hello', type: 'script' };
  page.button2 = { id: 'script-beep', name: 'Beep Boop', type: 'script' };
  page.button3 = { id: 'playlist-parade', name: 'Parade Mode', type: 'playlist' };
  page.button4 = { id: 'script-spin', name: 'Spin Dome', type: 'script' };
  page.button5 = { id: 'script-tracking', name: 'Start Tracking', type: 'script' };
  page.button7 = { id: 'playlist-idle', name: 'Idle Loops', type: 'playlist' };
  page.button9 = { id: 'script-shutdown', name: 'Shutdown', type: 'script' };
  return page;
}

function sparsePage(): RemoteControlPage {
  const page = createDefaultPage(1);
  page.name = 'Performance';
  page.button1 = { id: 'script-cue', name: 'Cue One', type: 'script' };
  page.button5 = { id: 'playlist-show', name: 'Show Track', type: 'playlist' };
  page.button9 = { id: 'script-bow', name: 'Take a Bow', type: 'script' };
  return page;
}

function emptyPage(): RemoteControlPage {
  const page = createDefaultPage(2);
  page.name = 'Idle Loops';
  return page;
}

const allPages = [mixedPage(), sparsePage(), emptyPage()];

const meta = {
  title: 'components/mobileRemote/AstrosMobileRemote',
  component: AstrosMobileRemote,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof AstrosMobileRemote>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Page1Mixed: Story = {
  name: 'Page 1 — mixed (7 of 9 assigned)',
  args: {
    pages: allPages,
    initialIdx: 0,
    compact: false,
    connected: true,
  },
  render: (args) => ({
    components: { AstrosMobileRemote },
    setup() {
      return { args };
    },
    template: phoneWrapper,
  }),
};

export const Page2Sparse: Story = {
  name: 'Page 2 — sparse (3 of 9 assigned)',
  args: {
    pages: allPages,
    initialIdx: 1,
    compact: false,
    connected: true,
  },
  render: (args) => ({
    components: { AstrosMobileRemote },
    setup() {
      return { args };
    },
    template: phoneWrapper,
  }),
};

export const Page3Empty: Story = {
  name: 'Page 3 — empty (all slots dashed)',
  args: {
    pages: allPages,
    initialIdx: 2,
    compact: false,
    connected: true,
  },
  render: (args) => ({
    components: { AstrosMobileRemote },
    setup() {
      return { args };
    },
    template: phoneWrapper,
  }),
};

export const CompactPreview: Story = {
  name: 'Compact preview (Phase 2 rail mode)',
  args: {
    pages: allPages,
    initialIdx: 0,
    compact: true,
    connected: true,
  },
  render: (args) => ({
    components: { AstrosMobileRemote },
    setup() {
      return { args };
    },
    template: compactWrapper,
  }),
};

export const Disconnected: Story = {
  name: 'Disconnected (no Connected chip)',
  args: {
    pages: allPages,
    initialIdx: 0,
    compact: false,
    connected: false,
  },
  render: (args) => ({
    components: { AstrosMobileRemote },
    setup() {
      return { args };
    },
    template: phoneWrapper,
  }),
};

export const EmptyPagesArray: Story = {
  name: 'Empty pages array (safety branch)',
  args: {
    pages: [],
    initialIdx: 0,
    compact: false,
    connected: true,
  },
  render: (args) => ({
    components: { AstrosMobileRemote },
    setup() {
      return { args };
    },
    template: phoneWrapper,
  }),
};
