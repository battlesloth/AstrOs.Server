import type { Meta, StoryObj } from '@storybook/vue3-vite';
import AstrosFirmwareTopology from './AstrosFirmwareTopology.vue';
import type { TopologyController } from './types';

const SAMPLE_CONTROLLERS: TopologyController[] = [
  { id: 'body', label: 'Body' },
  { id: 'core', label: 'Core' },
  { id: 'dome', label: 'Dome' },
];

const ALL_SELECTED = { body: true, core: true, dome: true };
const NONE_SELECTED = { body: false, core: false, dome: false };

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
    controllers: SAMPLE_CONTROLLERS,
    selectedIds: NONE_SELECTED,
    target: null,
    phase: 'select',
  },
};

export const SelectAllSelected: Story = {
  args: {
    controllers: SAMPLE_CONTROLLERS,
    selectedIds: ALL_SELECTED,
    target: 'v1.4.2',
    phase: 'select',
  },
};

export const Flashing: Story = {
  args: {
    controllers: SAMPLE_CONTROLLERS,
    selectedIds: ALL_SELECTED,
    target: 'v1.4.2',
    phase: 'flashing',
  },
};

export const Done: Story = {
  args: {
    controllers: SAMPLE_CONTROLLERS,
    selectedIds: ALL_SELECTED,
    target: 'v1.4.2',
    phase: 'done',
  },
};

export const FailedCore: Story = {
  args: {
    controllers: SAMPLE_CONTROLLERS,
    selectedIds: ALL_SELECTED,
    target: 'v1.4.2',
    phase: 'failed',
    failedControllerId: 'core',
  },
};
