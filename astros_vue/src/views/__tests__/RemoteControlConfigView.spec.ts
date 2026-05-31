import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createRouter, createMemoryHistory } from 'vue-router';
import enUS from '@/locales/enUS.json';

// All API/store-touching modules must be stubbed BEFORE the view is
// imported, otherwise the view's onMounted handler hits the real network
// during tests. The mockGet implementation returns shapes matching what
// each store expects from its respective endpoint.
vi.mock('@/api/apiService', () => ({
  default: {
    get: vi.fn().mockImplementation((url: string) => {
      if (url.includes('remoteConfig')) {
        // remoteControlStore.loadRemoteControl reads JSON.parse(response) — so
        // this must be a STRING containing a parseable array of pages.
        return Promise.resolve(
          JSON.stringify([
            {
              id: 'page-1',
              name: 'Page 1',
              button1: { id: '0', name: 'Button 1', type: 'none' },
              button2: { id: '0', name: 'Button 2', type: 'none' },
              button3: { id: '0', name: 'Button 3', type: 'none' },
              button4: { id: '0', name: 'Button 4', type: 'none' },
              button5: { id: '0', name: 'Button 5', type: 'none' },
              button6: { id: '0', name: 'Button 6', type: 'none' },
              button7: { id: '0', name: 'Button 7', type: 'none' },
              button8: { id: '0', name: 'Button 8', type: 'none' },
              button9: { id: '0', name: 'Button 9', type: 'none' },
            },
          ]),
        );
      }
      // scripts + playlists endpoints both treat the response as an array.
      return Promise.resolve([]);
    }),
    put: vi.fn().mockResolvedValue({ data: 'ok' }),
  },
}));

// Hoisted toast spies — re-bound per test in beforeEach so each test can
// inspect what success/error were called with. Without this, a regression
// that DELETES the error(...) call from a failure branch would still
// pass tests that only assert isDirty/disabled — the toast contract has
// to be pinned too.
// Typed signature mirrors `useToast()`'s `(msg: string) => void` so a
// typo'd `toHaveBeenCalledWith(123)` fails at type-check instead of
// runtime.
const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn<(msg: string) => void>(),
  toastError: vi.fn<(msg: string) => void>(),
}));
vi.mock('@/composables/useToast', () => ({
  useToast: () => ({ success: toastSuccess, error: toastError }),
}));

import RemoteControlConfigView from '@/views/RemoteControlConfigView.vue';
import { useRemoteControlStore } from '@/stores/remoteControl';
import apiService from '@/api/apiService';

const mockedApiGet = apiService.get as ReturnType<typeof vi.fn>;
const mockedApiPut = apiService.put as ReturnType<typeof vi.fn>;

function createTestI18n() {
  return createI18n({
    legacy: false,
    locale: 'en-US',
    fallbackLocale: 'en-US',
    messages: { 'en-US': enUS },
  });
}

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }],
  });
}

function mountView() {
  return mount(RemoteControlConfigView, {
    global: {
      plugins: [createTestI18n(), createTestRouter()],
      stubs: {
        // Preserve the slot so the inner content renders.
        AstrosLayout: { template: '<div><slot name="main" /></div>' },
        AstrosWriteButton: {
          name: 'AstrosWriteButton',
          props: ['disabled'],
          template:
            '<button :disabled="disabled" data-testid="save-config" @click="$emit(\'click\')"><slot /></button>',
        },
        AstrosRemoteButtonCard: {
          name: 'AstrosRemoteButtonCard',
          props: ['value'],
          emits: ['change', 'edit'],
          template: '<div data-testid="card-stub" />',
        },
        AstrosRemotePageList: {
          name: 'AstrosRemotePageList',
          props: ['pages', 'selectedIdx'],
          emits: ['select', 'add', 'duplicate', 'delete', 'rename', 'reorder'],
          template: '<div data-testid="page-list-stub" />',
        },
        AstrosRemoteLivePreview: {
          name: 'AstrosRemoteLivePreview',
          props: ['pages', 'selectedIdx'],
          template: '<div data-testid="preview-stub" />',
        },
        AstrosConfirmModal: {
          name: 'AstrosConfirmModal',
          props: ['title', 'message', 'messageParams', 'onConfirm', 'onClose'],
          // Expose message + messageParams.name as separate data attrs so the
          // test can verify both the i18n key (real modal will $t() it) and
          // the interpolated value (real modal threads it through to $t).
          template:
            '<div data-testid="confirm-modal" :data-message="message" :data-name="(messageParams && messageParams.name) || \'\'"><button data-testid="modal-confirm" @click="onConfirm" /><button data-testid="modal-close" @click="onClose" /></div>',
        },
        AstrosRemoteButtonEditorModal: {
          name: 'AstrosRemoteButtonEditorModal',
          props: ['buttonNumber', 'currentValue', 'scripts', 'playlists'],
          emits: ['change', 'close'],
          template: '<div data-testid="editor-modal" :data-button="buttonNumber" />',
        },
      },
    },
  });
}

