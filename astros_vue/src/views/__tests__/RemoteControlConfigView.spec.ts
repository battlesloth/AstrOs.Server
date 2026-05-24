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

vi.mock('@/composables/useToast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

import RemoteControlConfigView from '@/views/RemoteControlConfigView.vue';
import { useRemoteControlStore } from '@/stores/remoteControl';

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
          props: ['disabled'],
          template:
            '<button :disabled="disabled" data-testid="save-config" @click="$emit(\'click\')"><slot /></button>',
        },
        AstrosRemoteButtonCard: {
          name: 'AstrosRemoteButtonCard',
          props: ['buttonNumber', 'value', 'scripts', 'playlists'],
          emits: ['change'],
          template: '<div data-testid="card-stub" :data-button="buttonNumber" />',
        },
        AstrosRemotePageList: {
          name: 'AstrosRemotePageList',
          props: ['pages', 'selectedIdx'],
          emits: ['select', 'add', 'duplicate', 'delete', 'rename'],
          template: '<div data-testid="page-list-stub" />',
        },
        AstrosRemoteLivePreview: {
          name: 'AstrosRemoteLivePreview',
          props: ['pages', 'selectedIdx'],
          template: '<div data-testid="preview-stub" />',
        },
        AstrosConfirmModal: {
          name: 'AstrosConfirmModal',
          props: ['title', 'message', 'onConfirm', 'onClose'],
          template:
            '<div data-testid="confirm-modal" :data-message="message"><button data-testid="modal-confirm" @click="onConfirm" /><button data-testid="modal-close" @click="onClose" /></div>',
        },
      },
    },
  });
}

describe('RemoteControlConfigView — header counts + dirty signal', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
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
    setActivePinia(createPinia());
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

  it('forwards duplicate emit to store.duplicatePage', async () => {
    const wrapper = mountView();
    await flushPromises();

    const store = useRemoteControlStore();
    const spy = vi.spyOn(store, 'duplicatePage');

    const pageList = wrapper.findComponent({ name: 'AstrosRemotePageList' });
    await pageList.vm.$emit('duplicate', 2);

    expect(spy).toHaveBeenCalledWith(2);
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
});

describe('RemoteControlConfigView — delete-confirm modal lifecycle', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('opens the modal on delete emit (modal not visible before)', async () => {
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.find('[data-testid="confirm-modal"]').exists()).toBe(false);

    const pageList = wrapper.findComponent({ name: 'AstrosRemotePageList' });
    await pageList.vm.$emit('delete', 0);

    expect(wrapper.find('[data-testid="confirm-modal"]').exists()).toBe(true);
  });

  it('interpolates the page name into the modal message', async () => {
    const wrapper = mountView();
    await flushPromises();

    const pageList = wrapper.findComponent({ name: 'AstrosRemotePageList' });
    await pageList.vm.$emit('delete', 0);

    const modal = wrapper.get('[data-testid="confirm-modal"]');
    // The stub forwards `:message` to a data attribute. The pre-resolved
    // message should include "Page 1" (the seeded default page's name).
    expect(modal.attributes('data-message')).toContain('Page 1');
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
    setActivePinia(createPinia());
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

describe('RemoteControlConfigView — load failure', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('disables Save when remote-config load fails', async () => {
    // Replace the mock impl fully — mockImplementationOnce consumes one CALL,
    // but Promise.all fires three GETs in parallel and the order is not
    // guaranteed, so the once-impl might match a script/playlist URL instead
    // of remoteConfig and leak the rejection to the wrong call.
    const apiServiceModule = await import('@/api/apiService');
    const mockedGet = apiServiceModule.default.get as ReturnType<typeof vi.fn>;
    const originalImpl = mockedGet.getMockImplementation();
    mockedGet.mockImplementation((url: string) => {
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
    } finally {
      // Restore for any subsequent tests that import this file.
      if (originalImpl) mockedGet.mockImplementation(originalImpl);
    }
  });
});
