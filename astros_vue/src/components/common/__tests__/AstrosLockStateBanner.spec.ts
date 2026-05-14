import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ref } from 'vue';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import enUS from '@/locales/enUS.json';
import AstrosLockStateBanner from '@/components/common/lockStateBanner/AstrosLockStateBanner.vue';
import { useJobLockStore } from '@/stores/jobLock';
import { useFirmwareStore } from '@/stores/firmware';
import { useSystemStatusStore } from '@/stores/systemStatus';

// Hoisted mutable route ref so individual tests can flip the current path.
const mockRoutePath = ref('/scripts');

vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-router')>();
  return {
    ...actual,
    useRoute: () => ({
      get path() {
        return mockRoutePath.value;
      },
    }),
  };
});

// Two separate mocks are needed:
//   - vi.mock('vue-router') above intercepts the script-side `useRoute()`
//     import that the banner's <script setup> calls.
//   - global.stubs.RouterLink (registered on mount) provides the template-side
//     <RouterLink> component, which Vue resolves by name at compile time and
//     doesn't read from the vi.mock module export.
// Both are live — removing either breaks the tests.
const RouterLinkStub = {
  name: 'RouterLink',
  props: { to: { type: [String, Object], required: true } },
  template: `<a :href="to"><slot /></a>`,
};

function createTestI18n() {
  return createI18n({
    legacy: false,
    locale: 'enUS',
    fallbackLocale: 'enUS',
    messages: { enUS },
  });
}

function mountBanner() {
  return mount(AstrosLockStateBanner, {
    global: {
      plugins: [createTestI18n()],
      stubs: { RouterLink: RouterLinkStub },
    },
  });
}

describe('AstrosLockStateBanner', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockRoutePath.value = '/scripts';
  });

  it('renders nothing when the job lock is idle (no flash in flight)', () => {
    const wrapper = mountBanner();
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
    expect(wrapper.text()).toBe('');
  });

  it('renders the ambient banner with role="status" when the lock is held by another view', async () => {
    // Pin role="status" (not role="alert") — this banner is ambient cross-page
    // context, not an interrupt. The FirmwareView's in-page lock-conflict
    // region uses role="alert"; doubling up would be screen-reader noise.
    const lockStore = useJobLockStore();
    lockStore.locked = true;

    const wrapper = mountBanner();
    await wrapper.vm.$nextTick();

    const banner = wrapper.find('[role="status"]');
    expect(banner.exists()).toBe(true);
    expect(banner.attributes('aria-live')).toBe('polite');
    expect(banner.text()).toContain('Firmware update in progress');
  });

  it('hides the banner when the lock is held by the firmware view itself (isOwnJob)', async () => {
    // The FirmwareView surfaces its own in-context job UI; the ambient banner
    // would be redundant there. Verify the suppression actually fires when
    // currentJob.jobId matches ownJobId.
    const lockStore = useJobLockStore();
    lockStore.locked = true;
    const firmwareStore = useFirmwareStore();
    firmwareStore.applyJobStarted({
      jobId: 'own-job',
      source: { kind: 'github', version: 'v1.4.2' },
      controllers: [],
      startedAt: '2026-05-12T00:00:00.000Z',
    });
    firmwareStore.ownJobId = 'own-job';

    const wrapper = mountBanner();
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[role="status"]').exists()).toBe(false);
  });

  it('hides the banner when systemStatus.readOnly is true (readonly precedence)', async () => {
    // Read-only is the broader condition: every write surface is already
    // disabled site-wide, and AstrosSystemStatusBanner is already telling
    // the operator why. Stacking the lock banner on top is duplicate noise.
    //
    // Guard: the "renders the ambient banner ... locked is held by another
    // view" test above establishes that the same locked=true setup WITHOUT
    // readOnly renders the banner. This test then asserts the precedence
    // rule: adding readOnly suppresses it.
    useJobLockStore().locked = true;
    useSystemStatusStore().setStatus({ readOnly: true, reasonCode: 'BACKUP_FAILED' });

    const wrapper = mountBanner();
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[role="status"]').exists()).toBe(false);
  });

  it('renders a "View progress" CTA link to /firmware when visible on a non-firmware route', async () => {
    mockRoutePath.value = '/scripts';
    useJobLockStore().locked = true;

    const wrapper = mountBanner();
    await wrapper.vm.$nextTick();

    const cta = wrapper.find('[data-testid="lock-banner-cta"]');
    expect(cta.exists()).toBe(true);
    expect(cta.attributes('href')).toBe('/firmware');
    expect(cta.text()).toContain('View progress');
  });

  it('suppresses the CTA link when the current route is already /firmware', async () => {
    // Defensive guard: isOwnJob already covers the common case, but the
    // banner can briefly be visible on /firmware if the firmware store has
    // already cleared currentJob while the lock state lags. Don't offer a
    // link to the page the operator is already on.
    mockRoutePath.value = '/firmware';
    useJobLockStore().locked = true;
    // No applyJobStarted call → isOwnJob is false → banner would otherwise be
    // visible. This is the race-window we are guarding against.

    const wrapper = mountBanner();
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[role="status"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="lock-banner-cta"]').exists()).toBe(false);
  });
});
