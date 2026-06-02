import { describe, it, expect, beforeEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import enUS from '@/locales/enUS.json';
import AstrosChangePasswordModal from './AstrosChangePasswordModal.vue';

function createTestI18n() {
  return createI18n({
    legacy: false,
    locale: 'enUS',
    fallbackLocale: 'enUS',
    messages: { enUS },
  });
}

function mountModal(props: Record<string, unknown> = {}) {
  return mount(AstrosChangePasswordModal, {
    attachTo: document.body,
    props,
    // v-icon is registered globally in main.ts (oh-vue-icons); stub it here.
    global: { plugins: [createTestI18n()], stubs: { 'v-icon': true } },
  });
}

async function fill(
  wrapper: VueWrapper,
  fields: { current?: string; next?: string; confirm?: string },
) {
  if (fields.current !== undefined)
    await wrapper.find('#change-password-current').setValue(fields.current);
  if (fields.next !== undefined) await wrapper.find('#change-password-new').setValue(fields.next);
  if (fields.confirm !== undefined)
    await wrapper.find('#change-password-confirm').setValue(fields.confirm);
}

describe('AstrosChangePasswordModal', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('renders the modal shell with three labeled password inputs', () => {
    const wrapper = mountModal();
    expect(wrapper.find('dialog.modal').exists()).toBe(true);
    expect(wrapper.find('.modal-backdrop').exists()).toBe(true);
    expect(wrapper.find('#change-password-current').exists()).toBe(true);
    expect(wrapper.find('#change-password-new').exists()).toBe(true);
    expect(wrapper.find('#change-password-confirm').exists()).toBe(true);
    expect(wrapper.find('label[for="change-password-current"]').exists()).toBe(true);

    // Each field must have a distinct accessible name; otherwise a screen
    // reader announces all three as "password".
    const ariaLabels = wrapper
      .findAll('input[type="password"]')
      .map((input) => input.attributes('aria-label'));
    expect(ariaLabels).toHaveLength(3);
    expect(new Set(ariaLabels).size).toBe(3);
    wrapper.unmount();
  });

  it('emits cancel when the Cancel button is clicked', async () => {
    const wrapper = mountModal();
    await wrapper.get('[data-testid="change-password-cancel"]').trigger('click');
    expect(wrapper.emitted('cancel')).toHaveLength(1);
    wrapper.unmount();
  });

  it('emits cancel when the backdrop is clicked', async () => {
    const wrapper = mountModal();
    await wrapper.get('.modal-backdrop').trigger('click');
    expect(wrapper.emitted('cancel')).toHaveLength(1);
    wrapper.unmount();
  });

  it('shows a required error and does not emit accept when current password is empty', async () => {
    const wrapper = mountModal();
    await fill(wrapper, { next: 'newpassword', confirm: 'newpassword' });
    await wrapper.get('[data-testid="change-password-accept"]').trigger('click');

    expect(wrapper.emitted('accept')).toBeUndefined();
    expect(wrapper.get('[data-testid="change-password-error"]').text()).toBe(
      enUS.utility_view.current_password_required,
    );
    wrapper.unmount();
  });

  it('shows a too-short error and does not emit accept when the new password is under 8 chars', async () => {
    const wrapper = mountModal();
    await fill(wrapper, { current: 'oldpw', next: 'short', confirm: 'short' });
    await wrapper.get('[data-testid="change-password-accept"]').trigger('click');

    expect(wrapper.emitted('accept')).toBeUndefined();
    expect(wrapper.get('[data-testid="change-password-error"]').text()).toBe(
      enUS.utility_view.password_too_short,
    );
    wrapper.unmount();
  });

  it('rejects a new password of exactly 7 characters (lower boundary)', async () => {
    const wrapper = mountModal();
    await fill(wrapper, { current: 'oldpw', next: '1234567', confirm: '1234567' });
    await wrapper.get('[data-testid="change-password-accept"]').trigger('click');

    expect(wrapper.emitted('accept')).toBeUndefined();
    expect(wrapper.get('[data-testid="change-password-error"]').text()).toBe(
      enUS.utility_view.password_too_short,
    );
    wrapper.unmount();
  });

  it('shows a mismatch error and does not emit accept when confirmation differs', async () => {
    const wrapper = mountModal();
    await fill(wrapper, { current: 'oldpw', next: 'newpassword', confirm: 'different1' });
    await wrapper.get('[data-testid="change-password-accept"]').trigger('click');

    expect(wrapper.emitted('accept')).toBeUndefined();
    expect(wrapper.get('[data-testid="change-password-error"]').text()).toBe(
      enUS.utility_view.password_mismatch,
    );
    wrapper.unmount();
  });

  it('emits accept with the old and new passwords when valid', async () => {
    const wrapper = mountModal();
    await fill(wrapper, { current: 'oldpw', next: 'newpassword', confirm: 'newpassword' });
    await wrapper.get('[data-testid="change-password-accept"]').trigger('click');

    expect(wrapper.emitted('accept')).toHaveLength(1);
    expect(wrapper.emitted('accept')![0]![0]).toEqual({
      oldPassword: 'oldpw',
      newPassword: 'newpassword',
    });
    wrapper.unmount();
  });

  it('accepts a new password of exactly 8 characters', async () => {
    const wrapper = mountModal();
    await fill(wrapper, { current: 'oldpw', next: '12345678', confirm: '12345678' });
    await wrapper.get('[data-testid="change-password-accept"]').trigger('click');

    expect(wrapper.emitted('accept')).toHaveLength(1);
    wrapper.unmount();
  });

  it('submits via the Enter key when inputs are valid', async () => {
    const wrapper = mountModal();
    await fill(wrapper, { current: 'oldpw', next: 'newpassword', confirm: 'newpassword' });
    await wrapper.find('#change-password-new').trigger('keydown.enter');

    expect(wrapper.emitted('accept')).toHaveLength(1);
    expect(wrapper.emitted('accept')![0]![0]).toEqual({
      oldPassword: 'oldpw',
      newPassword: 'newpassword',
    });
    wrapper.unmount();
  });

  it('clears a client-side validation error once the user edits a field', async () => {
    const wrapper = mountModal();
    await wrapper.get('[data-testid="change-password-accept"]').trigger('click');
    expect(wrapper.find('[data-testid="change-password-error"]').exists()).toBe(true);

    await fill(wrapper, { current: 'oldpw' });
    expect(wrapper.find('[data-testid="change-password-error"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('emits dirty when the user edits a field, so the parent can clear a server error', async () => {
    const wrapper = mountModal({ errorMessage: 'utility_view.current_password_incorrect' });
    await fill(wrapper, { current: 'x' });
    expect(wrapper.emitted('dirty')).toBeTruthy();
    wrapper.unmount();
  });

  it('allows a new password identical to the current one (length-only rule)', async () => {
    const wrapper = mountModal();
    await fill(wrapper, { current: 'samepass', next: 'samepass', confirm: 'samepass' });
    await wrapper.get('[data-testid="change-password-accept"]').trigger('click');

    expect(wrapper.emitted('accept')).toHaveLength(1);
    expect(wrapper.emitted('accept')![0]![0]).toEqual({
      oldPassword: 'samepass',
      newPassword: 'samepass',
    });
    wrapper.unmount();
  });

  it('displays a server-side error supplied via the errorMessage prop', () => {
    const wrapper = mountModal({ errorMessage: 'utility_view.current_password_incorrect' });
    expect(wrapper.get('[data-testid="change-password-error"]').text()).toBe(
      enUS.utility_view.current_password_incorrect,
    );
    wrapper.unmount();
  });
});