function resetMocks() {
  setActivePinia(createPinia());
  toastSuccess.mockClear();
  toastError.mockClear();
  // apiService get/put are swapped via mockImplementation in failure-path
  // tests; those use try/finally to restore the original impl. Clearing
  // call counts here keeps a forgotten restore from leaking call history
  // into a sibling test's assertions.
  mockedApiGet.mockClear();
  mockedApiPut.mockClear();
}

// Module-scoped failure-path helper — used by the initial-loading-state
// suite (testing the loading→error transition) AND the partial-load suite
// (testing each individual endpoint failure). Defined at module scope so
// both consumers can share it.
function mountWithFailingEndpoint(failingUrlMatch: string) {
  const originalImpl = mockedApiGet.getMockImplementation();
  mockedApiGet.mockImplementation((url: string) => {
    if (url.includes(failingUrlMatch)) return Promise.reject(new Error('network'));
    // The remote-config endpoint expects a JSON-parseable string body; the
    // other endpoints expect an array. Match both shapes.
    if (url.includes('remoteConfig')) {
      return Promise.resolve(
        JSON.stringify([
          {
            id: 'page-1',
            name: 'Page 1',
            button1: { id: '0', name: 'Button 1', type: 'none' },
            button2: { id: '0', name: 'Button 2', type: 'none' },
            button3: { id: '0', name: 'Button 3', type: 'none' },
            button4: { id: '0', name: 'Button 4', type: 'none' },
            button5: { id: '0', name: 'Button 5', type: 'none' },
            button6: { id: '0', name: 'Button 6', type: 'none' },
            button7: { id: '0', name: 'Button 7', type: 'none' },
            button8: { id: '0', name: 'Button 8', type: 'none' },
            button9: { id: '0', name: 'Button 9', type: 'none' },
          },
        ]),
      );
    }
    return Promise.resolve([]);
  });
  return { originalImpl };
}

describe('RemoteControlConfigView — initial loading state', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('renders the loading panel and NOT the editor body before Promise.all resolves', () => {
    // Mount but do NOT await flushPromises — the loads are still in flight.
    const wrapper = mountView();

    expect(wrapper.find('[data-testid="initial-loading-state"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="pane-page-list"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="pane-grid"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="pane-preview"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="load-error-state"]').exists()).toBe(false);
  });

  it('Save is disabled during the initial-loading window (even if isDirty somehow flips)', async () => {
    const wrapper = mountView();
    // Don't flush yet. Manually flip isDirty (mimicking a hypothetical
    // mutation pathway during the load window) — Save must STILL be
    // disabled because isInitialLoading=true is the dominant gate.
    const store = useRemoteControlStore();
    store.isDirty = true;

    const saveBtn = wrapper.get('[data-testid="save-config"]');
    expect(saveBtn.attributes('disabled')).toBeDefined();
  });

  it('transitions from loading → editor after all three loads succeed', async () => {
    const wrapper = mountView();
    expect(wrapper.find('[data-testid="initial-loading-state"]').exists()).toBe(true);

    await flushPromises();

    expect(wrapper.find('[data-testid="initial-loading-state"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="pane-page-list"]').exists()).toBe(true);
  });

  it('transitions from loading → error banner if any load fails', async () => {
    const { originalImpl } = mountWithFailingEndpoint('remoteConfig');

    try {
      const wrapper = mountView();
      expect(wrapper.find('[data-testid="initial-loading-state"]').exists()).toBe(true);

      await flushPromises();

      expect(wrapper.find('[data-testid="initial-loading-state"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="load-error-state"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="pane-page-list"]').exists()).toBe(false);
    } finally {
      if (originalImpl) mockedApiGet.mockImplementation(originalImpl);
    }
  });
});

