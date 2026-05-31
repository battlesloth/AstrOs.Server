import type { Meta, StoryObj } from '@storybook/vue3-vite';
import AstrosFirmwareStageColumn from './AstrosFirmwareStageColumn.vue';
import { controllerStageColumn } from '@/utils/firmwareStageBoard';

const meta = {
  title: 'Components/Firmware/AstrosFirmwareStageColumn',
  component: AstrosFirmwareStageColumn,
  parameters: { layout: 'padded' },
  decorators: [
    (story) => ({
      components: { story },
      template: '<div style="background:#f2f7fa;padding:24px;max-width:320px;"><story /></div>',
    }),
  ],
} satisfies Meta<typeof AstrosFirmwareStageColumn>;

export default meta;
type Story = StoryObj<typeof meta>;

const body = { id: 'body', label: 'Body', glyph: 'B', isMaster: true } as const;
const core = { id: 'core', label: 'Core', glyph: 'C', isMaster: false } as const;
const dome = { id: 'dome', label: 'Dome', glyph: 'D', isMaster: false } as const;

export const MasterTransferring: Story = {
  args: {
    column: controllerStageColumn(body, {
      controllerId: 'body',
      stage: 'SENDING',
      bytesSent: 0,
      totalBytes: 100,
    }),
  },
};

export const PadawanReceiving: Story = {
  args: {
    column: controllerStageColumn(core, {
      controllerId: 'core',
      stage: 'SENDING',
      bytesSent: 54,
      totalBytes: 100,
    }),
  },
};

export const NotInUpdate: Story = {
  args: { column: controllerStageColumn(dome, undefined) },
};

export const Done: Story = {
  args: {
    column: controllerStageColumn(core, {
      controllerId: 'core',
      stage: 'VERSION_CONFIRMED',
      finalVersion: 'v1.4.2',
    }),
  },
};
