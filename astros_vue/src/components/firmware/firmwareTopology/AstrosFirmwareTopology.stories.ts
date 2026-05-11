import type { Meta, StoryObj } from '@storybook/vue3-vite';
import AstrosFirmwareTopology from './AstrosFirmwareTopology.vue';
import type { TopologyFleet } from './types';

const SAMPLE_FLEET: TopologyFleet = {
  master: { id: 'body', label: 'Body' },
  padawans: [
    { id: 'core', label: 'Core' },
    { id: 'dome', label: 'Dome' },
  ],
};

const ALL_SELECTED = new Set(['body', 'core', 'dome']);
const NONE_SELECTED: ReadonlySet<string> = new Set();

const meta = {
  title: 'Components/Firmware/AstrosFirmwareTopology',
  component: AstrosFirmwareTopology,
  parameters: { layout: 'padded' },
  decorators: [
    (story) => ({
      components: { story },
      template:
        '<div style="background: #f2f7fa; padding: 24px; max-width: 380px;"><story /></div>',
    }),
  ],
} satisfies Meta<typeof AstrosFirmwareTopology>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SelectIdle: Story = {
  args: {
    fleet: SAMPLE_FLEET,
    selectedIds: NONE_SELECTED,
    target: null,
    phase: 'select',
  },
};

export const SelectAllSelected: Story = {
  args: {
    fleet: SAMPLE_FLEET,
    selectedIds: ALL_SELECTED,
    target: 'v1.4.2',
    phase: 'select',
  },
};

export const Flashing: Story = {
  args: {
    fleet: SAMPLE_FLEET,
    selectedIds: ALL_SELECTED,
    target: 'v1.4.2',
    phase: 'flashing',
  },
};

export const Done: Story = {
  args: {
    fleet: SAMPLE_FLEET,
    selectedIds: ALL_SELECTED,
    target: 'v1.4.2',
    phase: 'done',
  },
};

export const FailedCore: Story = {
  args: {
    fleet: SAMPLE_FLEET,
    selectedIds: ALL_SELECTED,
    target: 'v1.4.2',
    phase: 'failed',
    failedControllerId: 'core',
  },
};

export const FailedMaster: Story = {
  args: {
    fleet: SAMPLE_FLEET,
    selectedIds: ALL_SELECTED,
    target: 'v1.4.2',
    phase: 'failed',
    failedControllerId: 'body',
  },
};
