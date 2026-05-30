import type { Meta, StoryObj } from '@storybook/vue3-vite';
import AstrosFirmwareStagesBoard from './AstrosFirmwareStagesBoard.vue';
import { controllerStageColumn } from '@/utils/firmwareStageBoard';

const meta = {
  title: 'Components/Firmware/AstrosFirmwareStagesBoard',
  component: AstrosFirmwareStagesBoard,
  parameters: { layout: 'padded' },
  decorators: [
    (story) => ({
      components: { story },
      template: '<div style="background:#f2f7fa;padding:24px;max-width:1100px;"><story /></div>',
    }),
  ],
} satisfies Meta<typeof AstrosFirmwareStagesBoard>;

export default meta;
type Story = StoryObj<typeof meta>;

const body = { id: 'body', label: 'Body', glyph: 'B', isMaster: true } as const;
const core = { id: 'core', label: 'Core', glyph: 'C', isMaster: false } as const;
const dome = { id: 'dome', label: 'Dome', glyph: 'D', isMaster: false } as const;

// Mirrors the design mockup: Body transferring, Core receiving at 54%, Dome idle.
export const MidUpdate: Story = {
  args: {
    columns: [
      controllerStageColumn(body, {
        controllerId: 'body',
        stage: 'SENDING',
        bytesSent: 0,
        totalBytes: 100,
      }),
      controllerStageColumn(core, {
        controllerId: 'core',
        stage: 'SENDING',
        bytesSent: 54,
        totalBytes: 100,
      }),
      controllerStageColumn(dome, undefined),
    ],
  },
};
