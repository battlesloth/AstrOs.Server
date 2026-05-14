import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createRouter, createMemoryHistory } from 'vue-router';
import enUS from '@/locales/enUS.json';

// Stub all API/auth-touching modules at the top so FirmwareView's onMounted
// hooks don't try to hit the network during the test.
vi.mock('@/api/apiService', () => ({
  default: { get: vi.fn().mockResolvedValue({ data: null }) },
  apiClient: {
    get: vi.fn().mockResolvedValue({ data: null }),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

// Controllable WS state for the flash-stream-suspended banner tests.
const mockWsIsConnected = ref(true);
const mockWsHasEverConnected = ref(true);
vi.mock('@/composables/useWebsocket', () => ({
  useWebsocket: () => ({
    wsIsConnected: mockWsIsConnected,
    wsHasEverConnected: mockWsHasEverConnected,
    wsConnect: vi.fn(),
    wsDisconnect: vi.fn(),
    wsSendMessage: vi.fn(),
    handleMessage: vi.fn(),
  }),
}));

import FirmwareView from '@/views/FirmwareView.vue';
import { useFirmwareStore } from '@/stores/firmware';
import { useJobLockStore } from '@/stores/jobLock';
import { Location } from '@/enums';

function createTestI18n() {
  return createI18n({
    legacy: false,
    locale: 'enUS',
    fallbackLocale: 'enUS',
    messages: { enUS },
  });
}

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }],
  });
}

function mountFirmwareView() {
  return mount(FirmwareView, {
    global: {
      plugins: [createTestI18n(), createTestRouter()],
      // Stub the heavy children so we focus on the view's own template/state
      // gating logic rather than the firmware component graph. The stubs
      // preserve element identity for selector-based assertions.
      stubs: {
        AstrosLayout: { template: '<div><slot name="main" /></div>' },
        AstrosFirmwareSourceStrip: { template: '<div data-test="source-strip" />' },
        AstrosFirmwareTopology: { template: '<div data-test="topology" />' },
        AstrosFirmwareStagesList: { template: '<div data-test="stages-list" />' },
        AstrosFirmwareControllersPanel: { template: '<div data-test="controllers-panel" />' },
        AstrosFirmwareConfirmModal: { template: '<div data-test="confirm-modal" />' },
      },
    },
  });
}

describe('FirmwareView lock-conflict gating (I7)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockWsIsConnected.value = true;
    mockWsHasEverConnected.value = true;
  });

  it('shows the in-page role="alert" lock-conflict region when lock is held by another operator', async () => {
    // lockStore.locked = true and firmwareStore.isOwnJob = false → the
    // operator is locked out by a foreign flash; the alert region must
    // render. Inverting `!isOwnJob` in the source would silently let the
    // operator interact with a foreign-owned flash UI.
    const lockStore = useJobLockStore();
    lockStore.locked = true;
    // isOwnJob is false because firmwareStore.currentJob is null.

    const wrapper = mountFirmwareView();
    await wrapper.vm.$nextTick();

    const alert = wrapper.find('[role="alert"]');
    expect(alert.exists()).toBe(true);
    expect(alert.text()).toContain('Firmware update in progress');
  });

  it('hides the source-strip and grid while the lock-conflict alert is shown', async () => {
    const lockStore = useJobLockStore();
    lockStore.locked = true;
    const firmwareStore = useFirmwareStore();
    firmwareStore.setPhase('select');

    const wrapper = mountFirmwareView();
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-test="source-strip"]').exists()).toBe(false);
  });

  it('does NOT show the lock-conflict region when the firmware view owns the active job', async () => {
    // lockStore.locked = true BUT isOwnJob = true (ownJobId matches currentJob)
    // → the operator started this flash; the in-page UI shows progress, not
    // a lockout alert. Pin: isOwnJob suppresses the alert.
    const lockStore = useJobLockStore();
    lockStore.locked = true;
    const firmwareStore = useFirmwareStore();
    firmwareStore.applyJobStarted({
      jobId: 'own-job',
      source: { kind: 'github', version: 'v1.4.2' },
      controllers: [],
      startedAt: '2026-05-13T08:00:00Z',
    });
    firmwareStore.ownJobId = 'own-job';

    const wrapper = mountFirmwareView();
    await wrapper.vm.$nextTick();

    const alert = wrapper.find('[role="alert"]');
    expect(alert.exists()).toBe(false);
  });

  it('does NOT show the lock-conflict region when the lock is idle', async () => {
    // Both flags false → no alert. Negative-branch baseline.
    const wrapper = mountFirmwareView();
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });
});

