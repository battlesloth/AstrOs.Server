import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import enUS from '@/locales/enUS.json';
import AstrosFirmwareConfirmModal from '../AstrosFirmwareConfirmModal.vue';
import type { FirmwareControllerView } from '@/types/firmware';

function createTestI18n() {
  return createI18n({
    legacy: false,
    locale: 'enUS',
    fallbackLocale: 'enUS',
    messages: { enUS },
  });
}

// jsdom doesn't implement HTMLDialogElement.showModal/close natively in older
// builds; stub the methods so the modal's `watch` doesn't throw when it tries
// to drive the imperative API.
beforeEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HTMLDialogElement.prototype as any).showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HTMLDialogElement.prototype as any).close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
});

const upgradeBody: FirmwareControllerView = {
  id: 'body',
  label: 'Body',
  glyph: 'B',
  isMaster: true,
  current: 'v1.3.0',
  status: 'up',
};

const downgradeCore: FirmwareControllerView = {
  id: 'core',
  label: 'Core',
  glyph: 'C',
  isMaster: false,
  current: 'v1.4.0',
  status: 'up',
};

function mountModal(props: Record<string, unknown>) {
  return mount(AstrosFirmwareConfirmModal, {
    props: { open: true, sourceMode: 'github', ...props } as never,
    global: {
      plugins: [createTestI18n()],
      stubs: {
        AstrosFirmwareButton: {
          props: ['disabled', 'kind'],
          emits: ['click'],
          template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
        },
        AstrosFirmwareVersionDelta: { template: '<span />' },
      },
    },
  });
}

describe('AstrosFirmwareConfirmModal downgrade ack region', () => {
  it('does NOT render the ack region on pure-upgrade selection', () => {
    const wrapper = mountModal({
      target: 'v1.4.2',
      selectedControllers: [upgradeBody],
    });
    expect(wrapper.find('[data-test="downgrade-ack-region"]').exists()).toBe(false);
  });

  it('renders the ack region when at least one selected controller would downgrade', () => {
    const wrapper = mountModal({
      target: 'v1.3.5',
      selectedControllers: [upgradeBody, downgradeCore],
    });
    const region = wrapper.find('[data-test="downgrade-ack-region"]');
    expect(region.exists()).toBe(true);
    // Assert on the interpolated count via word-boundary regex so a future
    // pluralization refactor (`{count, plural, …}`) doesn't break the test.
    expect(region.text()).toMatch(/\b1\b/);
  });

  it('does NOT render the ack region when target is null', () => {
    // Defensive: target=null is a misuse path (the view doesn't open the
    // modal until a target is set), but the modal must not crash and the
    // ack region must stay hidden — there's no downgrade to ack against.
    const wrapper = mountModal({
      target: null,
      selectedControllers: [downgradeCore],
    });
    expect(wrapper.find('[data-test="downgrade-ack-region"]').exists()).toBe(false);
  });

  it('disables Confirm when selectedControllers is empty (defensive)', () => {
    // Without this gate, opening the modal with no selection (misuse from a
    // future caller or a test fixture) would render a clickable Confirm.
    // The parent's canFlash gate stops the actual flash, but the modal
    // shouldn't lie about its enabled state.
    const wrapper = mountModal({
      target: 'v1.4.2',
      selectedControllers: [],
    });
    const confirm = wrapper.find('[data-test="confirm-button"]');
    expect(confirm?.attributes('disabled')).toBeDefined();
  });

  it('does NOT render the ack region for local-build (upload) target', () => {
    // compareTags('v1.4.0', 'local-build') is NaN; the modal must treat NaN
    // as "not a downgrade" so upload flows don't fire spurious acks.
    const wrapper = mountModal({
      target: 'local-build',
      uploadedFilename: 'astros-esp-dev.bin',
      sourceMode: 'upload',
      selectedControllers: [downgradeCore],
    });
    expect(wrapper.find('[data-test="downgrade-ack-region"]').exists()).toBe(false);
  });

  it('disables Confirm until the ack checkbox is ticked', async () => {
    const wrapper = mountModal({
      target: 'v1.3.5',
      selectedControllers: [downgradeCore],
    });
    const confirm = wrapper.find('[data-test="confirm-button"]');
    expect(confirm.exists()).toBe(true);
    expect(confirm.attributes('disabled')).toBeDefined();

    await wrapper.find('[data-test="downgrade-ack-checkbox"]').setValue(true);
    // Re-query so the wrapper sees the post-reactivity disabled attr.
    expect(wrapper.find('[data-test="confirm-button"]').attributes('disabled')).toBeUndefined();
  });

  it('Confirm click is a no-op while ack is unticked (no emit)', async () => {
    const wrapper = mountModal({
      target: 'v1.3.5',
      selectedControllers: [downgradeCore],
    });
    const confirm = wrapper.find('[data-test="confirm-button"]');
    await confirm?.trigger('click');
    expect(wrapper.emitted('confirm')).toBeUndefined();
  });

  it("emits 'confirm' once ack is ticked and the button is clicked", async () => {
    const wrapper = mountModal({
      target: 'v1.3.5',
      selectedControllers: [downgradeCore],
    });
    await wrapper.find('[data-test="downgrade-ack-checkbox"]').setValue(true);
    const confirm = wrapper.find('[data-test="confirm-button"]');
    await confirm?.trigger('click');
    expect(wrapper.emitted('confirm')).toHaveLength(1);
  });

  it('resets the ack to false on reopen (close → open cycle)', async () => {
    // The watcher resets `downgradeAck` to false each time `open` transitions
    // to true. Without this reset, a previous "yes I understand" would re-arm
    // Confirm for the next flash attempt without operator awareness.
    const wrapper = mountModal({
      open: true,
      target: 'v1.3.5',
      selectedControllers: [downgradeCore],
    });
    await wrapper.find('[data-test="downgrade-ack-checkbox"]').setValue(true);
    const confirmBefore = wrapper.find('[data-test="confirm-button"]');
    expect(confirmBefore?.attributes('disabled')).toBeUndefined();

    await wrapper.setProps({ open: false });
    await wrapper.setProps({ open: true });

    const confirmAfter = wrapper.find('[data-test="confirm-button"]');
    expect(confirmAfter?.attributes('disabled')).toBeDefined();
    const checkbox = wrapper.find<HTMLInputElement>('[data-test="downgrade-ack-checkbox"]');
    expect(checkbox.element.checked).toBe(false);
  });
});
