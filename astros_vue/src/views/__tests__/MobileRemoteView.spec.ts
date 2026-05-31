import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { createPinia } from 'pinia';

vi.mock('@/api/apiService', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), clearToken: vi.fn() },
}));

const pushMock = vi.fn();
vi.mock('vue-router', () => ({ useRouter: () => ({ push: pushMock }) }));

import apiService from '@/api/apiService';
import MobileRemoteView from '../MobileRemoteView.vue';
import AstrosMobileRemote from '@/components/mobileRemote/mobileRemote/AstrosMobileRemote.vue';
import AstrosMobileStatus from '@/components/mobileRemote/mobileStatus/AstrosMobileStatus.vue';
import AstrosMobileTopBar from '@/components/mobileRemote/mobileTopBar/AstrosMobileTopBar.vue';
import enUS from '@/locales/enUS.json';
import { SCRIPTS_RUN, PLAYLISTS_RUN, PANIC_STOP } from '@/api/endpoints';

const apiGet = apiService.get as ReturnType<typeof vi.fn>;
const apiPost = apiService.post as ReturnType<typeof vi.fn>;
const apiClearToken = apiService.clearToken as ReturnType<typeof vi.fn>;

const i18n = createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': enUS } });

function mountView() {
  return mount(MobileRemoteView, {
    global: {
      plugins: [createPinia(), i18n],
      stubs: { 'v-icon': { template: '<span></span>' } },
    },
  });
}

describe('MobileRemoteView', () => {
  beforeEach(() => {
    apiGet.mockReset();
    apiPost.mockReset();
    apiClearToken.mockReset();
    pushMock.mockReset();
    // loadRemoteControl parses this as the (empty) saved config → seeds a page.
    apiGet.mockResolvedValue('[]');
    apiPost.mockResolvedValue(undefined);
  });

  it('runs a script when a script button is pressed', async () => {
    const wrapper = mountView();
    await flushPromises();
    wrapper
      .findComponent(AstrosMobileRemote)
      .vm.$emit('press', { id: 's-1', name: 'Wave', type: 'script' });
    await flushPromises();
    expect(apiGet).toHaveBeenCalledWith(SCRIPTS_RUN, { id: 's-1' });
  });

  it('runs a playlist when a playlist button is pressed', async () => {
    const wrapper = mountView();
    await flushPromises();
    wrapper
      .findComponent(AstrosMobileRemote)
      .vm.$emit('press', { id: 'p-1', name: 'Show', type: 'playlist' });
    await flushPromises();
    expect(apiGet).toHaveBeenCalledWith(PLAYLISTS_RUN, { id: 'p-1' });
  });

  it('sends panic stop on the panic event', async () => {
    const wrapper = mountView();
    await flushPromises();
    wrapper.findComponent(AstrosMobileRemote).vm.$emit('panic');
    await flushPromises();
    expect(apiPost).toHaveBeenCalledWith(PANIC_STOP, {});
  });

  it('toggles between the remote and status screens', async () => {
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.findComponent(AstrosMobileRemote).exists()).toBe(true);
    expect(wrapper.findComponent(AstrosMobileStatus).exists()).toBe(false);

    wrapper.findComponent(AstrosMobileTopBar).vm.$emit('toggle');
    await flushPromises();
    expect(wrapper.findComponent(AstrosMobileStatus).exists()).toBe(true);
    expect(wrapper.findComponent(AstrosMobileRemote).exists()).toBe(false);

    wrapper.findComponent(AstrosMobileTopBar).vm.$emit('toggle');
    await flushPromises();
    expect(wrapper.findComponent(AstrosMobileRemote).exists()).toBe(true);
  });

  it('logs out from the status screen', async () => {
    const wrapper = mountView();
    await flushPromises();
    wrapper.findComponent(AstrosMobileTopBar).vm.$emit('toggle'); // → status
    await flushPromises();
    wrapper.findComponent(AstrosMobileStatus).vm.$emit('logout');
    await flushPromises();
    expect(apiClearToken).toHaveBeenCalled();
    expect(pushMock).toHaveBeenCalledWith('/auth');
  });
});
