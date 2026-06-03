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

const ALL_SELECTED: readonly string[] = ['body', 'core', 'dome'];
const NONE_SELECTED: readonly string[] = [];

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

// Serial-upload sub-phase: server → master via UART. The source → master
// line animates; the master → padawan lines must stay solid because no
// ESP-NOW traffic is flowing yet.
export const FlashingSerialUpload: Story = {
  args: {
    fleet: SAMPLE_FLEET,
    selectedIds: ALL_SELECTED,
    target: 'v1.4.2',
    phase: 'flashing',
    currentStage: 'download',
  },
};

// Deploy sub-phase: master → padawans via ESP-NOW. Selected padawan lines
// animate; the source → master line continues to render the "this is the
// firmware being delivered" association.
export const FlashingDeployTransfer: Story = {
  args: {
    fleet: SAMPLE_FLEET,
    selectedIds: ALL_SELECTED,
    target: 'v1.4.2',
    phase: 'flashing',
    currentStage: 'transfer',
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
    failedControllerIds: new Set(['core']),
  },
};

export const FailedMaster: Story = {
  args: {
    fleet: SAMPLE_FLEET,
    selectedIds: ALL_SELECTED,
    target: 'v1.4.2',
    phase: 'failed',
    failedControllerIds: new Set(['body']),
  },
};

// Bus-wide failure case (every selected node FAILED). Both nodes should
// render red, not just one — regression pin against the prior singular
// `failedControllerId` shape that only painted the first.
export const FailedAllControllers: Story = {
  args: {
    fleet: SAMPLE_FLEET,
    selectedIds: ALL_SELECTED,
    target: 'v1.4.2',
    phase: 'failed',
    failedControllerIds: new Set(['body', 'core']),
  },
};
