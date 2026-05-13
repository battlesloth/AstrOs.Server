import type { Meta, StoryObj } from '@storybook/vue3-vite';
import AstrosFirmwareControllerRow from './AstrosFirmwareControllerRow.vue';
import { Location } from '@/enums';
import type { FirmwareControllerView } from '@/types/firmware';

const body: FirmwareControllerView = {
  id: Location.BODY,
  label: 'Body',
  glyph: 'B',
  current: 'v1.3.0',
  status: 'up',
  isMaster: true,
};
const core: FirmwareControllerView = {
  id: Location.CORE,
  label: 'Core',
  glyph: 'C',
  current: 'v1.4.0',
  status: 'up',
  isMaster: false,
};
const domeOffline: FirmwareControllerView = {
  id: Location.DOME,
  label: 'Dome',
  glyph: 'D',
  current: 'v1.4.0',
  status: 'down',
  isMaster: false,
};

const meta = {
  title: 'Components/Firmware/AstrosFirmwareControllerRow',
  component: AstrosFirmwareControllerRow,
  parameters: { layout: 'padded' },
  decorators: [
    (story) => ({
      components: { story },
      template:
        '<div style="background: #fff; max-width: 480px; border: 1px solid #d6e0e6; border-radius: 6px;"><story /></div>',
    }),
  ],
} satisfies Meta<typeof AstrosFirmwareControllerRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SelectModeMasterUpgrade: Story = {
  args: { controller: body, target: 'v1.4.2', mode: 'select', selected: true },
};

export const SelectModePadawanUpgrade: Story = {
  args: { controller: core, target: 'v1.4.2', mode: 'select', selected: false },
};

export const SelectModeUpToDate: Story = {
  args: { controller: core, target: 'v1.4.0', mode: 'select', selected: false },
};

export const SelectModeNoTarget: Story = {
  args: { controller: body, target: null, mode: 'select', selected: false },
};

export const SelectModeDowngrade: Story = {
  args: { controller: core, target: 'v1.3.5', mode: 'select', selected: false },
};

export const SelectModeOffline: Story = {
  args: { controller: domeOffline, target: 'v1.4.2', mode: 'select', selected: false },
};

export const ProgressModeQueued: Story = {
  args: {
    controller: body,
    target: 'v1.4.2',
    mode: 'progress',
    selected: true,
    progressStatus: 'queued',
  },
};

export const ProgressModeUpdating: Story = {
  args: {
    controller: body,
    target: 'v1.4.2',
    mode: 'progress',
    selected: true,
    progressStatus: 'updating',
    stageLabelKey: 'firmware_view.stages.transfer.label',
  },
};

export const ProgressModeDone: Story = {
  args: {
    controller: core,
    target: 'v1.4.2',
    mode: 'progress',
    selected: true,
    progressStatus: 'done',
  },
};

export const ProgressModeFailed: Story = {
  args: {
    controller: core,
    target: 'v1.4.2',
    mode: 'progress',
    selected: true,
    progressStatus: 'failed',
  },
};