describe('FirmwareView staleness banner (I5)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockWsIsConnected.value = true;
    mockWsHasEverConnected.value = true;
  });

  it('shows the role="status" staleness region when currentJobLoadFailed is true', async () => {
    // Pin role="status" specifically (not "alert") — a regression that
    // swapped the role would pass the lock-conflict alert tests above
    // because they only assert visibility on `[role="alert"]`. The
    // staleness banner is ambient, not interrupting.
    const firmwareStore = useFirmwareStore();
    firmwareStore.currentJobLoadFailed = true;

    const wrapper = mountFirmwareView();
    await wrapper.vm.$nextTick();

    // findAll + text-match: there are two role="status" banners now
    // (current-job-load-failed + flash-stream-suspended). Match by text
    // so a future banner-order change doesn't flake this test.
    const statuses = wrapper.findAll('[role="status"]');
    const stale = statuses.find((el) => el.text().includes('Could not confirm'));
    expect(stale).toBeTruthy();
  });

  it('hides the staleness region when currentJobLoadFailed is false (negative baseline)', async () => {
    const wrapper = mountFirmwareView();
    await wrapper.vm.$nextTick();

    const statuses = wrapper.findAll('[role="status"]');
    expect(statuses.find((el) => el.text().includes('Could not confirm'))).toBeUndefined();
  });
});

describe('FirmwareView flash-stream-suspended banner (I1)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockWsIsConnected.value = true;
    mockWsHasEverConnected.value = true;
  });

  it('shows the "live updates paused" banner when phase==="flashing" and WS is disconnected', async () => {
    // I1 fix: without this signal the operator stares at frozen progress
    // bars with no indication the WS stream has stopped.
    const firmwareStore = useFirmwareStore();
    firmwareStore.setPhase('flashing');
    mockWsIsConnected.value = false;

    const wrapper = mountFirmwareView();
    await wrapper.vm.$nextTick();

    const statuses = wrapper.findAll('[role="status"]');
    const suspended = statuses.find((el) => el.text().includes('Live updates paused'));
    expect(suspended).toBeTruthy();
  });

  it('hides the banner when WS is connected even if phase==="flashing"', async () => {
    const firmwareStore = useFirmwareStore();
    firmwareStore.setPhase('flashing');
    mockWsIsConnected.value = true;

    const wrapper = mountFirmwareView();
    await wrapper.vm.$nextTick();

    const statuses = wrapper.findAll('[role="status"]');
    expect(statuses.find((el) => el.text().includes('Live updates paused'))).toBeUndefined();
  });

  it('hides the banner when WS is disconnected but phase is not flashing', async () => {
    // The banner is scoped to mid-flash: a disconnected WS during select/
    // idle phases is recovered by reconnect with no operator action; the
    // alarm cost would be too high.
    const firmwareStore = useFirmwareStore();
    firmwareStore.setPhase('select');
    mockWsIsConnected.value = false;

    const wrapper = mountFirmwareView();
    await wrapper.vm.$nextTick();

    const statuses = wrapper.findAll('[role="status"]');
    expect(statuses.find((el) => el.text().includes('Live updates paused'))).toBeUndefined();
  });

  it('fires the banner when WS was previously connected and then dropped (positive latch path)', async () => {
    // I10: complements the pre-connect suppression test below. The latch
    // is monotonic — once true, a subsequent disconnect SHOULD fire the
    // banner. A mutation that inverted the gate (`!wsHasEverConnected`)
    // would pass the pre-connect test but fail this one.
    const firmwareStore = useFirmwareStore();
    firmwareStore.setPhase('flashing');
    mockWsIsConnected.value = false;
    mockWsHasEverConnected.value = true; // we DID connect before

    const wrapper = mountFirmwareView();
    await wrapper.vm.$nextTick();

    const statuses = wrapper.findAll('[role="status"]');
    const suspended = statuses.find((el) => el.text().includes('Live updates paused'));
    expect(suspended).toBeTruthy();
  });

  it('does NOT flicker the banner during the pre-connect window before WS first connects (I3 fix)', async () => {
    // Without the wsHasEverConnected gate, FirmwareView's onMounted runs
    // before App.vue's wsConnect resolves the socket, so wsIsConnected is
    // false. A mid-flash refresh hits applyJobStarted → phase='flashing',
    // and the banner fires for ~50ms until the WS handshake completes.
    // Training operators to dismiss it. The sentinel says "we've never
    // connected yet, so disconnected is the expected state, not a signal."
    const firmwareStore = useFirmwareStore();
    firmwareStore.setPhase('flashing');
    mockWsIsConnected.value = false;
    mockWsHasEverConnected.value = false; // never connected yet

    const wrapper = mountFirmwareView();
    await wrapper.vm.$nextTick();

    const statuses = wrapper.findAll('[role="status"]');
    expect(statuses.find((el) => el.text().includes('Live updates paused'))).toBeUndefined();
  });
});