describe('RemoteControlConfigView — header counts + dirty signal', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('renders the header title', async () => {
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.text()).toContain('Remote Control Configuration');
  });

  it('hides the unsaved badge while isDirty is false', async () => {
    const wrapper = mountView();
    await flushPromises();

    // The seeded fixture is a server-returned config, so loadRemoteControl
    // sets isDirty=false (not a fresh seed). Confirm starting state.
    const store = useRemoteControlStore();
    expect(store.isDirty).toBe(false);
    expect(wrapper.find('[data-testid="unsaved-badge"]').exists()).toBe(false);
  });

  it('shows the unsaved badge once isDirty flips true', async () => {
    const wrapper = mountView();
    await flushPromises();

    const store = useRemoteControlStore();
    store.isDirty = true;
    await flushPromises();

    expect(wrapper.find('[data-testid="unsaved-badge"]').exists()).toBe(true);
  });

  it('disables Save when isDirty is false', async () => {
    const wrapper = mountView();
    await flushPromises();

    const saveBtn = wrapper.get('[data-testid="save-config"]');
    expect(saveBtn.attributes('disabled')).toBeDefined();
  });

  it('enables Save once isDirty is true', async () => {
    const wrapper = mountView();
    await flushPromises();

    const store = useRemoteControlStore();
    store.isDirty = true;
    await flushPromises();

    const saveBtn = wrapper.get('[data-testid="save-config"]');
    expect(saveBtn.attributes('disabled')).toBeUndefined();
  });
});

describe('RemoteControlConfigView — page list wiring', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('forwards select emit to store.selectPage', async () => {
    const wrapper = mountView();
    await flushPromises();

    const store = useRemoteControlStore();
    const spy = vi.spyOn(store, 'selectPage');

    const pageList = wrapper.findComponent({ name: 'AstrosRemotePageList' });
    await pageList.vm.$emit('select', 3);

    expect(spy).toHaveBeenCalledWith(3);
  });

  it('forwards add emit to store.addPage', async () => {
    const wrapper = mountView();
    await flushPromises();

    const store = useRemoteControlStore();
    const spy = vi.spyOn(store, 'addPage');

    const pageList = wrapper.findComponent({ name: 'AstrosRemotePageList' });
    await pageList.vm.$emit('add');

    expect(spy).toHaveBeenCalled();
  });

  it('forwards duplicate emit to store.duplicatePage and the page actually duplicates', async () => {
    const wrapper = mountView();
    await flushPromises();

    const store = useRemoteControlStore();
    // Seed a second page so the duplicate idx is in range — without this, the
    // store's out-of-range guard would silently no-op and the spy assertion
    // alone would pass without exercising the real behavior.
    store.addPage();
    await flushPromises();
    const lenBefore = store.remoteControlPages.length;
    const spy = vi.spyOn(store, 'duplicatePage');

    const pageList = wrapper.findComponent({ name: 'AstrosRemotePageList' });
    await pageList.vm.$emit('duplicate', 0);
    await flushPromises();

    expect(spy).toHaveBeenCalledWith(0);
    expect(store.remoteControlPages.length).toBe(lenBefore + 1);
  });

  it('forwards rename emit to store.renamePage', async () => {
    const wrapper = mountView();
    await flushPromises();

    const store = useRemoteControlStore();
    const spy = vi.spyOn(store, 'renamePage');

    const pageList = wrapper.findComponent({ name: 'AstrosRemotePageList' });
    await pageList.vm.$emit('rename', { idx: 0, name: 'Renamed' });

    expect(spy).toHaveBeenCalledWith(0, 'Renamed');
  });

  it('forwards reorder emit to store.reorderPages and the order actually changes', async () => {
    const wrapper = mountView();
    await flushPromises();

    const store = useRemoteControlStore();
    // Seed a second page so the reorder indices are in range — without this,
    // the store's out-of-range guard would silently no-op and the spy
    // assertion alone would pass without exercising the real behavior.
    store.addPage();
    await flushPromises();
    const namesBefore = store.remoteControlPages.map((p) => p.name);
    const spy = vi.spyOn(store, 'reorderPages');

    const pageList = wrapper.findComponent({ name: 'AstrosRemotePageList' });
    await pageList.vm.$emit('reorder', { fromIdx: 0, toIdx: 1 });
    await flushPromises();

    expect(spy).toHaveBeenCalledWith(0, 1);
    expect(store.remoteControlPages.map((p) => p.name)).toEqual([namesBefore[1], namesBefore[0]]);
  });
});

