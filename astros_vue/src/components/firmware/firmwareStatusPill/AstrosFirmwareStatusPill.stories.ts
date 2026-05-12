import type { Meta, StoryObj } from '@storybook/vue3-vite';
import AstrosFirmwareStatusPill from './AstrosFirmwareStatusPill.vue';

const meta = {
  title: 'Components/Firmware/AstrosFirmwareStatusPill',
  component: AstrosFirmwareStatusPill,
  parameters: { layout: 'centered' },
  argTypes: {
    kind: {
      control: 'select',
      options: ['idle', 'queued', 'updating', 'done', 'failed', 'upToDate', 'offline', 'downgrade'],
    },
  },
} satisfies Meta<typeof AstrosFirmwareStatusPill>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = { args: { kind: 'idle' } };
export const Queued: Story = { args: { kind: 'queued' } };
export const Updating: Story = { args: { kind: 'updating' } };
export const Done: Story = { args: { kind: 'done' } };
export const Failed: Story = { args: { kind: 'failed' } };
export const UpToDate: Story = { args: { kind: 'upToDate' } };
export const Offline: Story = { args: { kind: 'offline' } };
export const Downgrade: Story = { args: { kind: 'downgrade' } };
