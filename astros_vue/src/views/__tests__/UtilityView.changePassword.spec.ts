import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import enUS from '@/locales/enUS.json';

// Stub the API module so onMounted's settings/controllers fetches don't hit the
// network and so we can control the change-password POST per test.
vi.mock('@/api/apiService', () => ({
  default: {
    get: vi.fn().mockResolvedValue({}),
    post: vi.fn(),
  },
}));

import UtilityView from '@/views/UtilityView.vue';
import apiService from '@/api/apiService';
import { CHANGE_PASSWORD } from '@/api/endpoints';

const post = apiService.post as Mock;

function createTestI18n() {
  return createI18n({
    legacy: false,
    locale: 'enUS',
    fallbackLocale: 'enUS',
    messages: { enUS },
  });
}

// Lightweight modal stub: lets us drive the accept/dirty emits and read the
// error-message prop without exercising the real modal's internals (covered by
// its own spec). The point of this spec is UtilityView's handler logic.
const ModalStub = {
  name: 'AstrosChangePasswordModal',
  props: ['errorMessage'],
  emits: ['cancel', 'accept', 'dirty'],
  template: '<div data-testid="modal-stub" />',
};

function mountView() {
  return mount(UtilityView, {
    global: {
      plugins: [createTestI18n(), createPinia()],
      stubs: {
        AstrosLayout: { template: '<div><slot name="main" /></div>' },
        AstrosChangePasswordModal: ModalStub,
        'v-icon': true,
      },
    },
  });
}

async function openModal(wrapper: VueWrapper) {
  await wrapper.get('[data-testid="change-password-open"]').trigger('click');
  return wrapper.findComponent(ModalStub);
}

const PAYLOAD = { oldPassword: 'oldpw', newPassword: 'newpassword' };

describe('UtilityView — change password handler', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    post.mockReset();
    // The handler logs failures via console.error by design; silence the
    // expected noise on the error-path tests (restoreMocks in vitest.config
    // reinstalls the real console.error after each test).
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('opens the modal when the Change button is clicked', async () => {
    const wrapper = mountView();
    expect(wrapper.findComponent(ModalStub).exists()).toBe(false);
    const modal = await openModal(wrapper);
    expect(modal.exists()).toBe(true);
  });

  it('posts to the change-password endpoint, closes the modal, and shows a success alert', async () => {
    post.mockResolvedValue({ message: 'success' });
    const wrapper = mountView();
    const modal = await openModal(wrapper);

    modal.vm.$emit('accept', PAYLOAD);
    await flushPromises();

    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(CHANGE_PASSWORD, PAYLOAD);
    expect(wrapper.findComponent(ModalStub).exists()).toBe(false);
    expect(wrapper.text()).toContain(enUS.utility_view.change_password_success);
  });

  it('maps a 403 to the "current password incorrect" key and keeps the modal open', async () => {
    post.mockRejectedValue({ response: { status: 403 } });
    const wrapper = mountView();
    const modal = await openModal(wrapper);

    modal.vm.$emit('accept', PAYLOAD);
    await flushPromises();

    expect(modal.props('errorMessage')).toBe('utility_view.current_password_incorrect');
    expect(wrapper.findComponent(ModalStub).exists()).toBe(true);
  });

  it('maps a non-403 server error to the generic change-password error key', async () => {
    post.mockRejectedValue({ response: { status: 500 } });
    const wrapper = mountView();
    const modal = await openModal(wrapper);

    modal.vm.$emit('accept', PAYLOAD);
    await flushPromises();

    expect(modal.props('errorMessage')).toBe('utility_view.change_password_error');
  });

  it('maps a network error (no response) to the generic change-password error key', async () => {
    post.mockRejectedValue(new Error('Network Error'));
    const wrapper = mountView();
    const modal = await openModal(wrapper);

    modal.vm.$emit('accept', PAYLOAD);
    await flushPromises();

    expect(modal.props('errorMessage')).toBe('utility_view.change_password_error');
  });

  it('guards against a double submit (only one POST for two rapid accepts)', async () => {
    // Never-resolving promise keeps the first call in flight.
    post.mockReturnValue(new Promise(() => {}));
    const wrapper = mountView();
    const modal = await openModal(wrapper);

    modal.vm.$emit('accept', PAYLOAD);
    modal.vm.$emit('accept', PAYLOAD);
    await flushPromises();

    expect(post).toHaveBeenCalledTimes(1);
  });

  it('clears the server error when the modal emits dirty', async () => {
    post.mockRejectedValue({ response: { status: 403 } });
    const wrapper = mountView();
    const modal = await openModal(wrapper);

    modal.vm.$emit('accept', PAYLOAD);
    await flushPromises();
    expect(modal.props('errorMessage')).toBe('utility_view.current_password_incorrect');

    modal.vm.$emit('dirty');
    await flushPromises();
    expect(modal.props('errorMessage')).toBe('');
  });
});