describe('RemoteControlConfigView — delete-confirm modal lifecycle', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('opens the modal on delete emit (modal not visible before)', async () => {
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.find('[data-testid="confirm-modal"]').exists()).toBe(false);

    const pageList = wrapper.findComponent({ name: 'AstrosRemotePageList' });
    await pageList.vm.$emit('delete', 0);

    expect(wrapper.find('[data-testid="confirm-modal"]').exists()).toBe(true);
  });

  it('passes the deleteModal i18n key and the page name into the modal', async () => {
    const wrapper = mountView();
    await flushPromises();

    const pageList = wrapper.findComponent({ name: 'AstrosRemotePageList' });
    await pageList.vm.$emit('delete', 0);

    const modal = wrapper.get('[data-testid="confirm-modal"]');
    // The view passes a real i18n key + params (so the modal can call
    // $t(message, messageParams) without polluting console with intlify
    // "Not found" warnings).
    expect(modal.attributes('data-message')).toBe('remote_control_config.deleteModal.message');
    // Page name "Page 1" comes from the seeded default page.
    expect(modal.attributes('data-name')).toBe('Page 1');
  });

  it('snapshots the page name at request time (no TOCTOU race with concurrent mutations)', async () => {
    // If the page array mutates between open-modal and confirm-click, the
    // rendered name should still be the page's name AT THE TIME of open.
    const wrapper = mountView();
    await flushPromises();

    const store = useRemoteControlStore();
    store.addPage(); // adds page 1
    store.renamePage(1, 'Performance');
    await flushPromises();

    const pageList = wrapper.findComponent({ name: 'AstrosRemotePageList' });
    await pageList.vm.$emit('delete', 1);

    // Simulate a concurrent rename of the same page AFTER the modal opens
    // (e.g., a future websocket-driven sync would do this).
    store.renamePage(1, 'Renamed-after-modal-open');
    await flushPromises();

    const modal = wrapper.get('[data-testid="confirm-modal"]');
    expect(modal.attributes('data-name')).toBe('Performance');
  });

  it('confirm calls store.deletePage with the captured idx and closes the modal', async () => {
    const wrapper = mountView();
    await flushPromises();

    const store = useRemoteControlStore();
    // Seed a second page so deletePage(0) is allowed by the store's
    // length>1 guard.
    store.addPage();
    await flushPromises();
    const spy = vi.spyOn(store, 'deletePage');

    const pageList = wrapper.findComponent({ name: 'AstrosRemotePageList' });
    await pageList.vm.$emit('delete', 0);

    const confirmBtn = wrapper.get('[data-testid="modal-confirm"]');
    await confirmBtn.trigger('click');

    expect(spy).toHaveBeenCalledWith(0);
    expect(wrapper.find('[data-testid="confirm-modal"]').exists()).toBe(false);
  });

  it('cancel closes the modal WITHOUT calling deletePage', async () => {
    const wrapper = mountView();
    await flushPromises();

    const store = useRemoteControlStore();
    const spy = vi.spyOn(store, 'deletePage');

    const pageList = wrapper.findComponent({ name: 'AstrosRemotePageList' });
    await pageList.vm.$emit('delete', 0);

    const closeBtn = wrapper.get('[data-testid="modal-close"]');
    await closeBtn.trigger('click');

    expect(spy).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="confirm-modal"]').exists()).toBe(false);
  });
});

