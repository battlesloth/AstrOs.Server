import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { createPinia, setActivePinia } from 'pinia';
import AstrosLockStateBanner from './AstrosLockStateBanner.vue';
import { useJobLockStore } from '@/stores/jobLock';
import { useFirmwareStore } from '@/stores/firmware';
import { useSystemStatusStore } from '@/stores/systemStatus';

const meta = {
  title: 'Components/Common/AstrosLockStateBanner',
  component: AstrosLockStateBanner,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof AstrosLockStateBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

// Each story owns its Pinia instance so lock / firmware / readonly state
// doesn't bleed between renders. RouterLink is registered globally in
// `.storybook/preview.ts` as an inert <a> stub.

export const Visible: Story = {
  name: 'Visible (locked, non-own job)',
  render: () => ({
    components: { AstrosLockStateBanner },
    setup() {
      setActivePinia(createPinia());
      useJobLockStore().setState({
        locked: true,
        owner: 'flash:other-operator',
        since: '2026-05-14T08:00:00.000Z',
      });
      return {};
    },
    template: '<AstrosLockStateBanner />',
  }),
};

export const HiddenIdle: Story = {
  name: 'Hidden — no flash in flight',
  render: () => ({
    components: { AstrosLockStateBanner },
    setup() {
      setActivePinia(createPinia());
      return {};
    },
    template: `
      <div class="p-4 bg-base-200">
        <p class="text-sm opacity-70">No banner rendered — job lock idle.</p>
        <AstrosLockStateBanner />
      </div>
    `,
  }),
};

export const HiddenOwnJob: Story = {
  name: 'Hidden — own job (firmware view owns it)',
  render: () => ({
    components: { AstrosLockStateBanner },
    setup() {
      setActivePinia(createPinia());
      useJobLockStore().setState({
        locked: true,
        owner: 'flash:own-job',
        since: '2026-05-14T08:00:00.000Z',
      });
      const firmwareStore = useFirmwareStore();
      firmwareStore.applyJobStarted({
        jobId: 'own-job',
        source: { kind: 'github', version: 'v1.4.2' },
        controllers: [],
        startedAt: '2026-05-14T08:00:00.000Z',
      });
      firmwareStore.ownJobId = 'own-job';
      return {};
    },
    template: `
      <div class="p-4 bg-base-200">
        <p class="text-sm opacity-70">
          No banner rendered — this view owns the flash; FirmwareView's
          in-context UI surfaces the active job instead.
        </p>
        <AstrosLockStateBanner />
      </div>
    `,
  }),
};

export const HiddenReadonly: Story = {
  name: 'Hidden — system readonly takes precedence',
  render: () => ({
    components: { AstrosLockStateBanner },
    setup() {
      setActivePinia(createPinia());
      useJobLockStore().setState({
        locked: true,
        owner: 'flash:other-operator',
        since: '2026-05-14T08:00:00.000Z',
      });
      useSystemStatusStore().setStatus({
        readOnly: true,
        reasonCode: 'BACKUP_FAILED',
      });
      return {};
    },
    template: `
      <div class="p-4 bg-base-200">
        <p class="text-sm opacity-70">
          No banner rendered — readonly is the broader condition;
          AstrosSystemStatusBanner is already telling the operator writes
          are disabled.
        </p>
        <AstrosLockStateBanner />
      </div>
    `,
  }),
};
