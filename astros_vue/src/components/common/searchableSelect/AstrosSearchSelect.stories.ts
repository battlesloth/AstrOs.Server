import type { Meta, StoryObj } from '@storybook/vue3';
import AstrosSearchSelect from './AstrosSearchSelect.vue';
import { ref } from 'vue';

const sampleOptions = [
  { id: '1', label: 'Open Dome' },
  { id: '2', label: 'Close Dome' },
  { id: '3', label: 'Start Tracking' },
  { id: '4', label: 'Stop Tracking' },
  { id: '5', label: 'Emergency Stop' },
  { id: '6', label: 'Focus Camera' },
  { id: '7', label: 'Calibrate' },
  { id: '8', label: 'Park Telescope' },
  { id: '9', label: 'Unpark Telescope' },
  { id: '10', label: 'Run Diagnostics' },
];

const meta = {
  title: 'Components/Common/SearchableSelect',
  component: AstrosSearchSelect,
  render: (args: any) => ({
    components: { AstrosSearchSelect },
    setup() {
      const selected = ref(args.modelValue ?? '');
      return { args, selected };
    },
    template: '<AstrosSearchSelect v-bind="args" v-model="selected" />',
  }),
  args: {
    options: sampleOptions,
    placeholder: 'Select an option...',
    dataTestid: 'search-select',
    modelValue: '',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof AstrosSearchSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default state with no selection */
export const Default: Story = {
  args: {
    modelValue: '',
  },
};

/** Pre-selected value */
export const WithSelection: Story = {
  args: {
    modelValue: '3',
  },
  render: (args: any) => ({
    components: { AstrosSearchSelect },
    setup() {
      const selected = ref('3');
      return { args, selected };
    },
    template: '<AstrosSearchSelect v-bind="args" v-model="selected" />',
  }),
};

/** Only a few options */
export const FewOptions: Story = {
  args: {
    options: [
      { id: '1', label: 'Option A' },
      { id: '2', label: 'Option B' },
    ],
    placeholder: 'Pick one...',
    modelValue: '',
  },
};

/** Many options to demonstrate scrolling */
export const ManyOptions: Story = {
  args: {
    options: Array.from({ length: 50 }, (_, i) => ({
      id: String(i + 1),
      label: `Item ${i + 1}`,
    })),
    placeholder: 'Search from 50 items...',
    modelValue: '',
  },
};
