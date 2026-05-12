import type { Meta, StoryObj } from '@storybook/vue3-vite';
import AstrosFirmwareStagesList from './AstrosFirmwareStagesList.vue';

const meta = {
  title: 'Components/Firmware/AstrosFirmwareStagesList',
  component: AstrosFirmwareStagesList,
  parameters: { layout: 'padded' },
  decorators: [
    (story) => ({
      components: { story },
      template:
        '<div style="background: #f2f7fa; padding: 24px; max-width: 380px;"><story /></div>',
    }),
  ],
} satisfies Meta<typeof AstrosFirmwareStagesList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {
  args: { phase: 'idle', currentStage: null },
};

export const Flashing: Story = {
  args: { phase: 'flashing', currentStage: 'transfer' },
};

export const Done: Story = {
  args: { phase: 'done', currentStage: null },
};

export const FailedAtTransfer: Story = {
  args: { phase: 'failed', currentStage: null, failedStage: 'transfer' },
};

export const FailedAtDownload: Story = {
  args: { phase: 'failed', currentStage: null, failedStage: 'download' },
};
