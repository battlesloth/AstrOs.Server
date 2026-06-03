import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('@/api/apiService', () => ({ default: { post: vi.fn(), get: vi.fn() } }));

const toastErrorMock = vi.fn();
vi.mock('@/composables/useToast', () => ({
  useToast: () => ({
    error: toastErrorMock,
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    addToast: vi.fn(),
    removeToast: vi.fn(),
    toasts: { value: [] },
  }),
}));

import apiService from '@/api/apiService';
import StatusView from '../StatusView.vue';
import { usePanicStateStore } from '@/stores/panicState';
import enUS from '@/locales/enUS.json';
import { PANIC_CLEAR } from '@/api/endpoints';

const apiPost = apiService.post as ReturnType<typeof vi.fn>;
const i18n = createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': enUS } });

function mountView(inPanic: boolean) {
  const pinia = createPinia();
  setActivePinia(pinia);
  usePanicStateStore().setState({ inPanicStop: inPanic });
  return mount(StatusView, {
    global: {
      plugins: [pinia, i18n],
      // AstrosLayout pulls in router/nav; render only its main slot. AstrosStatus
      // is the droid image — irrelevant to the clear-panic affordance.
      stubs: {
        AstrosLayout: { template: '<div><slot name="main" /></div>' },
        AstrosStatus: true,
      },
    },
  });
}

describe('StatusView panic clear', () => {
  beforeEach(() => {
    apiPost.mockReset();
    apiPost.mockResolvedValue(undefined);
    toastErrorMock.mockReset();
  });

  it('hides the clear-panic button when not panicked', () => {
    const wrapper = mountView(false);
    expect(wrapper.find('[data-testid="clear-panic"]').exists()).toBe(false);
  });

  it('shows the clear-panic button and clears it on click when panicked', async () => {
    const wrapper = mountView(true);
    const btn = wrapper.find('[data-testid="clear-panic"]');
    expect(btn.exists()).toBe(true);
    await btn.trigger('click');
    await flushPromises();
    expect(apiPost).toHaveBeenCalledWith(PANIC_CLEAR, {});
  });

  it('toasts when the clear request fails', async () => {
    apiPost.mockRejectedValueOnce(new Error('server down'));
    const wrapper = mountView(true);
    await wrapper.find('[data-testid="clear-panic"]').trigger('click');
    await flushPromises();
    expect(toastErrorMock).toHaveBeenCalledTimes(1);
  });
});