describe('RemoteControlConfigView — button card wiring', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('forwards card change to store.setButton with the current selectedIdx and the iteration key', async () => {
    const wrapper = mountView();
    await flushPromises();

    const store = useRemoteControlStore();
    const spy = vi.spyOn(store, 'setButton');

    const cards = wrapper.findAllComponents({ name: 'AstrosRemoteButtonCard' });
    expect(cards.length).toBe(9);

    const newValue = { id: 's1', name: 'Wave', type: 'script' as const };
    await cards[4]!.vm.$emit('change', newValue); // BUTTON 5 (index 4)

    expect(spy).toHaveBeenCalledWith(0, 'button5', newValue);
  });

  it('uses the current selectedIdx, not a captured stale idx', async () => {
    const wrapper = mountView();
    await flushPromises();

    const store = useRemoteControlStore();
    store.addPage(); // adds + selects page 1
    await flushPromises();
    const spy = vi.spyOn(store, 'setButton');

    const cards = wrapper.findAllComponents({ name: 'AstrosRemoteButtonCard' });
    const newValue = { id: 'p1', name: 'Routine', type: 'playlist' as const };
    await cards[0]!.vm.$emit('change', newValue);

    expect(spy).toHaveBeenCalledWith(1, 'button1', newValue);
  });
});

describe('RemoteControlConfigView — editor modal wiring', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('opens the editor modal for the clicked card (modal absent before)', async () => {
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.find('[data-testid="editor-modal"]').exists()).toBe(false);

    const cards = wrapper.findAllComponents({ name: 'AstrosRemoteButtonCard' });
    await cards[4]!.vm.$emit('edit'); // BUTTON 5 (index 4)
    await flushPromises();

    const modal = wrapper.find('[data-testid="editor-modal"]');
    expect(modal.exists()).toBe(true);
    // 1-based button number derived from the slot key (button5).
    expect(modal.attributes('data-button')).toBe('5');
  });

  it('forwards the modal change to store.setButton for the editing slot, then closes', async () => {
    const wrapper = mountView();
    await flushPromises();

    const store = useRemoteControlStore();
    const spy = vi.spyOn(store, 'setButton');

    const cards = wrapper.findAllComponents({ name: 'AstrosRemoteButtonCard' });
    await cards[4]!.vm.$emit('edit');
    await flushPromises();

    const modal = wrapper.findComponent({ name: 'AstrosRemoteButtonEditorModal' });
    const newValue = { id: 's1', name: 'Wave', type: 'script' as const };
    await modal.vm.$emit('change', newValue);
    await flushPromises();
    await wrapper.vm.$nextTick();

    expect(spy).toHaveBeenCalledWith(0, 'button5', newValue);
    // Selecting a value closes the modal (the v-if drops after the
    // editingButtonKey=null reactivity flush).
    expect(wrapper.find('[data-testid="editor-modal"]').exists()).toBe(false);
  });

  it('close emit dismisses the modal WITHOUT calling setButton', async () => {
    const wrapper = mountView();
    await flushPromises();

    const store = useRemoteControlStore();
    const spy = vi.spyOn(store, 'setButton');

    const cards = wrapper.findAllComponents({ name: 'AstrosRemoteButtonCard' });
    await cards[0]!.vm.$emit('edit');
    await flushPromises();
    expect(wrapper.find('[data-testid="editor-modal"]').exists()).toBe(true);

    const modal = wrapper.findComponent({ name: 'AstrosRemoteButtonEditorModal' });
    await modal.vm.$emit('close');
    await flushPromises();
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-testid="editor-modal"]').exists()).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('RemoteControlConfigView — header pluralization', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('renders singular "page" / "action" at counts of 1', async () => {
    const wrapper = mountView();
    await flushPromises();

    // The seeded fixture is 1 page, 0 actions. Mutate to 1 page, 1 action.
    const store = useRemoteControlStore();
    store.setButton(0, 'button1', { id: 's1', name: 'Wave', type: 'script' });
    await flushPromises();

    expect(wrapper.text()).toContain('1 page · 1 action');
  });

  it('renders plural "pages" / "actions" at counts ≠ 1', async () => {
    const wrapper = mountView();
    await flushPromises();

    // Mutate to 2 pages, 0 actions.
    const store = useRemoteControlStore();
    store.addPage();
    await flushPromises();

    expect(wrapper.text()).toContain('2 pages · 0 actions');
  });
});

