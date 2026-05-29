import type { Meta, StoryObj } from '@storybook/vue3-vite';
import AstrosFirmwareButton from './AstrosFirmwareButton.vue';

const meta = {
  title: 'Components/Firmware/AstrosFirmwareButton',
  component: AstrosFirmwareButton,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    kind: {
      control: 'select',
      options: ['primary', 'secondary', 'ghost', 'danger'],
    },
  },
} satisfies Meta<typeof AstrosFirmwareButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: { kind: 'primary' },
  render: (args) => ({
    components: { AstrosFirmwareButton },
    setup: () => ({ args }),
    template: `<AstrosFirmwareButton v-bind="args">Flash firmware</AstrosFirmwareButton>`,
  }),
};

export const Secondary: Story = {
  args: { kind: 'secondary' },
  render: (args) => ({
    components: { AstrosFirmwareButton },
    setup: () => ({ args }),
    template: `<AstrosFirmwareButton v-bind="args">Cancel</AstrosFirmwareButton>`,
  }),
};

export const Ghost: Story = {
  args: { kind: 'ghost' },
  render: (args) => ({
    components: { AstrosFirmwareButton },
    setup: () => ({ args }),
    template: `<AstrosFirmwareButton v-bind="args">View logs</AstrosFirmwareButton>`,
  }),
};

export const Danger: Story = {
  args: { kind: 'danger' },
  render: (args) => ({
    components: { AstrosFirmwareButton },
    setup: () => ({ args }),
    template: `<AstrosFirmwareButton v-bind="args">Cancel update</AstrosFirmwareButton>`,
  }),
};

export const Disabled: Story = {
  args: { kind: 'primary', disabled: true },
  render: (args) => ({
    components: { AstrosFirmwareButton },
    setup: () => ({ args }),
    template: `<AstrosFirmwareButton v-bind="args">Flash firmware</AstrosFirmwareButton>`,
  }),
};

export const FullWidth: Story = {
  args: { kind: 'primary', fullWidth: true },
  parameters: { layout: 'padded' },
  render: (args) => ({
    components: { AstrosFirmwareButton },
    setup: () => ({ args }),
    template: `<div style="width: 320px;"><AstrosFirmwareButton v-bind="args">Flash firmware</AstrosFirmwareButton></div>`,
  }),
};

export const AllKinds: Story = {
  parameters: { layout: 'padded' },
  render: () => ({
    components: { AstrosFirmwareButton },
    template: `
      <div style="display: grid; grid-template-columns: repeat(4, max-content); gap: 16px; align-items: start;">
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <AstrosFirmwareButton kind="primary">Primary</AstrosFirmwareButton>
          <AstrosFirmwareButton kind="primary" disabled>Primary disabled</AstrosFirmwareButton>
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <AstrosFirmwareButton kind="secondary">Secondary</AstrosFirmwareButton>
          <AstrosFirmwareButton kind="secondary" disabled>Secondary disabled</AstrosFirmwareButton>
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <AstrosFirmwareButton kind="ghost">Ghost</AstrosFirmwareButton>
          <AstrosFirmwareButton kind="ghost" disabled>Ghost disabled</AstrosFirmwareButton>
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <AstrosFirmwareButton kind="danger">Danger</AstrosFirmwareButton>
          <AstrosFirmwareButton kind="danger" disabled>Danger disabled</AstrosFirmwareButton>
        </div>
      </div>
    `,
  }),
};