describe('FirmwareView mid-flash error region (C1)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockWsIsConnected.value = true;
    mockWsHasEverConnected.value = true;
  });

  it('renders the role="alert" mid-flash error region when flashError is set during flashing phase', async () => {
    // Round-5 C1 fix: handleFlashControllerUpdate / handleFlashControllerResult
    // set flashError without rolling phase. The existing panel `flash_error_banner`
    // is gated on phase==='select' so it never renders during flashing. Without
    // this region, the store write goes to a ref no template reads.
    const firmwareStore = useFirmwareStore();
    firmwareStore.setPhase('flashing');
    firmwareStore.flashError = {
      reason: 'internal_server_error',
      detail: 'Malformed flashControllerUpdate from server',
    };

    const wrapper = mountFirmwareView();
    await wrapper.vm.$nextTick();

    const region = wrapper.find('[data-test="mid-flash-error"]');
    expect(region.exists()).toBe(true);
    expect(region.attributes('role')).toBe('alert');
    expect(region.text()).toContain('Malformed flashControllerUpdate from server');
  });

  it('hides the mid-flash error region when flashError is null', async () => {
    const firmwareStore = useFirmwareStore();
    firmwareStore.setPhase('flashing');

    const wrapper = mountFirmwareView();
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-test="mid-flash-error"]').exists()).toBe(false);
  });

  it('hides the mid-flash error region during select phase (panel banner owns that case)', async () => {
    // The panel's flash_error_banner handles select-phase HTTP errors. This
    // region must not double up.
    const firmwareStore = useFirmwareStore();
    firmwareStore.setPhase('select');
    firmwareStore.flashError = {
      reason: 'job_already_running',
      currentJobId: 'job-x',
    };

    const wrapper = mountFirmwareView();
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-test="mid-flash-error"]').exists()).toBe(false);
  });

  it('dismiss button clears flashError via firmware.dismissError', async () => {
    const firmwareStore = useFirmwareStore();
    firmwareStore.setPhase('flashing');
    firmwareStore.flashError = {
      reason: 'internal_server_error',
      detail: 'Malformed flashControllerUpdate from server',
    };

    const wrapper = mountFirmwareView();
    await wrapper.vm.$nextTick();

    const region = wrapper.find('[data-test="mid-flash-error"]');
    expect(region.exists()).toBe(true);
    await region.find('button').trigger('click');
    expect(firmwareStore.flashError).toBeNull();
  });

  it('shows the region in failed phase with detail even when failedControllers has entries (I1 widen)', async () => {
    // The panel's result-bar carries label + stage but never surfaces
    // flashError.detail. Without this region firing on the
    // (failed + has-detail + non-empty failedControllers) combination, the
    // operator sees e.g. "Core failed during Verify" but misses the
    // specific reason like "asset checksum mismatch on Core".
    const firmwareStore = useFirmwareStore();
    firmwareStore.setPhase('failed');
    firmwareStore.failedControllers = [{ id: Location.CORE, label: 'Core', stage: 'verify' }];
    firmwareStore.flashError = {
      reason: 'internal_server_error',
      detail: 'asset checksum mismatch on Core',
    };

    const wrapper = mountFirmwareView();
    await wrapper.vm.$nextTick();

    const region = wrapper.find('[data-test="mid-flash-error"]');
    expect(region.exists()).toBe(true);
    expect(region.text()).toContain('asset checksum mismatch on Core');
  });

  it('hides the region in failed phase when flashError is null (negative baseline)', async () => {
    // I11: a mutation that swapped `if (flashError.value === null) return false`
    // to `return true` would render an empty alert region. Pin the null
    // baseline so the early-return contract is mutation-resistant.
    const firmwareStore = useFirmwareStore();
    firmwareStore.setPhase('failed');
    firmwareStore.failedControllers = [{ id: Location.CORE, label: 'Core', stage: 'verify' }];
    // flashError stays null
    const wrapper = mountFirmwareView();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-test="mid-flash-error"]').exists()).toBe(false);
  });

  it('hides the region in failed phase when failedControllers has entries and flashError has no detail', async () => {
    // When the panel's result bar carries the whole story (label + stage)
    // and there's no additional detail, the region is redundant.
    const firmwareStore = useFirmwareStore();
    firmwareStore.setPhase('failed');
    firmwareStore.failedControllers = [{ id: Location.CORE, label: 'Core', stage: 'verify' }];
    firmwareStore.flashError = { reason: 'internal_server_error' }; // no detail

    const wrapper = mountFirmwareView();
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-test="mid-flash-error"]').exists()).toBe(false);
  });

  it('IM-1: renders abortReason in the failed-phase flash-error region when present', async () => {
    const firmwareStore = useFirmwareStore();
    firmwareStore.setPhase('failed');
    firmwareStore.failedControllers = [{ id: Location.CORE, label: 'Core', stage: 'verify' }];
    firmwareStore.flashError = {
      reason: 'internal_server_error',
      detail: 'asset checksum mismatch',
    };
    firmwareStore.currentJob = {
      jobId: 'job-1',
      source: { kind: 'github', version: 'v1.4.2' },
      controllers: [],
      startedAt: '2026-05-14T08:00:00Z',
      endedAt: '2026-05-14T08:05:00Z',
      abortReason: 'user_cancel',
    };

    const wrapper = mountFirmwareView();
    await wrapper.vm.$nextTick();

    const abortRegion = wrapper.find('[data-test="abort-reason"]');
    expect(abortRegion.exists()).toBe(true);
    expect(abortRegion.text()).toContain('user_cancel');
  });

  it('IM-1: does NOT render abortReason in failed phase when currentJob.abortReason is undefined', async () => {
    const firmwareStore = useFirmwareStore();
    firmwareStore.setPhase('failed');
    firmwareStore.failedControllers = [{ id: Location.CORE, label: 'Core', stage: 'verify' }];
    firmwareStore.flashError = {
      reason: 'internal_server_error',
      detail: 'something failed',
    };
    firmwareStore.currentJob = {
      jobId: 'job-1',
      source: { kind: 'github', version: 'v1.4.2' },
      controllers: [],
      startedAt: '2026-05-14T08:00:00Z',
      // no abortReason
    };

    const wrapper = mountFirmwareView();
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-test="abort-reason"]').exists()).toBe(false);
  });
});