describe('RemoteControlConfigView — save failure', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('shows the error toast and leaves isDirty=true when the PUT fails', async () => {
    // Swap the put impl BEFORE mount so the in-mount load isn't affected and
    // only saveConfig sees the rejection.
    const originalImpl = mockedApiPut.getMockImplementation();
    mockedApiPut.mockImplementation(() => Promise.reject(new Error('network')));

    try {
      const wrapper = mountView();
      await flushPromises();

      // Mark dirty so Save is enabled.
      const store = useRemoteControlStore();
      store.isDirty = true;
      await flushPromises();

      const saveBtn = wrapper.get('[data-testid="save-config"]');
      await saveBtn.trigger('click');
      await flushPromises();

      // isDirty must stay true so the user can retry.
      expect(store.isDirty).toBe(true);
      // Save button is still enabled (loadFailed is false, isDirty is true).
      expect(saveBtn.attributes('disabled')).toBeUndefined();
      // Error toast must fire — the user needs to know the save didn't land.
      // Without this assertion, a regression that deletes the error() call
      // in saveConfig would pass on isDirty alone.
      expect(toastError).toHaveBeenCalledWith('Failed to save remote control configuration.');
      expect(toastSuccess).not.toHaveBeenCalled();
    } finally {
      if (originalImpl) {
        mockedApiPut.mockImplementation(originalImpl);
      } else {
        mockedApiPut.mockReset();
        mockedApiPut.mockResolvedValue({ data: 'ok' });
      }
    }
  });

  it('disables Save while a PUT is in flight (prevents duplicate clicks during the network window)', async () => {
    // Hold the PUT open so we can observe the in-flight state without
    // racing against test cleanup.
    let resolvePut: (value: unknown) => void = () => {};
    const originalImpl = mockedApiPut.getMockImplementation();
    mockedApiPut.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePut = resolve;
        }),
    );

    try {
      const wrapper = mountView();
      await flushPromises();

      const store = useRemoteControlStore();
      store.isDirty = true;
      await flushPromises();

      const saveBtn = wrapper.get('[data-testid="save-config"]');
      expect(saveBtn.attributes('disabled')).toBeUndefined();

      // Click → in flight.
      await saveBtn.trigger('click');
      await flushPromises();

      // PUT hasn't resolved yet; isSaving=true should keep Save disabled
      // even though isDirty is still true.
      expect(store.isSaving).toBe(true);
      expect(saveBtn.attributes('disabled')).toBeDefined();

      resolvePut(undefined);
      await flushPromises();

      // After resolve: isSaving=false, isDirty=false → Save disabled by the
      // !isDirty branch instead.
      expect(store.isSaving).toBe(false);
      expect(store.isDirty).toBe(false);
    } finally {
      if (originalImpl) {
        mockedApiPut.mockImplementation(originalImpl);
      } else {
        mockedApiPut.mockReset();
        mockedApiPut.mockResolvedValue({ data: 'ok' });
      }
    }
  });

  it('clears isDirty on a successful save and fires the success toast', async () => {
    const wrapper = mountView();
    await flushPromises();

    const store = useRemoteControlStore();
    store.isDirty = true;
    await flushPromises();

    const saveBtn = wrapper.get('[data-testid="save-config"]');
    await saveBtn.trigger('click');
    await flushPromises();

    expect(store.isDirty).toBe(false);
    expect(toastSuccess).toHaveBeenCalledWith('Remote control configuration saved successfully.');
    expect(toastError).not.toHaveBeenCalled();
  });
});

