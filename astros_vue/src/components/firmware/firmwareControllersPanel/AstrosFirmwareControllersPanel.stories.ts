import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { createPinia, setActivePinia } from 'pinia';
import AstrosFirmwareControllersPanel from './AstrosFirmwareControllersPanel.vue';
import { useFirmwareStore } from '@/stores/firmware';
import type { FirmwareControllerView } from '@/types/firmware';

const SAMPLE_CONTROLLERS: FirmwareControllerView[] = [
  { id: 'body', label: 'Body', glyph: 'B', current: 'v1.3.0', status: 'up', isMaster: true },
  { id: 'core', label: 'Core', glyph: 'C', current: 'v1.4.0', status: 'up', isMaster: false },
  { id: 'dome', label: 'Dome', glyph: 'D', current: 'v1.4.0', status: 'down', isMaster: false },
];

function setupStore(opts: {
  target?: string | null;
  selected?: string[];
  controllers?: FirmwareControllerView[];
  flashErrorReason?: string;
}) {
  setActivePinia(createPinia());
  const store = useFirmwareStore();
  store.controllers = opts.controllers ?? SAMPLE_CONTROLLERS;
  store.sourceMode = 'github';
  store.selectedReleaseTag = opts.target ?? null;
  store.selectedControllerIds = new Set(opts.selected ?? []);
  if (opts.flashErrorReason !== undefined) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    store.flashError = { reason: opts.flashErrorReason as any };
  }
}

const meta = {
  title: 'Components/Firmware/AstrosFirmwareControllersPanel',
  component: AstrosFirmwareControllersPanel,
  parameters: { layout: 'padded' },
  decorators: [
    (story) => ({
      components: { story },
      template:
        '<div style="background: #f2f7fa; padding: 24px; max-width: 560px;"><story /></div>',
    }),
  ],
} satisfies Meta<typeof AstrosFirmwareControllersPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SelectInitial: Story = {
  render: (args) => ({
    components: { AstrosFirmwareControllersPanel },
    setup() {
      setupStore({ target: null });
      return { args };
    },
    template: '<AstrosFirmwareControllersPanel v-bind="args" />',
  }),
  args: { phase: 'select' },
};

export const SelectTargetNoSelection: Story = {
  render: (args) => ({
    components: { AstrosFirmwareControllersPanel },
    setup() {
      setupStore({ target: 'v1.4.2', selected: [] });
      return { args };
    },
    template: '<AstrosFirmwareControllersPanel v-bind="args" />',
  }),
  args: { phase: 'select' },
};

export const SelectWithTarget: Story = {
  render: (args) => ({
    components: { AstrosFirmwareControllersPanel },
    setup() {
      setupStore({ target: 'v1.4.2', selected: ['body'] });
      return { args };
    },
    template: '<AstrosFirmwareControllersPanel v-bind="args" />',
  }),
  args: { phase: 'select' },
};

export const SelectAllSelected: Story = {
  render: (args) => ({
    components: { AstrosFirmwareControllersPanel },
    setup() {
      setupStore({ target: 'v1.4.2', selected: ['body', 'core'] });
      return { args };
    },
    template: '<AstrosFirmwareControllersPanel v-bind="args" />',
  }),
  args: { phase: 'select' },
};

export const SelectWithFlashError: Story = {
  render: (args) => ({
    components: { AstrosFirmwareControllersPanel },
    setup() {
      setupStore({
        target: 'v1.4.2',
        selected: ['body'],
        flashErrorReason: 'job_already_running',
      });
      return { args };
    },
    template: '<AstrosFirmwareControllersPanel v-bind="args" />',
  }),
  args: { phase: 'select' },
};

export const SelectWithDowngrade: Story = {
  render: (args) => ({
    components: { AstrosFirmwareControllersPanel },
    setup() {
      setupStore({ target: 'v1.3.5', selected: ['body', 'core'] });
      return { args };
    },
    template: '<AstrosFirmwareControllersPanel v-bind="args" />',
  }),
  args: { phase: 'select' },
};

export const Flashing: Story = {
  render: (args) => ({
    components: { AstrosFirmwareControllersPanel },
    setup() {
      setupStore({ target: 'v1.4.2', selected: ['body', 'core'] });
      return { args };
    },
    template: '<AstrosFirmwareControllersPanel v-bind="args" />',
  }),
  args: {
    phase: 'flashing',
    progressByControllerId: {
      body: { status: 'updating', stageLabel: 'Transfer' },
      core: { status: 'queued' },
      dome: { status: 'idle' },
    },
  },
};

export const Done: Story = {
  render: (args) => ({
    components: { AstrosFirmwareControllersPanel },
    setup() {
      setupStore({ target: 'v1.4.2', selected: ['body', 'core'] });
      return { args };
    },
    template: '<AstrosFirmwareControllersPanel v-bind="args" />',
  }),
  args: {
    phase: 'done',
    doneCount: 2,
    progressByControllerId: {
      body: { status: 'done' },
      core: { status: 'done' },
      dome: { status: 'idle' },
    },
  },
};

export const FailedCore: Story = {
  render: (args) => ({
    components: { AstrosFirmwareControllersPanel },
    setup() {
      setupStore({ target: 'v1.4.2', selected: ['body', 'core'] });
      return { args };
    },
    template: '<AstrosFirmwareControllersPanel v-bind="args" />',
  }),
  args: {
    phase: 'failed',
    failedControllerLabel: 'Core',
    failedStage: 'transfer',
    progressByControllerId: {
      body: { status: 'done' },
      core: { status: 'failed' },
      dome: { status: 'idle' },
    },
  },
};