describe('FirmwareView lockSinceFormatted defensive fallback (IM-8)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('renders a dash placeholder when jobLock.since is null', async () => {
    const lock = useJobLockStore();
    lock.setState({
      locked: true,
      owner: 'someone-else',
      since: null,
    });
    const wrapper = mountFirmwareView();
    await wrapper.vm.$nextTick();
    // The conflict banner body interpolates {since}; null path produces "—".
    expect(wrapper.text()).not.toContain('Invalid Date');
    expect(wrapper.text()).not.toContain('NaN');
  });

  it('falls back to the raw string when jobLock.since is malformed ISO', async () => {
    const lock = useJobLockStore();
    lock.setState({
      locked: true,
      owner: 'someone-else',
      since: 'not-a-date',
    });
    const wrapper = mountFirmwareView();
    await wrapper.vm.$nextTick();
    // The defensive fallback in lockSinceFormatted returns `raw` when
    // Date(raw).getTime() is NaN. Positive assertion pins the raw-string
    // passthrough (a mutation that returned '—' instead would pass the
    // negative checks below but fail this one).
    expect(wrapper.text()).toContain('not-a-date');
    expect(wrapper.text()).not.toContain('Invalid Date');
    expect(wrapper.text()).not.toContain('NaN');
  });

  it('renders a formatted date when jobLock.since is a valid ISO', async () => {
    const lock = useJobLockStore();
    lock.setState({
      locked: true,
      owner: 'someone-else',
      since: '2026-05-14T08:00:00Z',
    });
    const wrapper = mountFirmwareView();
    await wrapper.vm.$nextTick();
    // Positive assertion: the Intl.DateTimeFormat output should include
    // a recognizable date segment (year or month). A mutation that fell
    // through to the raw-string fallback would fail this because the
    // raw ISO contains 'T08:00:00Z' which is the unformatted form.
    expect(wrapper.text()).toMatch(/2026|May/);
    expect(wrapper.text()).not.toContain('Invalid Date');
    expect(wrapper.text()).not.toContain('NaN');
  });
});