describe('RemoteControlConfigView — partial load failure', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('disables Save and fires load-error toast when scripts load fails', async () => {
    // Scripts endpoint is the only one that includes "scripts/all" and NOT
    // "all-names" — using "scripts/all" as the URL match would also catch the
    // playlists-store's secondary scripts/all-names GET. Match the more
    // specific path.
    const { originalImpl } = mountWithFailingEndpoint('api/scripts/all');

    try {
      const wrapper = mountView();
      await flushPromises();
      const store = useRemoteControlStore();
      store.isDirty = true;
      await flushPromises();

      expect(wrapper.get('[data-testid="save-config"]').attributes('disabled')).toBeDefined();
      expect(toastError).toHaveBeenCalledWith(
        'Failed to load remote control configuration. Editing is disabled to avoid overwriting saved data.',
      );
    } finally {
      if (originalImpl) mockedApiGet.mockImplementation(originalImpl);
    }
  });

  it('disables Save and fires load-error toast when playlists load fails', async () => {
    const { originalImpl } = mountWithFailingEndpoint('playlists/all');

    try {
      const wrapper = mountView();
      await flushPromises();
      const store = useRemoteControlStore();
      store.isDirty = true;
      await flushPromises();

      expect(wrapper.get('[data-testid="save-config"]').attributes('disabled')).toBeDefined();
      expect(toastError).toHaveBeenCalledWith(
        'Failed to load remote control configuration. Editing is disabled to avoid overwriting saved data.',
      );
    } finally {
      if (originalImpl) mockedApiGet.mockImplementation(originalImpl);
    }
  });

  it('replaces the editor surface with an error-state banner when ANY load fails', async () => {
    // Save-disable on its own doesn't prevent unsavable mutations — the page
    // list / cards / preview were previously still interactive, so addPage /
    // renamePage / setButton calls would flip isDirty=true against a partial
    // state with no way to persist. The error-state banner replaces the
    // 3-pane body so the children aren't in the DOM and can't be mutated.
    const { originalImpl } = mountWithFailingEndpoint('remoteConfig');

    try {
      const wrapper = mountView();
      await flushPromises();

      expect(wrapper.find('[data-testid="load-error-state"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="pane-page-list"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="pane-grid"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="pane-preview"]').exists()).toBe(false);
    } finally {
      if (originalImpl) mockedApiGet.mockImplementation(originalImpl);
    }
  });
});

describe('RemoteControlConfigView — load failure', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('disables Save when remote-config load fails', async () => {
    // Replace the mock impl fully — mockImplementationOnce consumes one CALL,
    // but Promise.all fires three GETs in parallel and the order is not
    // guaranteed, so the once-impl might match a script/playlist URL instead
    // of remoteConfig and leak the rejection to the wrong call.
    const originalImpl = mockedApiGet.getMockImplementation();
    mockedApiGet.mockImplementation((url: string) => {
      if (url.includes('remoteConfig')) return Promise.reject(new Error('network'));
      return Promise.resolve([]);
    });

    try {
      const wrapper = mountView();
      await flushPromises();

      const store = useRemoteControlStore();
      store.isDirty = true; // even if dirty, load-failed must keep Save disabled
      await flushPromises();

      const saveBtn = wrapper.get('[data-testid="save-config"]');
      expect(saveBtn.attributes('disabled')).toBeDefined();
      expect(toastError).toHaveBeenCalledWith(
        'Failed to load remote control configuration. Editing is disabled to avoid overwriting saved data.',
      );
    } finally {
      // Restore for any subsequent tests that import this file.
      if (originalImpl) mockedApiGet.mockImplementation(originalImpl);
    }
  });
});

describe('RemoteControlConfigView — invariant warnings', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('console.warns and does NOT open the modal when delete is emitted with an out-of-range idx', async () => {
    // The AstrosRemotePageList contract never emits an out-of-range idx in
    // practice (it iterates the pages array), but the view-level guard at
    // onDeleteRequest is defensive against a stale-array race. Pin it: a
    // future refactor that removes the guard should break this test.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const wrapper = mountView();
      await flushPromises();

      const pageList = wrapper.findComponent({ name: 'AstrosRemotePageList' });
      await pageList.vm.$emit('delete', 99);
      await flushPromises();

      expect(wrapper.find('[data-testid="confirm-modal"]').exists()).toBe(false);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('onDeleteRequest: idx 99 out of range'),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });
});
