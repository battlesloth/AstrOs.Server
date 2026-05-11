import type { Meta, StoryObj } from '@storybook/vue3-vite';
import AstrosFirmwareVersionDelta from './AstrosFirmwareVersionDelta.vue';

const meta = {
  title: 'Components/Firmware/AstrosFirmwareVersionDelta',
  component: AstrosFirmwareVersionDelta,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof AstrosFirmwareVersionDelta>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoTarget: Story = { args: { current: 'v1.4.0', target: null } };

export const UpToDate: Story = { args: { current: 'v1.4.2', target: 'v1.4.2' } };

export const Upgrade: Story = { args: { current: 'v1.3.0', target: 'v1.4.2' } };

export const Downgrade: Story = { args: { current: 'v1.4.2', target: 'v1.3.0' } };

export const MalformedCurrent: Story = {
  args: { current: 'not-a-version', target: 'v1.4.2' },
};
