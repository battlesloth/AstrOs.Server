import type { Meta, StoryObj } from '@storybook/vue3-vite';
import FwBtn from './FwBtn.vue';

const meta = {
  title: 'Components/Firmware/FwBtn',
  component: FwBtn,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    kind: {
      control: 'select',
      options: ['primary', 'secondary', 'ghost', 'danger'],
    },
  },
} satisfies Meta<typeof FwBtn>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: { kind: 'primary' },
  render: (args) => ({
    components: { FwBtn },
    setup: () => ({ args }),
    template: `<FwBtn v-bind="args">Flash firmware</FwBtn>`,
  }),
};

export const Secondary: Story = {
  args: { kind: 'secondary' },
  render: (args) => ({
    components: { FwBtn },
    setup: () => ({ args }),
    template: `<FwBtn v-bind="args">Cancel</FwBtn>`,
  }),
};

export const Ghost: Story = {
  args: { kind: 'ghost' },
  render: (args) => ({
    components: { FwBtn },
    setup: () => ({ args }),
    template: `<FwBtn v-bind="args">View logs</FwBtn>`,
  }),
};

export const Danger: Story = {
  args: { kind: 'danger' },
  render: (args) => ({
    components: { FwBtn },
    setup: () => ({ args }),
    template: `<FwBtn v-bind="args">Cancel update</FwBtn>`,
  }),
};

export const Disabled: Story = {
  args: { kind: 'primary', disabled: true },
  render: (args) => ({
    components: { FwBtn },
    setup: () => ({ args }),
    template: `<FwBtn v-bind="args">Flash firmware</FwBtn>`,
  }),
};

export const FullWidth: Story = {
  args: { kind: 'primary', fullWidth: true },
  parameters: { layout: 'padded' },
  render: (args) => ({
    components: { FwBtn },
    setup: () => ({ args }),
    template: `<div style="width: 320px;"><FwBtn v-bind="args">Flash firmware</FwBtn></div>`,
  }),
};

export const AllKinds: Story = {
  parameters: { layout: 'padded' },
  render: () => ({
    components: { FwBtn },
    template: `
      <div style="display: grid; grid-template-columns: repeat(4, max-content); gap: 16px; align-items: start;">
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <FwBtn kind="primary">Primary</FwBtn>
          <FwBtn kind="primary" disabled>Primary disabled</FwBtn>
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <FwBtn kind="secondary">Secondary</FwBtn>
          <FwBtn kind="secondary" disabled>Secondary disabled</FwBtn>
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <FwBtn kind="ghost">Ghost</FwBtn>
          <FwBtn kind="ghost" disabled>Ghost disabled</FwBtn>
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <FwBtn kind="danger">Danger</FwBtn>
          <FwBtn kind="danger" disabled>Danger disabled</FwBtn>
        </div>
      </div>
    `,
  }),
};
