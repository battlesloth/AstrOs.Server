import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { createPinia, setActivePinia } from 'pinia';
import AstrosWriteButton from './AstrosWriteButton.vue';
import { useSystemStatusStore } from '@/stores/systemStatus';

const meta = {
  title: 'Components/Common/AstrosWriteButton',
  component: AstrosWriteButton,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof AstrosWriteButton>;

export default meta;
type Story = StoryObj<typeof meta>;

// Each story owns its Pinia instance so readOnly state doesn't bleed.

export const Default: Story = {
  render: () => ({
    components: { AstrosWriteButton },
    setup() {
      setActivePinia(createPinia());
      return {};
    },
    template: `
      <AstrosWriteButton class="btn btn-primary w-32">
        Save
      </AstrosWriteButton>
    `,
  }),
};

export const ReadOnly: Story = {
  render: () => ({
    components: { AstrosWriteButton },
    setup() {
      setActivePinia(createPinia());
      useSystemStatusStore().setStatus({
        readOnly: true,
        reasonCode: 'BACKUP_FAILED',
      });
      return {};
    },
    template: `
      <div class="p-8">
        <AstrosWriteButton class="btn btn-primary w-32">
          Save
        </AstrosWriteButton>
      </div>
    `,
  }),
};

export const DisabledByCaller: Story = {
  render: () => ({
    components: { AstrosWriteButton },
    setup() {
      setActivePinia(createPinia());
      return {};
    },
    template: `
      <AstrosWriteButton :disabled="true" class="btn btn-primary w-32">
        Save (loading)
      </AstrosWriteButton>
    `,
  }),
};

export const WithIconAndText: Story = {
  render: () => ({
    components: { AstrosWriteButton },
    setup() {
      setActivePinia(createPinia());
      return {};
    },
    template: `
      <AstrosWriteButton class="btn btn-primary">
        <span>💾</span>
        <span>Save</span>
      </AstrosWriteButton>
    `,
  }),
};
