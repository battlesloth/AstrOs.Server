import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { createPinia, setActivePinia } from 'pinia';
import SystemStatusBanner from './SystemStatusBanner.vue';
import { useSystemStatusStore } from '@/stores/systemStatus';
import type { ReadOnlyReasonCode } from '@/types/systemStatus';

const meta = {
  title: 'Components/Common/SystemStatusBanner',
  component: SystemStatusBanner,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof SystemStatusBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

function makeStory(reasonCode: ReadOnlyReasonCode | null | 'NOT_A_REAL_CODE'): Story {
  return {
    render: () => ({
      components: { SystemStatusBanner },
      setup() {
        // Each story owns its Pinia instance so the readOnly state doesn't
        // bleed between stories in the same Storybook session.
        setActivePinia(createPinia());
        const store = useSystemStatusStore();
        store.setStatus({
          readOnly: true,
          reasonCode: reasonCode as ReadOnlyReasonCode | null | undefined,
        });
        return {};
      },
      template: '<SystemStatusBanner />',
    }),
  };
}

export const Hidden: Story = {
  render: () => ({
    components: { SystemStatusBanner },
    setup() {
      setActivePinia(createPinia());
      // Default state — readOnly=false; banner should render nothing.
      return {};
    },
    template:
      '<div class="p-4 text-sm">Banner is hidden when readOnly=false. Nothing renders below this line.</div><SystemStatusBanner />',
  }),
};

export const StartupOpenFailed = makeStory('STARTUP_OPEN_FAILED');
export const BackupFailed = makeStory('BACKUP_FAILED');
export const MigrationFailedNoBackup = makeStory('MIGRATION_FAILED_NO_BACKUP');
export const MigrationFailedRestored = makeStory('MIGRATION_FAILED_RESTORED');
export const MigrationFailedRestoreFailed = makeStory('MIGRATION_FAILED_RESTORE_FAILED');

// Future-proofing: simulates a server reasonCode the client doesn't recognize.
// The banner should still render with the UNKNOWN fallback message instead of
// leaking the raw key path.
export const UnknownReasonCode = makeStory('NOT_A_REAL_CODE');

// Explicitly null: e.g. read-only set without a code.
export const NoReasonCode = makeStory(null);
